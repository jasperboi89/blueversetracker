
-- Helper trigger function (already exists in this project as public.update_updated_at_column)

-- =========================
-- accounts
-- =========================
CREATE TABLE public.accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  number TEXT NOT NULL,
  name TEXT NOT NULL,
  status TEXT,
  notes TEXT,
  archived BOOLEAN NOT NULL DEFAULT false,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, number)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.accounts TO authenticated;
GRANT ALL ON public.accounts TO service_role;
ALTER TABLE public.accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own accounts" ON public.accounts FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER accounts_set_updated BEFORE UPDATE ON public.accounts FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =========================
-- tickets
-- =========================
CREATE TABLE public.tickets (
  id TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  number TEXT NOT NULL,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, number)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tickets TO authenticated;
GRANT ALL ON public.tickets TO service_role;
ALTER TABLE public.tickets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own tickets" ON public.tickets FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER tickets_set_updated BEFORE UPDATE ON public.tickets FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =========================
-- ticket_work_sessions
-- =========================
CREATE TABLE public.ticket_work_sessions (
  ticket_id TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ticket_work_sessions TO authenticated;
GRANT ALL ON public.ticket_work_sessions TO service_role;
ALTER TABLE public.ticket_work_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own work sessions" ON public.ticket_work_sessions FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER ticket_work_sessions_set_updated BEFORE UPDATE ON public.ticket_work_sessions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =========================
-- dispatch_sessions
-- =========================
CREATE TABLE public.dispatch_sessions (
  id TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.dispatch_sessions TO authenticated;
GRANT ALL ON public.dispatch_sessions TO service_role;
ALTER TABLE public.dispatch_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own dispatch sessions" ON public.dispatch_sessions FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER dispatch_sessions_set_updated BEFORE UPDATE ON public.dispatch_sessions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =========================
-- additional_work
-- =========================
CREATE TABLE public.additional_work (
  id TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.additional_work TO authenticated;
GRANT ALL ON public.additional_work TO service_role;
ALTER TABLE public.additional_work ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own additional work" ON public.additional_work FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER additional_work_set_updated BEFORE UPDATE ON public.additional_work FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =========================
-- night_plan_items
-- =========================
CREATE TABLE public.night_plan_items (
  id TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  shift_key TEXT NOT NULL,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX night_plan_items_user_shift ON public.night_plan_items(user_id, shift_key);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.night_plan_items TO authenticated;
GRANT ALL ON public.night_plan_items TO service_role;
ALTER TABLE public.night_plan_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own night plan" ON public.night_plan_items FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER night_plan_items_set_updated BEFORE UPDATE ON public.night_plan_items FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =========================
-- recent_tickets (per shift)
-- =========================
CREATE TABLE public.recent_tickets (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  shift_key TEXT NOT NULL,
  ticket_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, shift_key)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.recent_tickets TO authenticated;
GRANT ALL ON public.recent_tickets TO service_role;
ALTER TABLE public.recent_tickets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own recents" ON public.recent_tickets FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER recent_tickets_set_updated BEFORE UPDATE ON public.recent_tickets FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =========================
-- dropdown_labels (one row per group key)
-- =========================
CREATE TABLE public.dropdown_labels (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  group_key TEXT NOT NULL,
  options JSONB NOT NULL DEFAULT '[]'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, group_key)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.dropdown_labels TO authenticated;
GRANT ALL ON public.dropdown_labels TO service_role;
ALTER TABLE public.dropdown_labels ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own dropdowns" ON public.dropdown_labels FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER dropdown_labels_set_updated BEFORE UPDATE ON public.dropdown_labels FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =========================
-- dispatch_templates
-- =========================
CREATE TABLE public.dispatch_templates (
  id TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.dispatch_templates TO authenticated;
GRANT ALL ON public.dispatch_templates TO service_role;
ALTER TABLE public.dispatch_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own dispatch templates" ON public.dispatch_templates FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER dispatch_templates_set_updated BEFORE UPDATE ON public.dispatch_templates FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
