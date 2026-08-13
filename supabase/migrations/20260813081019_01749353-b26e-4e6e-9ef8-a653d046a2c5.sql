CREATE TABLE public.resolution_memories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operator_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  account_number text NOT NULL DEFAULT '' CHECK (char_length(account_number) <= 40),
  account_name text NOT NULL DEFAULT '' CHECK (char_length(account_name) <= 120),
  problem text NOT NULL CHECK (char_length(problem) BETWEEN 1 AND 400),
  root_cause text NOT NULL DEFAULT '' CHECK (char_length(root_cause) <= 400),
  resolution text NOT NULL CHECK (char_length(resolution) BETWEEN 1 AND 800),
  testing text NOT NULL DEFAULT '' CHECK (char_length(testing) <= 400),
  rollback text NOT NULL DEFAULT '' CHECK (char_length(rollback) <= 400),
  affected_area text NOT NULL DEFAULT '' CHECK (char_length(affected_area) <= 80),
  confidence text NOT NULL DEFAULT 'unknown' CHECK (confidence IN ('verified','probable','unknown')),
  source_ticket_id text NOT NULL DEFAULT '' CHECK (char_length(source_ticket_id) <= 64),
  source_change_record_id uuid,
  source_work_item_id text NOT NULL DEFAULT '' CHECK (char_length(source_work_item_id) <= 64),
  source_dispatch_id text NOT NULL DEFAULT '' CHECK (char_length(source_dispatch_id) <= 64),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','superseded','archived')),
  supersedes_id uuid REFERENCES public.resolution_memories(id) ON DELETE SET NULL,
  fingerprint text NOT NULL DEFAULT '' CHECK (char_length(fingerprint) <= 80),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.resolution_memories TO authenticated;
GRANT ALL ON public.resolution_memories TO service_role;

ALTER TABLE public.resolution_memories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Operators manage their own resolution memories"
  ON public.resolution_memories
  FOR ALL
  TO authenticated
  USING (auth.uid() = operator_user_id)
  WITH CHECK (auth.uid() = operator_user_id);

CREATE INDEX resolution_memories_account_idx
  ON public.resolution_memories (operator_user_id, account_number, status, confidence, updated_at DESC);

CREATE INDEX resolution_memories_ticket_idx
  ON public.resolution_memories (operator_user_id, source_ticket_id)
  WHERE source_ticket_id <> '';

CREATE INDEX resolution_memories_area_idx
  ON public.resolution_memories (operator_user_id, affected_area)
  WHERE affected_area <> '';

CREATE UNIQUE INDEX resolution_memories_source_dedupe_idx
  ON public.resolution_memories (
    operator_user_id,
    source_ticket_id,
    coalesce(source_change_record_id::text, ''),
    source_work_item_id,
    source_dispatch_id,
    fingerprint
  )
  WHERE status <> 'archived';

CREATE TRIGGER resolution_memories_set_updated
  BEFORE UPDATE ON public.resolution_memories
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();