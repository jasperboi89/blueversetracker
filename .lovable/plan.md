
# Quantum Bloom — Phase 1

BlueVerse stays the default. Quantum Bloom is an opt-in theme selectable from Settings → Themes. Phase 1 ships the visual environment and theme switch only. Discovery Log, Sanctuary, Adaptive Learning (Quantum Bloom Core), Constellations, Archive, Cosmic Weather, Celebrations, Sleep Mode learning, and event/particle controls are deferred to later phases — the settings UI will list them as "Coming soon".

## What you get in Phase 1

- A new theme called **Quantum Bloom** selectable from **Settings → Themes**.
- A **WebGL nebula** rendered behind the entire portal when Quantum Bloom is active (replaces the current GalaxyBackground only while active).
- **Aurora color phases** that gradually shift the nebula and accent glow across the 10 PM → 6 AM Central window:
  10 PM cyan/electric → 11 PM blue→violet → 12 AM deep violet → 1 AM violet/magenta → 2 AM indigo → 3 AM royal+gold → 4 AM indigo→blue → 5 AM cyan → 6 AM completion.
  Outside the shift window the nebula slows down and dims (basic Daytime Sleep Mode — visual only, no learning).
- **Entry sequence** on theme load:
  - First-ever open: 2–3 s sequence — darkness → stars → nebula ignite → crystal materialize → "Quantum Bloom Core Online" / "Aurora Engine Initialized" / "Good Evening, Luke" → dashboard fades in. A simple **Night Forecast** card appears in the dashboard header using real data (open tickets, active alerts, night plan status).
  - Subsequent opens: 0.5–1 s — nebula pulse + glass shimmer → dashboard.
- **Holographic Crystal Glass** surface variant for cards/drawers/modals when the theme is active (refraction, spectral edge, bloom reflections) — applied via CSS tokens so every existing panel benefits automatically.
- Per-user persistence in Lovable Cloud so the theme choice + "has seen first entry" follow the user across devices.

## What's deferred (later phases)

Discovery Log, Constellation View, Archive, Sanctuary, Quantum Bloom Core (adaptive learning), Cosmic Weather events, Celebration system (ticket / testing / night plan / shift completions), event-frequency + particle-density + visual-intensity sliders. Settings panels for these will render as disabled "Coming soon" placeholders so the structure exists for later phases to fill in.

## User flow

1. Open Settings → new **Themes** section appears with two cards: BlueVerse (default) and Quantum Bloom.
2. Select Quantum Bloom → entry sequence plays → portal re-renders with nebula behind everything and crystal-glass surfaces.
3. All existing pages (Home, Freshdesk, Additional Work, Contact Dispatch, Accounts, Reports, Settings, drawers, modals) work unchanged — only the background and surface tokens differ.
4. Switch back to BlueVerse any time from the same screen.

## Technical section

**Dependencies**
- Add `three` and `@react-three/fiber` for the WebGL nebula + bloom. Postprocessing via `@react-three/postprocessing` for the bloom pass. All client-only (lazy-loaded; SSR-safe behind `<ClientOnly>`).

**Theme store**
- `src/lib/settings/theme-store.ts` — Zustand-style persisted store mirroring `demo-mode-store.ts`. Values: `'blueverse' | 'quantum-bloom'`. Cached in localStorage for instant first paint; hydrated from Supabase on sign-in.
- `useApplyTheme()` hook sets `document.documentElement.dataset.theme` so CSS can branch.

**CSS tokens (`src/styles.css`)**
- New `[data-theme="quantum-bloom"]` block overrides `--background`, `--card`, `--border`, plus introduces `--qb-phase-primary`, `--qb-phase-secondary`, `--qb-phase-accent` driven by a single timer.
- New `@utility crystal-glass` variant of `glass-panel` (stronger blur, spectral border via conic gradient, inner bloom). `glass-panel` itself remains untouched for BlueVerse.
- Aurora phase variables animated via a top-level `<QuantumBloomDriver />` component that writes CSS vars to `:root` every minute using `getShiftPhase(now)` derived from existing `src/lib/shift.ts`.

