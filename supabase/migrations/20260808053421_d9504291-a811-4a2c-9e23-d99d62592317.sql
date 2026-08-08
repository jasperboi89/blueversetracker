CREATE TABLE public.account_change_records (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  account_number text NOT NULL DEFAULT '',
  account_name text NOT NULL DEFAULT '',
  title text NOT NULL DEFAULT 'Untitled change',
  change_type text NOT NULL DEFAULT 'other',
  before_text text NOT NULL DEFAULT '',
  after_text text NOT NULL DEFAULT '',
  requester text NOT NULL DEFAULT '',
  risk text NOT NULL DEFAULT 'low',
  status text NOT NULL DEFAULT 'draft',
  rollback_note text NOT NULL DEFAULT '',
  checklist jsonb NOT NULL DEFAULT '[]'::jsonb,
  ticket_number text NOT NULL DEFAULT '',
  work_ref text NOT NULL DEFAULT '',
  tested_by text NOT NULL DEFAULT '',
  notes text NOT NULL DEFAULT '',
  verified_at timestamp with time zone,
  applied_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.account_change_records TO authenticated;
GRANT ALL ON public.account_change_records TO service_role;

ALTER TABLE public.account_change_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own change records"
  ON public.account_change_records FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX account_change_records_user_account_idx
  ON public.account_change_records (user_id, account_number, created_at DESC);

CREATE TRIGGER account_change_records_set_updated
  BEFORE UPDATE ON public.account_change_records
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();