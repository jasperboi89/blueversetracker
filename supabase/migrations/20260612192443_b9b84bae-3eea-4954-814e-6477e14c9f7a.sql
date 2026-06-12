CREATE TABLE public.qb_discoveries (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('ticket','dispatch','night_plan','shift')),
  label text NOT NULL,
  context jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, DELETE ON public.qb_discoveries TO authenticated;
GRANT ALL ON public.qb_discoveries TO service_role;

ALTER TABLE public.qb_discoveries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users select own discoveries" ON public.qb_discoveries
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Users insert own discoveries" ON public.qb_discoveries
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users delete own discoveries" ON public.qb_discoveries
  FOR DELETE TO authenticated USING (user_id = auth.uid());

CREATE INDEX qb_discoveries_user_created_idx
  ON public.qb_discoveries (user_id, created_at DESC);