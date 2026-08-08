CREATE TABLE public.shift_handoffs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  shift_key text NOT NULL DEFAULT '',
  shift_date date NOT NULL DEFAULT (now() AT TIME ZONE 'America/Chicago')::date,
  summary text NOT NULL DEFAULT '',
  watch_items jsonb NOT NULL DEFAULT '[]'::jsonb,
  open_items jsonb NOT NULL DEFAULT '[]'::jsonb,
  escalations text NOT NULL DEFAULT '',
  notes text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'draft',
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX shift_handoffs_user_shift_key_idx ON public.shift_handoffs (user_id, shift_key);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.shift_handoffs TO authenticated;
GRANT ALL ON public.shift_handoffs TO service_role;

ALTER TABLE public.shift_handoffs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own shift handoffs"
  ON public.shift_handoffs FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER shift_handoffs_set_updated
  BEFORE UPDATE ON public.shift_handoffs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();