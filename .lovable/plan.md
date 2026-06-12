## Goal

Completely remove every piece of demo/mock data from the portal — not hidden behind a toggle, actually deleted from the codebase. The only account that remains is **Sheboygan Internal Medicine (account #7431)** with **one ticket** attached to it. The "Demo Mode" toggle and "Recover real work from demo" controls in Settings are removed since they have nothing left to act on.

## What gets deleted

**Mock data files (deleted outright):**
- `src/lib/mock/accounts.ts`
- `src/lib/mock/tickets.ts`
- `src/lib/mock/completed.ts`
- `src/lib/mock/alerts.ts`
- `src/lib/mock/overview.ts`
- `src/lib/mock/reports-seed.ts`
- `src/lib/mock/dispatch-templates.ts` (the seeded "demo" templates only — see below)

**Seed functions stripped to return empty arrays in:**
- `src/lib/tickets-store.ts` — `seed()` replaced with the single Sheboygan ticket (see below). `isDemo` field, `recoverRealWorkFromDemo`, `runTicketsDemoMigration`, `recoverTicketIfUserWorked`, `isRealTicket`, `_seedExtra` removed. `useDemoMode` import dropped; `useTickets` no longer filters by `isDemo`.
- `src/lib/accounts-store.ts` — `seedFromMock`, `seedNotes`, `seedTemplates` replaced with a single seed for Sheboygan Internal Medicine (#7431, active). No notes, no templates.
- `src/lib/dispatch-store.ts` — `seed()` returns `[]`. `isDemo`, `recoverRealWork`, `_seedExtra` removed; `useDemoMode` filter dropped.
- `src/lib/additional-work-store.ts` — `seed()` returns `[]`. Same demo-flag cleanup.
- `src/lib/reports/night-plan-history.ts` — `seed()` returns `[]`, `SEED_FLAG` and seeded-history bootstrap removed.
- `src/lib/settings/dispatch-templates-store.ts` — `seed()` returns `[]`.

**Settings cleanup (`src/routes/_authenticated/settings.tsx`):**
- Remove the "Demo Mode" section, the `useDemoMode`/`setDemoMode` imports, the "Recover real work from demo" button, and the now-redundant "Clear all data" handler can stay (it's still useful) but its copy is updated to not reference demo data.

**Store delete:** `src/lib/settings/demo-mode-store.ts` removed.

**Component cleanup:** drop `useDemoMode` from `src/components/home/RecentlyCompleted.tsx`, `src/components/home/AlertCenter.tsx`, `src/components/home/OverviewCards.tsx`, `src/components/home/LookupCards.tsx`. Their filters become "show everything you have" (which, on first load, is just Sheboygan + its ticket).

**LocalStorage migration:** because returning users still have the old demo seeds persisted in `localStorage`, bump the storage key version for each store:
- `aih:accounts:v1` → `v2`
- `aih:tickets:v1` → `v2` (whatever the current key is — same idea)
- dispatch / additional-work / night-plan-history / dispatch-templates keys all bumped one major.

On next load every browser starts from the clean slate seed (Sheboygan + 1 ticket); no manual "clear data" step needed.

## The one account + ticket that stays

**Account**
- Number: `7431`
- Name: `Sheboygan Internal Medicine`
- Status: `active`

**Ticket** (default values shown — tell me if you want different)
- Number: `1` (placeholder — say the word if you have the real Freshdesk ticket #)
- Subject: `Sheboygan Internal Medicine — open work`
- Account: 7431 / Sheboygan Internal Medicine
- Status: `working`
- No notes, no snips, no Freshdesk URL (real ticket gets attached when you pull it from Freshdesk).

## Out of scope

- Quantum Bloom discoveries already persist per-user in Supabase — those are real user data, not demo, and are left alone.
- Tuning prefs, theme prefs, dropdown defaults (regions, priorities, etc.) stay — those are config, not demo work.
- No database migration needed; all demo data lives in client localStorage.

## Open question before I build

You gave me the account number (7431) but not the ticket. **Do you want the seeded ticket to use a specific number/subject, or are you fine with the placeholder `#1 — "Sheboygan Internal Medicine — open work"` that you can rename/replace once you pull the real one from Freshdesk?**
