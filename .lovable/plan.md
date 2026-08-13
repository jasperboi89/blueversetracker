# Intelligence Core — Phase 1 (Event Spine) + Phase 2 (Shift Working Context)

## What I found in the current architecture

**Reusable as-is**
- `createPersistedStore` (`src/lib/settings/_persist.ts`) — tiny localStorage store factory with `subscribe/get/update/applyServerSnapshot`; every domain store uses it. The Event Spine and Shift Context build on the same primitive, so no new state library.
- `attachCloudSync` (`src/lib/cloud-sync/blob-sync.ts`) — per-store JSON blob sync into the existing `user_store_blobs` table. Shift Context can opt in later; the event buffer stays local-only for v1, so no migration is needed.
- `active-work-store.ts` has one choke point, `bankAndLog()`, that every timer start/stop/switch already passes through — the right place to emit `timer.*` and `work.*` events without touching the four route call sites.
- `workspace/activity-store.ts` already declares `ticket_open | ticket_pull | ticket_complete | dispatch_open | additional_open` but only ever emits `nav`. Those unused members become the first real Event Spine events.
- `awareness.ts` (`useInsights`) is already deterministic, rule-based and cross-domain — the foundation for Phase 3. Untouched in this phase.
- `handoff.functions.ts` is the one existing shift-scoped server table; `auth_audit_log` / `ticket_access_log` are the existing audit tables (server-only writes via the admin client).

**Duplication / conflicts to be aware of**
- There is no generic client-callable audit write today — both audit paths are purpose-built. The Phase 4 executor will need one; not in this phase.
- `AccountMemoryPane`, `accounts.$accountNumber.tsx` and `CopilotSheet`'s hub snapshot each re-aggregate the same ticket/account/night-plan data independently. That is what the Phase 5 Account Context Pack collapses — noted, not touched now.
- Copilot proposals live in component state only and `applyAction()` mutates stores directly. That is Phase 4; untouched now.
- No test files exist in the repo, so "existing regression tests" means the build/typecheck plus manual workflow checks.

## Phase 1 — Event Spine

New files `src/lib/core/events.ts` (types) and `src/lib/core/event-spine.ts` (service).

- Strongly typed event-type union covering the requested set (`ticket.*`, `account.opened`, `work.*`, `dispatch.*`, `change.*`, `coverage.*`, `knowledge.*`, `handoff.*`, `timer.*`, `night_plan.*`).
- `AccEvent = { id, type, timestamp, source, accountId?, ticketId?, workItemId?, dispatchId?, metadata? }` — all correlation fields optional.
- API: `eventSpine.emit(input)`, `eventSpine.subscribe(handler, filter?)` returning an unsubscribe function, `eventSpine.unsubscribe(handler)` for the requested shape, plus `eventSpine.recent(n)` and `eventSpine.clear()`.
- Backed by a capped ring buffer (300 events) persisted through `createPersistedStore`, so a page reload keeps continuity within a shift. The buffer trims on shift rollover using the existing `getShiftKey()`.
- Emission is fire-and-forget and never throws into callers — a failing subscriber is caught and warned, never breaks a workflow.

**Initial emitters (small, safe set only)**
- `active-work-store.ts` → `timer.started`, `timer.stopped`, `work.started`, `work.paused`, `work.completed`.
- The three work routes' existing effects → `ticket.opened`, `dispatch.started`, `work.started`, via a tiny mount hook so no logic is added to the page bodies.
- `accounts.$accountNumber.tsx` → `account.opened`.
- `tickets-store.ts` status/classification mutators → `ticket.status_changed`, `ticket.completed`, `ticket.pulled`.
- `night-plan-store.ts` add / complete → `night_plan.item_added`, `night_plan.item_completed`.

Everything else keeps working untouched and gets connected in later phases.

## Phase 2 — Shift Working Context

New files `src/lib/core/shift-context.ts` (store + reducer) and `src/hooks/use-shift-context.ts`.

- `ShiftWorkingContext` exactly as specified: `activeTicket`, `activeAccount`, `activeWorkItem`, `activeDispatch`, `recentActivity[]`, `blockers[]`, `warnings[]`, `shiftSummary`.
- Built as a pure reducer over events — `reduce(context, event)` — subscribed to the Event Spine at app mount. No feature writes to it directly, so exactly one place decides what "current" means.
- Key behaviours:
  - `ticket.opened` sets the active ticket and, when the ticket carries an account, the active account too.
  - `account.opened` sets the active account but does **not** clear the active ticket — navigating ticket to account keeps the task alive.
  - `timer.started` / `work.started` set the active work item; `work.completed` marks that activity complete but keeps it in `recentActivity` (capped at 25).
  - `shiftSummary` is derived on read from night-plan must items, active timers and unresolved work — never stored stale.
- Scoped to the current shift key; resets automatically on shift rollover and clears on sign-out alongside the other local stores (`purge-local-data.ts`).
- Persisted locally for reload continuity only. It is explicitly **not** operator profile memory — no writes to the long-term Copilot profile, and no data beyond the IDs and labels the existing local stores already hold.
- Mounted once as a headless watcher next to the existing singletons in `src/routes/_authenticated/route.tsx`.

## Not in this phase

Awareness 2.0, Safe Action Executor, Account Context Pack, Resolution Memory, retrieval abstraction, model router and the Focus UI are deliberately deferred. No Copilot behaviour changes, no visual changes, and no Clara/avatar functionality.

## Technical notes

- Files added: `src/lib/core/events.ts`, `src/lib/core/event-spine.ts`, `src/lib/core/shift-context.ts`, `src/hooks/use-shift-context.ts`, `src/components/workspace/ShiftContextWatcher.tsx`.
- Files touched (small, additive edits only): `active-work-store.ts`, `tickets-store.ts`, `night-plan-store.ts`, the three `*.work.tsx` routes, `accounts.$accountNumber.tsx`, `_authenticated/route.tsx`, `purge-local-data.ts`.
- No new dependencies, no database migration, no server functions, no secrets touched.
- Verification: clean typecheck/build, then a browser pass confirming timer start/stop, ticket-to-account navigation retaining ticket context, night-plan add/complete feeding the spine, and Copilot, dispatch and reports still working.