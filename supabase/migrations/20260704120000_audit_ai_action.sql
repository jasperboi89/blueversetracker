-- Allow 'ai' as a ticket_access_log action so AI requests (which send Hub data
-- to the model) are recorded in the same HIPAA access-audit trail. Drops any
-- existing CHECK constraint on the action column by name-agnostic lookup, then
-- re-adds it with 'ai' included.
DO $$
DECLARE
  c record;
BEGIN
  FOR c IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.ticket_access_log'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%action%'
  LOOP
    EXECUTE format('ALTER TABLE public.ticket_access_log DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;

ALTER TABLE public.ticket_access_log
  ADD CONSTRAINT ticket_access_log_action_check
  CHECK (action IN ('pull', 'sync', 'search', 'conversations', 'coverage', 'ai'));
