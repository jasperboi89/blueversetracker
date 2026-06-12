# Quantum Bloom — Phase 2

Phase 1 shipped the theme toggle, WebGL nebula, aurora phases, and entry sequence. Phase 2 layers in two systems on top of the existing Quantum Bloom theme:

1. **Celebration system** — visual rewards when meaningful work completes.
2. **Discovery Log** — a permanent, per-user record of unlocked moments, viewable from a new "Discoveries" entry in Settings → Themes → Quantum Bloom.

Both are gated to `theme === 'quantum-bloom'`. BlueVerse stays untouched. Deferred to Phase 3: Sanctuary, Constellations, Archive, Adaptive Learning (Core), Cosmic Weather, event/particle sliders.

## What you get in Phase 2

**Celebrations** (only fire while Quantum Bloom is active):
- **Ticket completion** — soft cyan bloom + a single particle burst from the completion button. ~1.2 s. No modal, no blocking.
- **Contact Dispatch testing completion** — radial spectral wave from screen center, "Test cycle complete" glyph, 2.2 s. Reuses the existing `CelebrationOverlay` design language.
- **Night Plan completion** — golden bloom ring + "Night Plan complete" caption, 2.6 s.
- **Shift completion** — full aurora curtain sweep (top-to-bottom gradient wash through all 6 phase colors), 3.5 s, plus a "Shift complete · Good morning" card. The existing BlueVerse shift-complete celebration stays for the default theme; Quantum Bloom gets its own variant.
- A single global queue prevents two celebrations stacking. If two fire within 400 ms they merge into one wave.

**Discovery Log**:
- Each celebration also records a **Discovery** row — type, label, timestamp, optional context (ticket id, dispatch session id, night plan date).
- New discoveries appear as a subtle 3-second "★ Discovery unlocked: <label>" toast in the bottom-right.
- Settings → Themes → Quantum Bloom now exposes an enabled **"Discovery Log"** link → opens a drawer listing all discoveries grouped by date, with counts per type and a "Reset Discoveries" button (confirm modal, clears the user's rows).

## What's deferred (Phase 3)

Sanctuary, Constellation View, Archive (long-term aggregates), Quantum Bloom Core (adaptive learning), Cosmic Weather, event-frequency / particle-density / visual-intensity sliders.

## Technical section

**New table — `public.qb_discoveries`**
- `id uuid pk default gen_random_uuid()`
- `user_id uuid not null references auth.users(id) on delete cascade`
- `kind text not null check (kind in ('ticket','dispatch','night_plan','shift'))`
- `label text not null`
- `context jsonb not null default '{}'::jsonb`
- `created_at timestamptz not null default now()`
- RLS: user can select/insert/delete own rows (`auth.uid() = user_id`). GRANTs for `authenticated` + `service_role`. Index on `(user_id, created_at desc)`.

**Server functions** — `src/lib/quantum-bloom/discoveries.functions.ts`
- `listDiscoveries()` → returns user's rows, newest first, capped at 500.
- `recordDiscovery({ kind, label, context })` → inserts.
- `resetDiscoveries()` → deletes all of caller's rows.
All use `requireSupabaseAuth`.

**Celebration runtime** — `src/lib/quantum-bloom/celebration-bus.ts`
- Tiny event bus (`emit`, `subscribe`) with debounced merge window (400 ms).
- `triggerCelebration({ kind, label, context })` — emits + fires `recordDiscovery` (best-effort, swallowed on error).
- Gated by `useTheme() === 'quantum-bloom'` at the call sites — bus is a no-op otherwise.

**Components**
- `src/components/quantum-bloom/CelebrationLayer.tsx` — mounted in `__root.tsx` inside the Quantum Bloom branch. Renders the active celebration via Framer Motion / CSS keyframes. Variants: `ticket`, `dispatch`, `nightPlan`, `shift`.
- `src/components/quantum-bloom/DiscoveryToast.tsx` — bottom-right slide-in for the 3-second unlock toast (subscribes to the same bus).
- `src/components/quantum-bloom/DiscoveryLogDrawer.tsx` — Sheet listing discoveries grouped by day with type icons and "Reset" action.
- Update `src/components/settings/ThemesSection.tsx` — flip "Discovery Log" from disabled "Coming soon" to an enabled button that opens the drawer; counts shown next to label.

**Call sites that emit celebrations**
- `src/lib/tickets-store.ts` — in the function that marks a ticket complete, after persisting, call `triggerCelebration({ kind: 'ticket', label: 'Ticket completed', context: { ticketId } })`.
- `src/lib/dispatch-store.ts` — on overall result transitioning to `complete`, emit `kind: 'dispatch'`.
- `src/lib/night-plan-store.ts` — on plan marked complete, emit `kind: 'night_plan'`.
- Existing shift-complete trigger (currently rendering BlueVerse `CelebrationOverlay`) — when theme is `quantum-bloom`, route to the bus with `kind: 'shift'` instead, suppressing the BlueVerse overlay.

**Performance**
- Celebrations use CSS transforms + GPU compositing only. No new shaders, no per-frame React state.
- Toast and overlay both auto-unmount after their animation ends.
- Visibility-change listener pauses the queue when the tab is hidden (consistent with the nebula).

**Files to add**
- `supabase/migrations/<ts>_qb_discoveries.sql`
- `src/lib/quantum-bloom/celebration-bus.ts`
- `src/lib/quantum-bloom/discoveries.functions.ts`
- `src/hooks/use-discoveries.ts` (small wrapper around the server fns + local cache)
- `src/components/quantum-bloom/CelebrationLayer.tsx`
- `src/components/quantum-bloom/DiscoveryToast.tsx`
- `src/components/quantum-bloom/DiscoveryLogDrawer.tsx`

**Files to edit**
- `src/routes/__root.tsx` — mount `<CelebrationLayer />` and `<DiscoveryToast />` inside the Quantum Bloom branch.
- `src/components/settings/ThemesSection.tsx` — enable Discovery Log row + wire drawer.
- `src/lib/tickets-store.ts`, `src/lib/dispatch-store.ts`, `src/lib/night-plan-store.ts` — add `triggerCelebration` call at completion points.
- Existing shift-complete code path (the component currently rendering `CelebrationOverlay` on shift end) — branch on theme.
- `src/styles.css` — add `@keyframes qb-bloom-pulse`, `qb-aurora-sweep`, `qb-golden-ring`, `qb-spectral-wave`, `qb-discovery-toast-in`.

**Verification**
- Quantum Bloom active → complete a ticket → cyan bloom plays, "★ Discovery unlocked: Ticket completed" toast appears, row visible in Discovery Log drawer.
- Complete dispatch testing → spectral wave plays + discovery row.
- Mark night plan complete → golden ring + row.
- End shift → aurora curtain (Quantum Bloom variant); BlueVerse overlay does not also fire.
- Switch to BlueVerse → no celebrations fire from the new system, no discovery rows added, drawer not reachable.
- Sign in on second device → Discovery Log shows the same rows.
- Reset Discoveries → list empties on both devices after refresh.

Approve and I'll build it. Phase 3 (Sanctuary, Constellations, Archive, Quantum Bloom Core, Cosmic Weather, intensity sliders) stays as its own future plan.