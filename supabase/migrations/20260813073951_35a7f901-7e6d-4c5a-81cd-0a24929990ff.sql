CREATE TABLE public.action_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  action_id text NOT NULL,
  idempotency_key text NOT NULL,
  action_type text NOT NULL,
  origin text NOT NULL,
  operator_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  entity_type text,
  entity_id text,
  proposal_id text,
  status text NOT NULL DEFAULT 'executing',
  before_state jsonb,
  after_state jsonb,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  executed_at timestamptz
);

CREATE UNIQUE INDEX action_ledger_operator_key_uidx
  ON public.action_ledger (operator_user_id, idempotency_key);
CREATE INDEX action_ledger_operator_created_idx
  ON public.action_ledger (operator_user_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE ON public.action_ledger TO authenticated;
GRANT ALL ON public.action_ledger TO service_role;

ALTER TABLE public.action_ledger ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Operators read their own action records"
  ON public.action_ledger FOR SELECT TO authenticated
  USING (auth.uid() = operator_user_id);

CREATE POLICY "Operators insert their own action records"
  ON public.action_ledger FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = operator_user_id);

CREATE POLICY "Operators finalize their own action records"
  ON public.action_ledger FOR UPDATE TO authenticated
  USING (auth.uid() = operator_user_id)
  WITH CHECK (auth.uid() = operator_user_id);