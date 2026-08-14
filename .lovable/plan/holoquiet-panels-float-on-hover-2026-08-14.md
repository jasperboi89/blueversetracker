# HoloQuiet: Panels Float on Hover

**Goal:** In the HoloQuiet theme, hovering any active pane makes it visibly lift off the background — a real "floating card" effect, not the current 1px nudge.

## What changes visually

- Hover on a panel: it rises about 6px toward you, scales up ~1% and casts a longer, softer shadow underneath — so the depth reads as an object above the surface.
- The panel's rim brightens slightly as it lifts (light and motion stay linked, matching the current HoloQuiet language).
- Movement is quick and smooth (~200ms, existing easing), and it settles back down on mouse-out and presses back to flat on click.
- The hovered pane also comes to the front, so it never lifts *behind* a neighbouring card.

## Where it applies

- Applies to: content panes/cards in the workspace (`.glass-panel`, `.hq-working`, `.hq-instrument`).
- Does NOT apply to: modals, sheets, drawers, popovers, dropdowns, tooltips, the sidebar, and the sticky header — those keep their fixed positioning contract untouched.
- Reduced-motion users keep the shadow/rim change but no movement.

## Technical notes

- Single edit in `src/styles.css`, in the existing "Interaction depth" section of the HoloQuiet block; replace the current `translateY(-1px)` hover rules with a shared lift token (e.g. `--hq-lift-float: -6px`) plus `scale(1.008)` and a layered elevated shadow.
- Exclusions expressed with `:not([data-slot="dialog-content"]):not([data-slot="alert-dialog-content"]):not([data-slot="sheet-content"]):not([data-slot="popover-content"])`, keeping the existing modal-surface contract at the bottom of the file authoritative.
- Add `position: relative; z-index: 3;` on hover only, so the lifted pane stacks above siblings without changing static layout.
- Keep both reduced-motion guards (`@media prefers-reduced-motion` and `html[data-motion="reduced"]`) overriding transform to `none`.
- Extend `src/components/ui/dialog-layer.test.tsx` (or the theme CSS test) with an assertion that the float rules exclude dialog/sheet slots, so this can't regress modal positioning again.
