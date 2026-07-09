# Plan: Lifted Clear-Glass Panes + Real Drag/Resize + Proactive AI Toasts

## 1. Clear glass + dramatic lift

Rework the `.glass-panel` utility in `src/styles.css` so every floating pane reads as a lifted glass slab over the nebula background:

- Background: near-transparent tint (`oklch(0.22 0.04 260 / 0.18)`) so the nebula stays visible.
- Blur: strong (`backdrop-filter: blur(22px) saturate(140%)`).
- Border: 1px hairline in `oklch(1 0 0 / 0.14)` for the top/left rim highlight.
- Shadow: layered ambient + contact:
  - `0 30px 60px -20px oklch(0 0 0 / 0.55)` (deep ambient)
  - `0 10px 24px -12px oklch(0 0 0 / 0.45)` (contact)
  - `inset 0 1px 0 oklch(1 0 0 / 0.10)` (top-edge highlight)
- Subtle cyan/violet outer glow via a secondary shadow tinted from the theme.
- Add a `.glass-panel--lifted` state applied while dragging (stronger shadow + 1.005 scale) so panes visibly "pick up".

Verify Chrome renders `backdrop-filter` (no `-webkit-` next to standard, per tailwind4-backdrop-filter rule).

## 2. Fix drag/resize so panes actually move

Symptoms today: pointer-down on the title bar does nothing on the live site. Two likely causes to fix in `FloatingPane.tsx` + `PaneCanvas.tsx`:

1. Canvas height is `calc(100vh - 210px)` with `overflow-hidden`; on the current viewport that measures 0 or negative in some layouts, so `clampRect` snaps every pane to `{x:0,y:0}` and further moves clamp back. Change canvas to a real flex-grow container with a minimum height and remove the hard `calc` so `ResizeObserver` reports a stable size.
2. `onPointerDown` calls `setPointerCapture` on `e.target`, but the target is often a child (icon, span) that unmounts on state change, breaking capture. Capture on `e.currentTarget` (the title bar / resize handle) instead, and attach `pointermove`/`pointerup` on the same element.

Also:
- Ensure the resize handle sits above the content (`z-index`) and isn't blocked by the scroll area.
- Add a visible hover/drag cursor and a small "grip" affordance on the top bar.
- Persist geometry per preset (already wired) — no store changes needed beyond confirming rects survive reload.

## 3. Extend floating desk to Home dashboard

Home currently uses stacked cards. Wrap the Home grid in a `PaneCanvas` with `Floating`/`Stacked` toggle (default Floating on desktop, Stacked on narrow). Convert these cards into `FloatingPane`s with sensible percent defaults:

- Greeting / Shift, Overview, Alert Center, Next Best Action, Night Plan, Recently Completed, Lookup Cards.

Each pane keeps its existing content; only the outer wrapper changes. Layout preset key: `home`.

## 4. Proactive AI toasts (Toast + Copilot pulse)

The rule-based `useInsights()` already computes the four triggers we want:

- Long task (>25m on current item)
- Recurring account on the open ticket
- Stuck waiting tickets (>2d)
- Idle with open work

Add a top-level `InsightToaster` mounted in `__root.tsx` (or `AppShell`) that:

- Subscribes to `useInsights()`.
- Tracks fired IDs in a `Set` inside a ref so the same insight doesn't re-toast until it clears and returns.
- When a new `high`/`warn` insight appears, fires a `sonner` toast with:
  - severity-colored accent (`high` = amber, `warn` = cyan)
  - the insight text
  - an "Open" action that navigates to `insight.to` with `insight.params`
  - a "Dismiss" close
- `info` insights only pulse the Copilot dot (existing behavior), no toast.
- Debounce: at most one toast per 20s per severity to avoid spam.
- Respect a "Quiet mode" toggle stored in `display-prefs-store` (add a checkbox in Settings → Display) so the operator can silence toasts while keeping the pulse.

No new triggers or AI calls — this reuses the existing deterministic insight layer so it's instant and free. The Copilot's reasoned "What should I focus on?" answer remains on-demand.

## Technical notes

- Files touched:
  - `src/styles.css` — `.glass-panel` rework + `--lifted` variant.
  - `src/components/workspace/FloatingPane.tsx` — pointer capture on `currentTarget`, lifted class while dragging, resize-handle z-index.
  - `src/components/workspace/PaneCanvas.tsx` — replace fixed `calc(100vh - 210px)` with flex-based sizing + `min-h`.
  - `src/routes/_authenticated/index.tsx` + `src/components/home/*` — wrap Home cards in `PaneCanvas` + `FloatingPane` with a `home` preset.
  - New `src/components/workspace/InsightToaster.tsx` — mounted in `AppShell`.
  - `src/lib/settings/display-prefs-store.ts` — add `quietInsights: boolean`.
  - `src/components/settings/*` — expose the Quiet mode toggle.
- No schema/backend changes.
- No new dependencies; `sonner` is already in the stack.

## Verification

- Drag any pane title bar → pane follows cursor; drop → shadow drops.
- Resize handle → pane resizes; geometry persists across reload.
- Reset button → panes return to defaults.
- Home page shows the same floating desk with its own preset + Stacked fallback.
- Nebula background is clearly visible through every pane; panes cast a real shadow.
- Open a ticket, leave it for 25 min (or shortcut the threshold in dev) → sonner toast appears bottom-right with an Open action; Copilot dot pulses.
- Quiet mode on → no toast, dot still pulses.
