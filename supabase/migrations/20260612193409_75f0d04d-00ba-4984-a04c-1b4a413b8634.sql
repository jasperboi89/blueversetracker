CREATE TABLE public.qb_tuning_prefs (
  user_id uuid NOT NULL PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  visual_intensity smallint NOT NULL DEFAULT 3 CHECK (visual_intensity BETWEEN 1 AND 5),
  event_frequency text NOT NULL DEFAULT 'normal' CHECK (event_frequency IN ('off','low','normal','high')),
  particle_density text NOT NULL DEFAULT 'medium' CHECK (particle_density IN ('low','medium','high')),
  sleep_mode boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.qb_tuning_prefs TO authenticated;
GRANT ALL ON public.qb_tuning_prefs TO service_role;

ALTER TABLE public.qb_tuning_prefs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users select own tuning" ON public.qb_tuning_prefs
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Users insert own tuning" ON public.qb_tuning_prefs
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users update own tuning" ON public.qb_tuning_prefs
  FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE TRIGGER qb_tuning_prefs_set_updated_at
BEFORE UPDATE ON public.qb_tuning_prefs
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Allow cosmic-weather entries in the Discovery Log
ALTER TABLE public.qb_discoveries DROP CONSTRAINT qb_discoveries_kind_check;
ALTER TABLE public.qb_discoveries
  ADD CONSTRAINT qb_discoveries_kind_check
  CHECK (kind IN ('ticket','dispatch','night_plan','shift','cosmic'));