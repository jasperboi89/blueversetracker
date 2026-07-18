## Achievements — "Constellation Ranks"

A dedicated, motivational achievements system that rewards night-shift grit with unique, thematic badges. Sits alongside Discoveries but focused on **earned milestones** rather than one-off celebrations.

### Concept & tone

Each achievement is a **Rank** — a named, illustrated badge with a short flavor line. Tone is warm, slightly cosmic, never corporate ("Nightfall Initiate", "Overdue Slayer", "Dispatch Cartographer"). Every unlock triggers a celebration overlay and pins to a permanent Achievements page.

### Where it lives

- New page: `/achievements` — grid of earned + locked badges, progress bars, next-up teasers.
- Header entry point: small trophy icon (visible on all themes, not just Quantum Bloom).
- On unlock: full-screen celebration (reuses Quantum Bloom celebration overlay when active, plain confetti + toast otherwise) + entry in Insight Toaster.
- Optional strip on the home dashboard: "Next rank: 3 tickets away".

### Achievement categories (starter set)

**Ticket flow**
- First Contact (1 ticket completed)
- Steady Hand (10), Rhythm (25), Century (100), Ascendant (500)
- Overdue Slayer (clear all overdue in a shift)
- Clean Slate Streak (3 shifts in a row with zero overdue at clock-out)

**Dispatch**
- First Dispatch, Dispatch Cartographer (25 sessions), Root-Cause Whisperer (50 with reason chains completed)

**Knowledge & notes**
- Archivist (10 knowledge notes), Curator (50), Snip Collector (100 snips)

**Shift consistency**
- Nightfall Initiate (first night plan), Moonwalker (10 plans), Constant Star (30 plans)

**AI & tooling**
- First Summary, Prompt Sculptor (100 AI summaries)

**Hidden / fun**
- Owl Hours (work logged 3–5am), Sanctuary Seeker (enter Sanctuary 5 times), Comeback Kid (return after 2+ weeks away)

### Progression mechanics

- Each achievement has: `id`, `title`, `flavor`, `icon`, `tier` (bronze/silver/gold/mythic), `category`, `criteria`, `progress`, `unlockedAt`.
- Progress is derived from existing data (tickets completed, dispatch sessions, work log, knowledge notes, night plans, discoveries, sanctuary opens).
- No new counters where an existing signal already exists — we compute from the source of truth on load and cache on the achievement row.

### Technical details

**Data**
- New table `achievements_unlocked` (user_id, achievement_id, unlocked_at, tier, progress_snapshot jsonb) with RLS: user reads/writes own rows only; standard GRANTs.
- Achievement **catalog** lives in code (`src/lib/achievements/catalog.ts`) — static definitions, no DB seeding needed.

**Store**
- `src/lib/achievements/achievements-store.ts` — Zustand + Supabase sync. Exposes `evaluateAll()` (recomputes progress from existing stores/queries) and `unlock(id)` (writes row + fires celebration).
- Hook `useAchievements()` returns earned + progress for the page.
- `evaluateAll()` runs on: app load, ticket completion, dispatch save, knowledge note save, night plan save, work log write, sanctuary enter.

**UI**
- `src/routes/_authenticated/achievements.tsx` — grid page. Filters by category + tier. Locked badges shown desaturated with progress bar and next milestone hint.
- `src/components/achievements/AchievementCard.tsx` — badge tile with hover flavor text.
- `src/components/achievements/UnlockOverlay.tsx` — celebration on unlock (theme-aware).
- `src/components/layout/AchievementsButton.tsx` — header trophy with unread-unlock dot.

**Icons**
- Use `lucide-react` glyphs tinted per tier via existing semantic tokens (no hardcoded colors). Mythic tier gets a subtle animated glow using existing Quantum Bloom shimmer utility.

**Routing / safety**
- Uses clean path `/achievements` (no `_authenticated` prefix in links, consistent with recent fixes).
- Head metadata: title "Achievements", description tuned for the app.

### Out of scope (can follow up)
- Sharing badges externally, leaderboards, custom user-defined achievements, seasonal/event badges.

Ready to build once you approve — I'll ship the catalog, table + RLS, store, page, header entry, and unlock celebration in one pass.