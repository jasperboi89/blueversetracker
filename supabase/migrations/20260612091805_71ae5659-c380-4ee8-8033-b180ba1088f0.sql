-- Extensions
CREATE EXTENSION IF NOT EXISTS citext;

-- Role enum
DO $$ BEGIN
  CREATE TYPE public.app_role AS ENUM ('admin', 'programmer', 'viewer');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- authorized_users table
CREATE TABLE public.authorized_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  email citext UNIQUE NOT NULL,
  role public.app_role NOT NULL DEFAULT 'viewer',
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','disabled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  last_login_at timestamptz
);

GRANT SELECT, INSERT, UPDATE ON public.authorized_users TO authenticated;
GRANT ALL ON public.authorized_users TO service_role;

ALTER TABLE public.authorized_users ENABLE ROW LEVEL SECURITY;

-- has_role helper (security definer to avoid RLS recursion)
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.authorized_users
    WHERE user_id = _user_id
      AND role = _role
      AND status = 'active'
  )
$$;

-- Policies on authorized_users
CREATE POLICY "Users can view own authorized row"
  ON public.authorized_users FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Admins can view all authorized users"
  ON public.authorized_users FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can insert authorized users"
  ON public.authorized_users FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update authorized users"
  ON public.authorized_users FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- auth_audit_log table
CREATE TABLE public.auth_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type text NOT NULL CHECK (event_type IN (
    'login_success','login_failed','logout','access_denied','session_timeout','role_check_failed'
  )),
  user_id uuid,
  email text,
  role public.app_role,
  ip text,
  user_agent text,
  meta jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.auth_audit_log TO authenticated;
GRANT ALL ON public.auth_audit_log TO service_role;

ALTER TABLE public.auth_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view audit log"
  ON public.auth_audit_log FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Trigger: link auth.users to authorized_users by email on signup
CREATE OR REPLACE FUNCTION public.link_authorized_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.authorized_users
     SET user_id = NEW.id
   WHERE email = NEW.email::citext
     AND user_id IS NULL;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created_link_authorized
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.link_authorized_user();

-- Seed first admin
INSERT INTO public.authorized_users (email, role, status)
VALUES ('lucast@anser.com', 'admin', 'active')
ON CONFLICT (email) DO NOTHING;
