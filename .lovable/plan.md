## Goal

On the Freshdesk Intelligence tab, add a fast "Sync last 24h" flow that pulls tickets updated in the last 24 hours, upserts them into the persistent index by Freshdesk ticket id, and applies exclusion rules plus a group whitelist (Programming Support, Customer Support, Sup Pod - GB).

## Behaviour

1. **New button** "Sync last 24h" in `SearchDebugPanel.tsx`, next to the existing "Build / refresh index" button. The existing 6-month/rebuild flow stays unchanged.
2. Clicking it calls a new server function `freshdeskSync24h` that runs to completion in a single call (unlike the paged rebuild) and returns counts: pulled, upserted, excluded (by reason), skipped (wrong group).
3. Results and any errors are shown in the same status area the existing sync uses.

## Server function `freshdeskSync24h`

Location: `src/lib/api/freshdesk-index.functions.ts` (admin-only, mirrors `freshdeskSyncIndexBatch`).

Steps:
1. Resolve the three target group IDs.
   - Fetch `/api/v2/groups` via `fdFetch`.
   - Match names case-insensitively: `Programming Support`, `Customer Support`, `Sup Pod - GB`.
   - Cache the resolved IDs in the `freshdesk_search_sync_state` row (new nullable jsonb column `target_group_ids` via migration) so we only re-fetch when missing or when the user forces a rebuild.
   - If any of the three names cannot be matched, return `{ ok: false, error: "Group not found: <name>" }` and do not proceed.
2. List tickets with `updated_since = now - 24h`, `include=description,requester`, `order_by=updated_at`, `order_type=asc`, `per_page=100`, paging until fewer than 100 rows come back.
3. For each ticket, decide inclusion in this order and record a reason when excluded:
   1. **Spam/trash** — DTO `spam === true` or `deleted === true` → reason `spam_or_deleted`.
   2. **Group whitelist** — `group_id` not in the three resolved IDs → reason `group_not_allowed` (this is "skipped", not "excluded", but stored the same way).
   3. **Out-of-office / auto-reply** — subject or description matches, case-insensitive, any of: `out of office`, `automatic reply`, `auto-reply`, `autoreply`, `vacation reply`, `i am currently out`, `away from the office` → reason `auto_reply`.
   4. **Non-account** — after `normalizeTicket`, `accountNumber` is empty AND no matching account in `accounts-store` for the requester/company → reason `no_account_match`.
   5. **Keyword fallback for spam/trash** — subject/description contains `unsubscribe`, `viagra`, `winner`, `lottery`, `bitcoin giveaway` (short conservative list) → reason `keyword_spam`.
4. For included tickets: fetch conversations (reuse `fetchAllConversations`, same sequential pacing as existing batch) and upsert into `freshdesk_search_documents` with `onConflict: "ticket_id"`.
5. For excluded tickets: also delete any prior row for that ticket id from `freshdesk_search_documents` so a ticket that has just become spam/OOO drops out of search results, and record the exclusion in a new lightweight table `freshdesk_excluded_tickets` (columns: `ticket_id bigint pk`, `reason text`, `subject text`, `excluded_at timestamptz`, RLS admin-only) so we can review why something was skipped.
6. Return a summary: `{ ok: true, pulled, upserted, excluded: { spam_or_deleted, auto_reply, no_account_match, keyword_spam }, skipped_wrong_group, groupIds }`.

## UI changes

- `src/components/freshdesk-intel/SearchDebugPanel.tsx`:
  - Add `Sync last 24h` button beside the existing button.
  - On click, call `freshdeskSync24h`, show `Pulled X, indexed Y, excluded Z (spam A / auto-reply B / no account C / keyword D), skipped by group E` in the status line.
  - Surface any error the same way existing errors are shown.

## Database migration

- `alter table freshdesk_search_sync_state add column target_group_ids jsonb`.
- New `freshdesk_excluded_tickets` table with admin-only RLS + GRANTs (SELECT/INSERT/UPDATE/DELETE to authenticated gated by `has_role(auth.uid(),'admin')`, ALL to service_role).

## Out of scope

- No changes to search ranking or the 6-month rebuild flow.
- No UI for browsing the excluded-tickets table in this pass — the counts in the sync summary are the immediate feedback.
