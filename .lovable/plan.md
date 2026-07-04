## Goal

Apply the pending `supabase/migrations/20260704000000_ticket_access_log.sql` migration so the HIPAA ticket-access audit table exists in Lovable Cloud. The merged code from GitHub already writes to it (`src/lib/api/ticket-access-log.ts`) and the Audit Log page reads from it, but the table is missing — confirmed via `to_regclass('public.ticket_access_log')` returning null.

## What the migration does

- Creates `public.ticket_access_log` with: `user_id`, `email`, `action` (check-constrained to `pull|sync|search|conversations|coverage`), `ticket_number`, `query`, `ip`, `user_agent`, plus id/created_at.
- Adds indexes on `(user_id, created_at DESC)` and `ticket_number`.
- Grants `SELECT` to `authenticated`, `ALL` to `service_role` (no `anon` — inserts are service-role only from server functions).
- Enables RLS with a single policy: admins (`has_role(auth.uid(), 'admin')`) can read.

## Steps

1. Run the SQL in `20260704000000_ticket_access_log.sql` via the migration tool (single call, exact contents of that file).
2. After it's approved and applied, the Audit Log → Ticket Access tab starts populating on the next ticket pull/search/sync. No code changes needed.

## Not in scope

- Disabling public signups and rotating the seeded password (dashboard tasks you already flagged as standing items).
- Any change to MCP, auth routes, or the merged Lovable code — the merge is already clean and building.