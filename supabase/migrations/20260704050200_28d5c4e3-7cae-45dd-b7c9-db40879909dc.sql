-- Audit tables are written only by trusted server-side code via the service role
-- (which bypasses RLS). Add an explicit policy that blocks all authenticated
-- client inserts so intent is unambiguous to auditors and future maintainers.

CREATE POLICY "Block client inserts to auth audit log"
  ON public.auth_audit_log FOR INSERT TO authenticated
  WITH CHECK (false);

CREATE POLICY "Block client inserts to ticket access log"
  ON public.ticket_access_log FOR INSERT TO authenticated
  WITH CHECK (false);