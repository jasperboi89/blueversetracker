
ALTER TABLE public.freshdesk_search_sync_state
  ADD COLUMN IF NOT EXISTS target_group_ids jsonb;

CREATE TABLE IF NOT EXISTS public.freshdesk_excluded_tickets (
  ticket_id bigint PRIMARY KEY,
  reason text NOT NULL,
  subject text,
  group_id bigint,
  excluded_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.freshdesk_excluded_tickets TO authenticated;
GRANT ALL ON public.freshdesk_excluded_tickets TO service_role;

ALTER TABLE public.freshdesk_excluded_tickets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view excluded tickets"
  ON public.freshdesk_excluded_tickets FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can insert excluded tickets"
  ON public.freshdesk_excluded_tickets FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update excluded tickets"
  ON public.freshdesk_excluded_tickets FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete excluded tickets"
  ON public.freshdesk_excluded_tickets FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE INDEX IF NOT EXISTS freshdesk_excluded_tickets_reason_idx
  ON public.freshdesk_excluded_tickets (reason);
CREATE INDEX IF NOT EXISTS freshdesk_excluded_tickets_excluded_at_idx
  ON public.freshdesk_excluded_tickets (excluded_at DESC);