**Nebula**
- `src/components/quantum-bloom/NebulaCanvas.tsx` — `<Canvas>` with a single full-screen plane running a fragment shader (FBM noise + domain warping) and an `EffectComposer` bloom pass. Reads phase colors from CSS vars via `getComputedStyle` on mount + on phase change.
- Mounted in `__root.tsx` inside `<ClientOnly>`, gated by `theme === 'quantum-bloom'`. Replaces `<GalaxyBackground />` only while active.
- WebGPU is not used — Three.js WebGL with a fallback: if `WebGLRenderingContext` is unavailable, render the existing GalaxyBackground instead and surface a one-line toast.
- DPR clamped to 1.5, paused via `document.visibilitychange`, and frame-rate-throttled to 30 fps outside the shift window for Sleep Mode.

**Entry sequence**
- `src/components/quantum-bloom/EntryOverlay.tsx` — full-screen overlay with the 6-step animation. State: `'first' | 'returning' | 'done'`. First-time flag read from Supabase (`quantum_bloom_state.first_entry_completed`); falls back to localStorage if offline.
- Night Forecast computed from existing stores (`useTickets`, `useAlerts`, `night-plan-store`) — no new business logic.

**Persistence (Lovable Cloud)**
- New table `public.user_theme_prefs`:
  - `user_id uuid PK references auth.users`
  - `theme text not null default 'blueverse'` (check: in `('blueverse','quantum-bloom')`)
  - `qb_first_entry_completed boolean not null default false`
  - `updated_at timestamptz`
- GRANTs to `authenticated` + `service_role`; RLS policies scoped to `auth.uid() = user_id` for select/insert/update.
- Read/write through two server fns in `src/lib/settings/theme.functions.ts` using `requireSupabaseAuth`:
  - `getThemePrefs()` — returns row, upserting defaults on first call.
  - `setThemePrefs({ theme?, qbFirstEntryCompleted? })`.
- Hook `useThemeSync()` mounted in `_authenticated/route.tsx` — pulls prefs on sign-in into the local store, pushes on change (debounced).

**Settings UI**
- New section `src/components/settings/ThemesSection.tsx` in `src/routes/_authenticated/settings.tsx`:
  - Two large preview cards (BlueVerse / Quantum Bloom) with a "Use this theme" button.
  - Below, a collapsed **Quantum Bloom Settings** group with the full list of toggles from the spec rendered disabled with a "Coming soon" badge — except Night Shift Synchronization, which is on by default and read-only in Phase 1.

**Files to add**
- `src/lib/settings/theme-store.ts`
- `src/lib/settings/theme.functions.ts`
- `src/hooks/use-theme-sync.ts`
- `src/components/quantum-bloom/NebulaCanvas.tsx`
- `src/components/quantum-bloom/EntryOverlay.tsx`
- `src/components/quantum-bloom/QuantumBloomDriver.tsx`
- `src/components/quantum-bloom/NightForecast.tsx`
- `src/components/settings/ThemesSection.tsx`

**Files to edit**
- `src/styles.css` — add `[data-theme="quantum-bloom"]` tokens, `@utility crystal-glass`, phase keyframes.
- `src/routes/__root.tsx` — mount `<QuantumBloomDriver />`, conditional `<NebulaCanvas />` vs `<GalaxyBackground />`, `<EntryOverlay />`.
- `src/routes/_authenticated/route.tsx` — mount `useThemeSync()`.
- `src/routes/_authenticated/settings.tsx` — render `<ThemesSection />`.
- `src/components/home/GreetingPanel.tsx` (or sibling) — render `<NightForecast />` when Quantum Bloom is active.
- `src/start.ts` — already has `attachSupabaseAuth`; no change needed unless missing.

**Verification**
- Toggle Quantum Bloom in Settings → entry sequence plays → nebula appears → all pages render with crystal-glass surfaces → readability preserved.
- Toggle back to BlueVerse → reverts cleanly, no leftover styles.
- Refresh during shift window → nebula phase matches current Central hour; outside window it visibly slows.
- Sign out / sign in on a second device → theme choice follows the user.

If this Phase 1 plan looks right, approve and I'll build it. Phase 2 (Discovery Log + Celebrations) and Phase 3 (Quantum Bloom Core learning, Sanctuary, Constellations, Archive, Cosmic Weather) can each be a separate approved plan.
