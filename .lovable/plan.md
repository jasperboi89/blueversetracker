## Goal

Move all portal data from your browser's localStorage into Lovable Cloud so your work follows you between home and the office. Today every store (tickets, dispatch sessions, accounts, additional work, night shift plan, dropdown labels, dispatch templates, snips, notes, hub history, summary versions, settings) lives only in the browser you typed it into — which is why your home work, night plan entries, and pulled Freshdesk tickets all vanished when you signed in from another machine.

After this, the same signed-in account sees the same data anywhere. Contact Dispatch will let you start testing because your accounts list will load from the cloud instead of being empty on a fresh browser.

## Database (Lovable Cloud)

One row per record, all scoped to your user via `user_id = auth.uid()` with RLS so nobody else can see your work.

New tables:

- `accounts` — account number, name, status, notes, archived flag
- `tickets` — ticket number, account link, subject, status, priority, due, sync info, classification, demo flag
- `ticket_notes` — Freshdesk notes pulled in
- `ticket_attachments` — Freshdesk attachments pulled in
- `ticket_hub_history` — your in-portal notes & system events on a ticket
- `ticket_snips` — snip metadata (image data url stored in row; large images later moved to storage if needed)
- `ticket_work_sessions` — issue/changes/result/notes/generated-note per ticket
- `dispatch_sessions` — Contact Dispatch testing session header (account, ticket link, status, timestamps)
- `dispatch_reasons` — reason-for-call rows, with retest history as JSON
- `dispatch_checks` — phone / repeat / save section check rows
- `dispatch_summary_versions` — generated summary note history
- `additional_work` — additional-work items + their snips/notes as JSON
- `night_plan_items` — night shift plan rows (priority, status, conversion link)
- `recent_tickets` — recently-opened ticket ids per shift
- `dropdown_labels` — your customized dropdown options (one row per group)
- `dispatch_templates` — your saved dispatch templates

All policies: `auth.uid() = user_id` for SELECT/INSERT/UPDATE/DELETE. GRANTs to `authenticated` and `service_role` per Lovable Cloud rules. RLS on. `updated_at` triggers where useful.

## Code changes

Rewrite each store under `src/lib/` to read & write through Lovable Cloud instead of localStorage, keeping the same public API so the rest of the app doesn't change:

- `tickets-store.ts`, `dispatch-store.ts`, `accounts-store.ts`, `additional-work-store.ts`, `night-plan-store.ts`
- `lib/settings/dropdowns-store.ts`, `lib/settings/dispatch-templates-store.ts`

Each store becomes a thin cache backed by Supabase queries:

- On first mount per session, hydrate from the cloud
- Mutations call Supabase, then update the in-memory cache and notify subscribers (same `useSyncExternalStore` pattern as today)
- Components keep working unchanged

Settings page gets a small **"Sync local data to cloud"** card that:
1. Runs automatically on first sign-in if it detects localStorage data that isn't in the cloud yet
2. Pushes everything from localStorage (tickets, sessions, accounts, additional work, night plan, dropdown labels, templates) into the user's cloud tables
3. Marks the local data as migrated so it doesn't re-upload on every login
4. Shows a "Re-run import" button in case anything is missed

After successful migration, localStorage stays as a write-through cache for offline resilience, but the cloud is the source of truth.

## What this fixes

- **Night Shift Plan entries persist** across devices/browsers — they're in your user's `night_plan_items` table, not localStorage.
- **Freshdesk ticket you worked on at home is in the cloud** the next time you sign in at work. Same for snips, hub notes, and the work session (issue/changes/result/generated note).
- **Contact Dispatch Start Testing works on any device** because your accounts list loads from the cloud. The Start button stays disabled today only because the account search returns nothing on a fresh browser.
- Pulling a ticket from Freshdesk continues to use the existing server function (`freshdeskPullTicket`) — that already works, the only change is the resulting ticket gets stored in the cloud table instead of localStorage.

## Out of scope

- Real-time sync between two open tabs (each tab refreshes on focus / on mutation; live websocket sync can come later).
- Sharing data between coworkers — each user only sees their own rows.
- Moving snip image data to Lovable Storage buckets (kept inline for now; can migrate later if images get large).
- Touching the existing Freshdesk integration server functions, theme/QB tuning sync (already cloud-backed), or auth.

## Files

**New migration** — all tables, grants, RLS, policies, triggers

**Edited stores** (same exports, new backend)
- `src/lib/tickets-store.ts`
- `src/lib/dispatch-store.ts`
- `src/lib/accounts-store.ts`
- `src/lib/additional-work-store.ts`
- `src/lib/night-plan-store.ts`
- `src/lib/settings/dropdowns-store.ts`
- `src/lib/settings/dispatch-templates-store.ts`

**New**
- `src/lib/cloud-sync/migrate-local-to-cloud.ts` — one-time import logic
- `src/components/settings/CloudSyncSection.tsx` — Settings card to trigger / re-run import
- Wired into `src/routes/_authenticated/route.tsx` so the auto-import runs on first sign-in per device

**Edited**
- `src/routes/_authenticated/settings.tsx` — add the Cloud Sync section
