CREATE TABLE public.ticket_access_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  email text,
  action text NOT NULL CHECK (action IN ('pull','sync','search','conversations','coverage')),
  ticket_number text,
  query text,
  ip text,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ticket_access_log_user_created_idx
  ON public.ticket_access_log (user_id, created_at DESC);
CREATE INDEX ticket_access_log_ticket_idx
  ON public.ticket_access_log (ticket_number);

GRANT SELECT ON public.ticket_access_log TO authenticated;
GRANT ALL ON public.ticket_access_log TO service_role;

ALTER TABLE public.ticket_access_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view ticket access log"
  ON public.ticket_access_log FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));