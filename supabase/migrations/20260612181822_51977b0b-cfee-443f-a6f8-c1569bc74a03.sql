
CREATE TABLE public.user_theme_prefs (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  theme text NOT NULL DEFAULT 'blueverse' CHECK (theme IN ('blueverse','quantum-bloom')),
  qb_first_entry_completed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_theme_prefs TO authenticated;
GRANT ALL ON public.user_theme_prefs TO service_role;

ALTER TABLE public.user_theme_prefs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users select own theme prefs"
  ON public.user_theme_prefs FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users insert own theme prefs"
  ON public.user_theme_prefs FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users update own theme prefs"
  ON public.user_theme_prefs FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_user_theme_prefs_updated_at
  BEFORE UPDATE ON public.user_theme_prefs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
