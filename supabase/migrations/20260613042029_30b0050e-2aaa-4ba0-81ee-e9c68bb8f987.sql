
DROP TABLE IF EXISTS public.accounts CASCADE;
DROP TABLE IF EXISTS public.tickets CASCADE;
DROP TABLE IF EXISTS public.ticket_work_sessions CASCADE;
DROP TABLE IF EXISTS public.dispatch_sessions CASCADE;
DROP TABLE IF EXISTS public.additional_work CASCADE;
DROP TABLE IF EXISTS public.night_plan_items CASCADE;
DROP TABLE IF EXISTS public.recent_tickets CASCADE;
DROP TABLE IF EXISTS public.dropdown_labels CASCADE;
DROP TABLE IF EXISTS public.dispatch_templates CASCADE;

CREATE TABLE public.user_store_blobs (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  store_key TEXT NOT NULL,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, store_key)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_store_blobs TO authenticated;
GRANT ALL ON public.user_store_blobs TO service_role;
ALTER TABLE public.user_store_blobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own blobs" ON public.user_store_blobs FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER user_store_blobs_set_updated BEFORE UPDATE ON public.user_store_blobs FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
