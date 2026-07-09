## Goal

Add a new **Assigned to Me** tab that automatically pulls every open Freshdesk ticket where the agent = Lucas Tesch, polls in the background, and toasts you when new ones land.

## How it works

1. **Agent identity** — On first visit to the tab, resolve Lucas's Freshdesk `agent_id` via `GET /api/v2/agents/me` using the stored Freshdesk API key, and cache it in `user_store_blobs` (key `freshdesk-agent`). No hardcoding.
2. **Fetch** — New server fn `freshdeskListAssignedToMe` (behind `requireActiveAuthorizedUser`) calls Freshdesk `filter/tickets?query="agent_id:<id> AND status:<2,3,6,7>"` (Open, Pending, and any non-closed custom statuses). Returns normalized ticket rows.
3. **Poll** — New client store `assigned-inbox-store` runs a background poll every **3 minutes** while the app is open (visibility-aware, pauses when tab hidden). Also exposes a manual refresh.
4. **Diff + toast** — Store compares incoming ticket IDs against last snapshot. For each *new* ticket, fire a sonner toast: "New ticket assigned: FD #12345 — <subject>" with an **Open** action that routes to the inbox tab and highlights the row. Respects the existing `quietInsights` display pref.
5. **Nav entry** — Add "Assigned to Me" to `AppSidebar` (inbox icon), route `/_authenticated/assigned-to-me`, with an unread badge count.

## New tab UI

- Header: "Assigned to Me" + last-sync timestamp + manual **Refresh** button.
- Table/list of tickets: `#number`, subject, account, status chip, priority, updated-at, freshdesk link.
- Row actions per ticket:
  - **Track** → promotes into the existing `ticketsStore` working list (same flow as `TicketLookupCard`).
  - **Open in Freshdesk** → external link.
  - **Dismiss** → hides from inbox until it changes again (stored locally).
- Empty state: "You're clear — nothing new assigned."
- New tickets since last visit get a subtle cyan pulse ring.

## Non-goals (staying tight)

- No auto-import into the active `ticketsStore` — you promote manually via **Track**.
- No closed-ticket sync (out of scope for "open only").
- No server-side cron; polling is client-side while the portal is open (matches single-operator night-shift usage). Can add pg_cron later if you want push-style alerts when the app is closed.

## Technical details

- **Server fn** `src/lib/api/freshdesk-assigned.functions.ts`:
  - `freshdeskGetMyAgentId()` — cached in `user_store_blobs`.
  - `freshdeskListAssignedToMe({ agentId })` — uses existing Freshdesk client helpers in `freshdesk.functions.ts`, same rate-limit + error surface.
- **Store** `src/lib/assigned-inbox-store.ts` — persisted list + `lastSyncedAt` + `dismissedIds` + `seenIds`. Exposes `useAssignedInbox()`, `refresh()`, `startPolling()`, `stopPolling()`.
- **Poller mount** — start in `AppShell` (only when authenticated + Freshdesk configured). Uses `document.visibilitychange` to pause.
- **Toast integration** — reuse the existing `InsightToaster` sonner setup / same debounce contract; new tickets emit as `warn` severity.
- **Route** `src/routes/_authenticated/assigned-to-me.tsx` + component `src/components/assigned-inbox/AssignedInboxPage.tsx` + `AssignedInboxRow.tsx`.
- **Sidebar** update in `AppSidebar.tsx` with badge count from `useAssignedInbox().newCount`.
- **Security** — server fn gated by `requireActiveAuthorizedUser`; Freshdesk credentials stay server-side (`FRESHDESK_API_KEY`, `FRESHDESK_DOMAIN`); ticket access logged via existing `ticket-access-log` helper on Track.

## Files

**New**
- `src/lib/api/freshdesk-assigned.functions.ts`
- `src/lib/assigned-inbox-store.ts`
- `src/routes/_authenticated/assigned-to-me.tsx`
- `src/components/assigned-inbox/AssignedInboxPage.tsx`
- `src/components/assigned-inbox/AssignedInboxRow.tsx`

**Edited**
- `src/components/layout/AppSidebar.tsx` (nav entry + badge)
- `src/components/layout/AppShell.tsx` (mount poller)
- `src/lib/api/freshdesk.functions.ts` (share agent-me + filter helpers if needed)

No DB schema changes. No new secrets.
