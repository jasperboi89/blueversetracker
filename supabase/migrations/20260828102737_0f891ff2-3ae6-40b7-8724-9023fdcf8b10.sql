-- Phase 4: Script Intelligence & Dependency Cortex — append-only structural history.
CREATE TABLE public.script_versions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  operator_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  script_id uuid NOT NULL REFERENCES public.is_script_entries(id) ON DELETE CASCADE,
  version_number integer NOT NULL,
  schema_version integer NOT NULL DEFAULT 1,
  kind text NOT NULL,
  title text NOT NULL DEFAULT '',
  content_fingerprint text NOT NULL,
  structure_fingerprint text NOT NULL,
  structure jsonb NOT NULL DEFAULT '{}'::jsonb,
  complexity jsonb NOT NULL DEFAULT '{}'::jsonb,
  component_count integer NOT NULL DEFAULT 0,
  dependency_count integer NOT NULL DEFAULT 0,
  unknown_count integer NOT NULL DEFAULT 0,
  ingested_at timestamp with time zone NOT NULL DEFAULT now(),
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Idempotent ingestion: re-analysing unchanged content must not create a new version.
CREATE UNIQUE INDEX script_versions_operator_script_fingerprint_key
  ON public.script_versions (operator_user_id, script_id, content_fingerprint);
CREATE UNIQUE INDEX script_versions_operator_script_version_key
  ON public.script_versions (operator_user_id, script_id, version_number);
CREATE INDEX script_versions_script_recent_idx
  ON public.script_versions (operator_user_id, script_id, version_number DESC);
CREATE INDEX script_versions_structure_fingerprint_idx
  ON public.script_versions (operator_user_id, structure_fingerprint);

-- Append-only surface: select + insert only. Project-level default privileges
-- can grant more than intended, so explicitly revoke everything first and then
-- grant back only the append-oriented rights (mirrors the ledger security model).
REVOKE ALL ON public.script_versions FROM anon;
REVOKE ALL ON public.script_versions FROM authenticated;
GRANT SELECT, INSERT ON public.script_versions TO authenticated;
GRANT ALL ON public.script_versions TO service_role;

ALTER TABLE public.script_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Operators read their own script versions"
  ON public.script_versions FOR SELECT TO authenticated
  USING (auth.uid() = operator_user_id);

CREATE POLICY "Operators append their own script versions"
  ON public.script_versions FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = operator_user_id);