-- Phase 3 — server-backed Operational Event Ledger (durable Layer 2).
--
-- Append-only, per-operator, immutable through normal application workflows:
-- authenticated operators may INSERT and SELECT their own rows; there is no
-- UPDATE/DELETE grant and no UPDATE/DELETE RLS policy, so events cannot be
-- rewritten by the app. Important dimensions (account, ticket, work item,
-- type, category, time) are first-class indexed columns; event-specific detail
-- stays in a small sanitized JSONB `metadata` — never bodies/PHI/secrets.
--
-- This does NOT replace the Phase 2 local bounded ledger; it is the durable
-- backing behind the same consumer-facing API. Server failure must never take
-- the portal down — the client treats every write/read as best-effort and
-- falls back to the local bounded cache.

create table if not exists public.operational_event_ledger (
  id uuid primary key default gen_random_uuid(),
  operator_user_id uuid not null references auth.users(id) on delete cascade,
  -- Event Spine event id — makes append idempotent per operator.
  event_id text not null,
  schema_version integer not null default 1,
  type text not null,
  category text not null default 'operational',
  source text not null default 'system',
  sensitivity text not null default 'operational'
    check (sensitivity in ('reference','operational','sensitive')),
  account_id text not null default '',
  ticket_id text not null default '',
  work_item_id text not null default '',
  dispatch_id text not null default '',
  occurred_at timestamptz not null,
  recorded_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  unique (operator_user_id, event_id)
);

-- Append-only surface: no UPDATE/DELETE for authenticated.
grant select, insert on public.operational_event_ledger to authenticated;
grant all on public.operational_event_ledger to service_role;

alter table public.operational_event_ledger enable row level security;

-- Operators may read their own history.
create policy "Operators read their own ledger"
  on public.operational_event_ledger for select to authenticated
  using (auth.uid() = operator_user_id);

-- Operators may append their own events (and only their own).
create policy "Operators append their own ledger"
  on public.operational_event_ledger for insert to authenticated
  with check (auth.uid() = operator_user_id);

-- Deliberately NO update/delete policy: the ledger is immutable through the app.

create index if not exists oel_owner_account_time_idx
  on public.operational_event_ledger (operator_user_id, account_id, occurred_at desc);
create index if not exists oel_owner_ticket_time_idx
  on public.operational_event_ledger (operator_user_id, ticket_id, occurred_at desc);
create index if not exists oel_owner_work_time_idx
  on public.operational_event_ledger (operator_user_id, work_item_id, occurred_at desc);
create index if not exists oel_owner_type_time_idx
  on public.operational_event_ledger (operator_user_id, type, occurred_at desc);
create index if not exists oel_owner_category_time_idx
  on public.operational_event_ledger (operator_user_id, category, occurred_at desc);
create index if not exists oel_owner_time_idx
  on public.operational_event_ledger (operator_user_id, occurred_at desc);
