## What's happening

Two real problems, both rooted in seed/demo data not being treated as demo everywhere:

### 1. Dashboard still shows demo data with Demo Mode OFF
Last round only gated the static `mockAlerts` and demo Freshdesk tickets. These other surfaces still slip through and look like ghost data:

- **`RecentlyCompleted`** unconditionally spreads `getMockCompleted()` into the list — that's the demo "Recently Completed Work" you can't clear.
- **Dispatch sessions** (`src/lib/dispatch-store.ts` `seed()`) have no `isDemo` flag and `useDispatch()` doesn't filter — demo dispatch sessions feed `RecentlyCompleted` ("Ready for Activation") and the Contact Dispatch index.
- **Additional Work items** (`src/lib/additional-work-store.ts` `seed()`) have no `isDemo` flag and `useAdditionalWork()` doesn't filter — demo items feed `RecentlyCompleted` and the Additional Work index.
- **Reports seeds** (`src/lib/mock/reports-seed.ts`) push demo tickets via `ticketsStore._seedExtra` and a demo dispatch session via `dispatchStore._seedExtra` without `isDemo`. Those drive `useRecurringRows()`, so the "Recurring Scripting Issues" alerts in Alert Center are demo-driven even though they look "dynamic."
- **Night Plan history** (`src/lib/reports/night-plan-history.ts` `seed()`) seeds archived items without `isDemo`. Those drive the "Night Plan Archive cleanup" alert.
- **Alert dismissals** are only `useState` in `AlertCenter` — they come back on every refresh, which feels like "won't clear out."

### 2. "My ticket work today / the account I added isn't showing"
Two likely causes, both fixable in the same pass:

- With Demo Mode OFF, the recent-ticket list and Active sections look empty because the page is also filtering tickets the user actually pulled/worked, when those tickets ended up tagged `isDemo` by mistake (e.g. when re-imported via a seed code path, or because an older build assigned `isDemo: true` and the flag stuck in localStorage). Need a one-time migration that strips `isDemo` from any ticket that has real user work on it (any `hubHistory` entry authored by the user, any `hubSnips`, a non-empty `workSession`, or `accountSource === "manual"`).
- `RecentlyCompleted` only shows real tickets when `status === "completed" && completedAt` is set. If a ticket the user is "working on" hasn't been marked completed it won't appear here — that's expected, but the demo entries crowding it make it look broken. Filtering demo entries solves the visible symptom.

## Plan

### A. Tag everything seeded as `isDemo` and filter it
1. `src/lib/dispatch-store.ts`
   - Add `isDemo?: boolean` to `DispatchSession`.
   - Mark every record returned by `seed()` and `_seedExtra()` with `isDemo: true`.
   - In `useDispatch()`, read `useDemoMode()`; when off, filter `sessions` to `!s.isDemo`.
2. `src/lib/additional-work-store.ts`
   - Add `isDemo?: boolean` to `AdditionalWork`.
   - Mark `seed()` results `isDemo: true`.
   - In `useAdditionalWork()`, gate by `useDemoMode()` the same way.
3. `src/lib/reports/night-plan-history.ts`
   - Add `isDemo?: boolean` to `NPHistoryItem`, mark seed entries demo, and skip demo items in `readyForCleanup()` and the hook used by `AlertCenter` when demo mode is off.
4. `src/lib/mock/reports-seed.ts`
   - When calling `ticketsStore._seedExtra` / `dispatchStore._seedExtra`, mark the records `isDemo: true` so recurring-issues and reports lists also disappear when demo mode is off.
5. `src/lib/reports/recurring-issues.ts`
   - `useRecurringRows()` should ignore demo tickets/sessions when demo mode is off (so the "Account X recurring scripting" alerts go away).

### B. Stop demo entries leaking into the home dashboard
6. `src/components/home/RecentlyCompleted.tsx`
   - Only include `getMockCompleted()` results when demo mode is on.
   - `ticketCompleted`, `dispatchReady`, `addWorkCompleted` are already sourced from the filtered hooks above, so they'll naturally drop demo rows once steps A1–A2 land.
7. `src/components/home/AlertCenter.tsx`
   - Already filters `mockAlerts`. After step A3/A5 the "recurring" and "night-plan cleanup" dynamic alerts will also disappear when demo is off.
   - Persist dismissed alert IDs to `localStorage` (per shift key) so dismissals survive refresh.

### C. Recover the user's real work
8. `src/lib/tickets-store.ts` — add a one-time migration inside `loadInitial()` (versioned, e.g. `aih:tickets:demo-cleanup:v1`):
   - For each persisted ticket, if it has any of: `hubHistory.some(h => h.initials === "LTP" || h.kind === "note" || h.kind === "snip")`, any `hubSnips.length > 0`, `accountSource === "manual"`, or a populated `workSessions[id]` (non-default `issueText`, `changesText`, `resultStatus`, or `generatedNote`), then set `isDemo: false`.
   - Same idea for dispatch sessions and additional-work items (any user-authored snip/note/status change clears `isDemo`).
9. Add a Settings → Data / Cleanup action "Restore my real work" that runs the migration again on demand, and confirm the existing "Clear all demo data" button now also removes seeded dispatch sessions, additional-work items, and night-plan history.

### D. Verification
- Toggle Demo Mode off on `/` and confirm: Alert Center is empty (or only shows truly user-generated alerts), `RecentlyCompleted` is empty or only shows the user's completed work, Freshdesk index shows only the Sheboygan ticket, Contact Dispatch and Additional Work indexes show only the user's real records.
- Toggle Demo Mode back on and confirm all seed content returns intact (no destructive deletes).
- Dismiss an alert, refresh, confirm it stays dismissed.

## Technical notes
- No backend/schema changes; everything is localStorage.
- `_seedExtra` is the join point that quietly bypasses the per-store seed, so it must also stamp `isDemo`.
- The migration in step 8 is conservative — it only un-flags a ticket when there is clear evidence of human work on it, so seed tickets that were never touched stay flagged.
- Persisting dismissed alert IDs uses the existing `createPersistedStore` helper to match the Settings pattern.

Scope intentionally excludes accounts-store and night-plan-store seeding because those weren't called out; happy to extend if you want those gated too.