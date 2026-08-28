-- Phase 3.5B fix: enforce the append-only grant contract on the Operational
-- Event Ledger. Project-level default privileges had granted anon and
-- authenticated full table privileges (including UPDATE/DELETE/TRUNCATE),
-- which contradicts the ledger's immutability contract. RLS already blocked
-- these operations (no UPDATE/DELETE policies exist), but defence in depth
-- requires the grants themselves to be correct.

revoke all on public.operational_event_ledger from anon;
revoke all on public.operational_event_ledger from authenticated;

grant select, insert on public.operational_event_ledger to authenticated;
grant all on public.operational_event_ledger to service_role;
