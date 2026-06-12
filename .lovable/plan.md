# Quantum Bloom — Phase 3

Phase 3 finishes the spec on top of the existing Quantum Bloom theme. Everything stays gated to `theme === 'quantum-bloom'`; BlueVerse is untouched.

## What you get

**Settings sliders (live)** — new "Quantum Bloom Tuning" group flips the Phase 1 "Coming soon" rows into working controls and persists per-user via Lovable Cloud:
- **Visual Intensity** (1–5) — scales nebula brightness, bloom strength, and particle density on the WebGL canvas.
- **Event Frequency** (Off / Low / Normal / High) — base rate for Cosmic Weather events.
- **Particle Density** (Low / Medium / High) — caps ambient sparkle layer and celebration burst counts.
- **Daytime Sleep Mode** — already on; toggle exposed.
- **Ambient Atmosphere** — still listed as "Coming soon" (audio out of scope to keep this phase shippable without an asset pipeline).

**Cosmic Weather** — random ambient events overlaid on the nebula, throttled by Event Frequency, suppressed during Sleep Mode, and recorded as Discoveries:
- **Meteor showers** — diagonal streaks across the canvas, 6–14 s.
- **Stellar aurora** — extra colored ribbon sweep through the nebula, 8 s.
- **Cosmic lightning** — single full-screen flash + reverb glow, 1.2 s.
- **Comet pass** — one slow comet across, 10 s.
Events fire on a per-user schedule (~1 every 8–20 min at Normal). Each event records a `cosmic_<type>` Discovery.

**Sanctuary** — a focus mode reachable from the AppShell header (visible only in Quantum Bloom). One click dims the entire UI to 35%, hides sidebar + non-essential chrome, pulls the nebula to a slow breathing animation, and shows a small "Sanctuary · Exit" pill. Esc or clicking the pill exits. State is local-only (per tab).

**Constellation View** — a new route `/_authenticated/constellations` linked from Settings → Themes → Quantum Bloom and from the Discovery Log header. Renders the user's Discovery history as a starfield: each Discovery is a star, colored by kind, position derived deterministically from `id`, linked by faint lines between same-day stars. Hovering a star shows label + time. Clicking opens the deep link (ticket / dispatch session / night plan item) when context allows.

**Archive** — a sibling tab inside the Constellation View ("Timeline") showing aggregated counts per day (last 60 days) as a sparkline grid, plus per-kind totals all-time. Pulls from the existing `qb_discoveries` table — no new schema.

**Quantum Bloom Core (adaptive learning)** — derived signals, no extra writes per event:
- **Favorite Color Phase** — phase with the most discoveries in the last 30 days.
- **Most Active Hour** — Central hour with the most discoveries in the last 30 days.
- **Preferred Workspace** — kind with the most discoveries in the last 30 days (ticket / dispatch / night_plan / shift).
- **Adaptation Level** — derived from total discoveries (Dormant <10, Aware 10–49, Attuned 50–149, Resonant 150+).
- **Discoveries Unlocked** — total count.
A new "Quantum Bloom Core" card on the Constellation View shows these readouts, plus a "Reset Learning" button that clears the Discovery Log (reuses existing `resetDiscoveries`).

## What stays deferred

Ambient Atmosphere (audio loops) — needs licensed assets; revisit when you have a source. Everything else from the spec ships in this phase.

## Technical section

**New table — `public.qb_tuning_prefs`** (one row per user)
- `user_id uuid pk references auth.users(id) on delete cascade`
- `visual_intensity smallint not null default 3 check (visual_intensity between 1 and 5)`
- `event_frequency text not null default 'normal' check (event_frequency in ('off','low','normal','high'))`
- `particle_density text not null default 'medium' check (particle_density in ('low','medium','high'))`
- `sleep_mode boolean not null default true`
- `updated_at timestamptz not null default now()`
- GRANT select/insert/update to `authenticated`, ALL to `service_role`. RLS scoped to `auth.uid() = user_id`.

**Server functions** — `src/lib/quantum-bloom/tuning.functions.ts`
- `getTuning()` upserts defaults then returns the row.
- `setTuning(partial)` upserts the diff.

**Local + sync** — `src/lib/settings/qb-tuning-store.ts` (mirrors `theme-store.ts`), `src/hooks/use-tuning-sync.ts` mounted next to `useThemeSync()`.

**NebulaCanvas updates** — read `useTuning()`:
- Pass `uIntensity` (0.4–1.4) uniform into the shader; multiplies brightness + bloom strength.
- Scale particle count and DPR cap by `particleDensity`.

**Cosmic Weather** — `src/components/quantum-bloom/CosmicWeatherLayer.tsx`
- Mounted next to `CelebrationLayer` inside the Quantum Bloom branch.
- Schedules next event via `setTimeout` based on `eventFrequency` (off = never; low = 15–35 min; normal = 8–20 min; high = 3–9 min).
- Suppresses when `document.hidden`, when `getShiftPhase()` is daytime AND `sleep_mode` is on, or when a celebration is currently playing.
- On each event: emits visual via CSS animation overlay AND calls `recordDiscovery({ kind: 'shift', label: 'Cosmic <type>' , context: { weather: type } })` — reuses existing table; `kind` stays in allowed enum by tagging the row's context (no migration). Wait — the enum doesn't allow a new kind without a migration. So we add `'cosmic'` to the enum via a small ALTER. See Migration #2 below.

