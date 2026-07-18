CREATE TABLE public.achievements_unlocked (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  achievement_id TEXT NOT NULL,
  tier TEXT NOT NULL,
  progress_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  unlocked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, achievement_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.achievements_unlocked TO authenticated;
GRANT ALL ON public.achievements_unlocked TO service_role;

ALTER TABLE public.achievements_unlocked ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own achievements"
  ON public.achievements_unlocked FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users insert own achievements"
  ON public.achievements_unlocked FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users delete own achievements"
  ON public.achievements_unlocked FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE INDEX achievements_unlocked_user_idx
  ON public.achievements_unlocked (user_id, unlocked_at DESC);