**Migration #2** — extend `qb_discoveries.kind` check to include `'cosmic'`. Drop + recreate the CHECK constraint in a single statement.

**Sanctuary** — `src/lib/quantum-bloom/sanctuary-store.ts` (local only, `useSyncExternalStore`), `SanctuaryShell.tsx` mounted in `__root.tsx` (Quantum Bloom branch). Adds a `data-qb-sanctuary="on"` attribute on `<html>`; CSS in `styles.css` fades AppShell sidebar, dims non-essential cards, and slows the nebula via a new `--qb-sanctuary-intensity` factor on the shader uniform path.
- Trigger: small "Sanctuary" button rendered into `AppShell` header when `theme === 'quantum-bloom'`. Esc handler exits.

**Constellation View route** — `src/routes/_authenticated/constellations.tsx`
- Loader uses `useServerFn(listDiscoveries)` from a component (no SSR loader — protected fn).
- Two tabs (`Tabs` from shadcn): **Constellations** (canvas/SVG starfield), **Timeline** (sparkline grid + totals).
- Star position: `hash(id)` → `(x,y)` in normalized space, jittered per day bucket so same-day stars cluster.
- Lines: SVG `<line>` between consecutive same-day stars (max 50 per day).
- Star colors mirror `KIND_META` from the Discovery drawer plus a violet for `cosmic`.

**Quantum Bloom Core card** — pure derivation function `deriveCore(discoveries)` in `src/lib/quantum-bloom/core.ts`. Rendered at the top of `/constellations`. "Reset Learning" calls the existing `resetDiscoveries` + a confirm step.

**Settings UI** — `ThemesSection.tsx`
- Replace the disabled "Cosmic Weather", "Daytime Sleep Mode" rows with working `Select` / `Switch`.
- Add three sliders (Visual Intensity, Event Frequency, Particle Density). Existing "Ambient Atmosphere" stays "Coming soon".
- Add a "Open Constellation View" link next to the Discovery Log row.

**Files to add**
- `supabase/migrations/<ts>_qb_phase3.sql` (tuning table + GRANT/RLS + extend discovery kind enum)
- `src/lib/quantum-bloom/tuning.functions.ts`
- `src/lib/settings/qb-tuning-store.ts`
- `src/hooks/use-tuning-sync.ts`
- `src/lib/quantum-bloom/core.ts`
- `src/lib/quantum-bloom/sanctuary-store.ts`
- `src/components/quantum-bloom/CosmicWeatherLayer.tsx`
- `src/components/quantum-bloom/SanctuaryShell.tsx`
- `src/components/quantum-bloom/SanctuaryButton.tsx`
- `src/components/quantum-bloom/CoreCard.tsx`
- `src/components/quantum-bloom/ConstellationField.tsx`
- `src/components/quantum-bloom/ArchiveTimeline.tsx`
- `src/routes/_authenticated/constellations.tsx`

**Files to edit**
- `src/routes/__root.tsx` — mount `<CosmicWeatherLayer />` + `<SanctuaryShell />`.
- `src/routes/_authenticated/route.tsx` — call `useTuningSync()`.
- `src/components/quantum-bloom/NebulaCanvas.tsx` — wire `intensity` + `particleDensity` from tuning store; honor sanctuary factor.
- `src/components/quantum-bloom/CelebrationLayer.tsx` — scale particle bursts by particle density.
- `src/components/quantum-bloom/DiscoveryLogDrawer.tsx` — add link to `/constellations`; add `cosmic` kind icon/color.
- `src/components/settings/ThemesSection.tsx` — flip placeholder rows to live controls; add Constellation View link.
- `src/components/layout/AppShell.tsx` — render `<SanctuaryButton />` in header when Quantum Bloom is active.
- `src/styles.css` — `[data-qb-sanctuary="on"]` rules; cosmic weather keyframes (`qb-meteor`, `qb-comet`, `qb-cosmic-lightning`, `qb-aurora-ribbon`); constellation styles.

**Verification**
- Toggle Quantum Bloom → set Visual Intensity 1 → nebula visibly dimmer; set 5 → much brighter.
- Set Event Frequency to High → cosmic event fires within a few minutes; new "cosmic" rows appear in Discovery Log.
- Click Sanctuary → sidebar + chrome dim, nebula slows; Esc restores. State does not survive refresh.
- Open `/constellations` → starfield matches Discovery Log count and colors; Timeline tab shows last-60-days sparkline + totals; Core card shows Favorite Phase / Most Active Hour / Preferred Workspace / Adaptation Level / Discoveries Unlocked.
- Reset Learning empties Discovery Log + Core readouts.
- Switch back to BlueVerse → all Quantum Bloom layers and Sanctuary button disappear; cosmic events stop firing.
- Sign in on a second device → tuning settings + discoveries follow user.

Approve and I'll build it.