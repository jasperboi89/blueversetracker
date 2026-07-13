-- ============================================================
-- Migration 1: 20260712000000_freshdesk_search_index.sql
-- ============================================================
CREATE TABLE public.freshdesk_search_documents (
  ticket_id bigint PRIMARY KEY,
  ticket jsonb NOT NULL,
  subject text NOT NULL DEFAULT '',
  description_text text NOT NULL DEFAULT '',
  conversation_text text NOT NULL DEFAULT '',
  requester_name text NOT NULL DEFAULT '',
  company_name text NOT NULL DEFAULT '',
  account_number text NOT NULL DEFAULT '',
  status integer NOT NULL,
  priority integer NOT NULL,
  group_id bigint,
  agent_id bigint,
  tags text[] NOT NULL DEFAULT '{}',
  custom_fields jsonb NOT NULL DEFAULT '{}'::jsonb,
  freshdesk_created_at timestamptz,
  freshdesk_updated_at timestamptz NOT NULL,
  indexed_at timestamptz NOT NULL DEFAULT now(),
  searchable_text text NOT NULL DEFAULT '',
  search_vector tsvector NOT NULL DEFAULT ''::tsvector
);

CREATE OR REPLACE FUNCTION public.refresh_freshdesk_search_document()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.searchable_text := concat_ws(E'\n',
    NEW.ticket_id::text,
    NEW.subject,
    NEW.description_text,
    NEW.conversation_text,
    NEW.requester_name,
    NEW.company_name,
    NEW.account_number,
    array_to_string(NEW.tags, ' '),
    NEW.custom_fields::text
  );
  NEW.search_vector := to_tsvector('simple'::regconfig, NEW.searchable_text);
  RETURN NEW;
END;
$$;

CREATE TRIGGER refresh_freshdesk_search_document_trigger
BEFORE INSERT OR UPDATE
ON public.freshdesk_search_documents
FOR EACH ROW EXECUTE FUNCTION public.refresh_freshdesk_search_document();

CREATE INDEX freshdesk_search_documents_vector_idx
  ON public.freshdesk_search_documents USING gin (search_vector);
CREATE INDEX freshdesk_search_documents_account_idx
  ON public.freshdesk_search_documents (account_number);
CREATE INDEX freshdesk_search_documents_updated_idx
  ON public.freshdesk_search_documents (freshdesk_updated_at DESC);
CREATE INDEX freshdesk_search_documents_filter_idx
  ON public.freshdesk_search_documents (status, priority, group_id, agent_id);

ALTER TABLE public.freshdesk_search_documents ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.freshdesk_search_documents FROM anon, authenticated;
GRANT ALL ON public.freshdesk_search_documents TO service_role;

CREATE TABLE public.freshdesk_search_sync_state (
  id text PRIMARY KEY DEFAULT 'primary' CHECK (id = 'primary'),
  next_page integer NOT NULL DEFAULT 1,
  next_offset integer NOT NULL DEFAULT 0,
  completed boolean NOT NULL DEFAULT false,
  tickets_indexed integer NOT NULL DEFAULT 0,
  conversations_indexed integer NOT NULL DEFAULT 0,
  started_at timestamptz,
  sync_since timestamptz,
  completed_at timestamptz,
  last_error text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.freshdesk_search_sync_state (id) VALUES ('primary')
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.freshdesk_search_sync_state ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.freshdesk_search_sync_state FROM anon, authenticated;
GRANT ALL ON public.freshdesk_search_sync_state TO service_role;

CREATE OR REPLACE FUNCTION public.search_freshdesk_documents(
  p_query text,
  p_limit integer DEFAULT 100
)
RETURNS SETOF public.freshdesk_search_documents
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT d.*
  FROM public.freshdesk_search_documents d
  WHERE
    d.searchable_text ILIKE '%' || replace(replace(p_query, '%', E'\\%'), '_', E'\\_') || '%' ESCAPE E'\\'
    OR (
      nullif(btrim(p_query), '') IS NOT NULL
      AND d.search_vector @@ websearch_to_tsquery('simple', p_query)
    )
  ORDER BY
    CASE WHEN d.searchable_text ILIKE '%' || replace(replace(p_query, '%', E'\\%'), '_', E'\\_') || '%' ESCAPE E'\\' THEN 0 ELSE 1 END,
    ts_rank_cd(d.search_vector, websearch_to_tsquery('simple', p_query)) DESC,
    d.freshdesk_updated_at DESC
  LIMIT least(greatest(p_limit, 1), 200);
$$;

REVOKE ALL ON FUNCTION public.search_freshdesk_documents(text, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.search_freshdesk_documents(text, integer) TO service_role;

-- ============================================================
-- Migration 2: 20260713000000_repair_freshdesk_search_index.sql
-- (idempotent repair — safe to apply on fresh install)
-- ============================================================
DROP FUNCTION IF EXISTS public.search_freshdesk_documents(text, integer);
DROP INDEX IF EXISTS public.freshdesk_search_documents_vector_idx;
DROP TRIGGER IF EXISTS refresh_freshdesk_search_document_trigger
  ON public.freshdesk_search_documents;

ALTER TABLE public.freshdesk_search_documents
  DROP COLUMN IF EXISTS search_vector,
  DROP COLUMN IF EXISTS searchable_text;

ALTER TABLE public.freshdesk_search_documents
  ADD COLUMN searchable_text text NOT NULL DEFAULT '',
  ADD COLUMN search_vector tsvector NOT NULL DEFAULT ''::tsvector;

CREATE OR REPLACE FUNCTION public.refresh_freshdesk_search_document()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.searchable_text := concat_ws(E'\n',
    NEW.ticket_id::text,
    NEW.subject,
    NEW.description_text,
    NEW.conversation_text,
    NEW.requester_name,
    NEW.company_name,
    NEW.account_number,
    array_to_string(NEW.tags, ' '),
    NEW.custom_fields::text
  );
  NEW.search_vector := to_tsvector('simple'::regconfig, NEW.searchable_text);
  RETURN NEW;
END;
$$;

CREATE TRIGGER refresh_freshdesk_search_document_trigger
BEFORE INSERT OR UPDATE
ON public.freshdesk_search_documents
FOR EACH ROW EXECUTE FUNCTION public.refresh_freshdesk_search_document();

UPDATE public.freshdesk_search_documents SET indexed_at = indexed_at;

CREATE INDEX freshdesk_search_documents_vector_idx
  ON public.freshdesk_search_documents USING gin (search_vector);

CREATE OR REPLACE FUNCTION public.search_freshdesk_documents(
  p_query text,
  p_limit integer DEFAULT 100
)
RETURNS SETOF public.freshdesk_search_documents
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT d.*
  FROM public.freshdesk_search_documents d
  WHERE
    d.searchable_text ILIKE '%' || replace(replace(p_query, '%', E'\\%'), '_', E'\\_') || '%' ESCAPE E'\\'
    OR (
      nullif(btrim(p_query), '') IS NOT NULL
      AND d.search_vector @@ websearch_to_tsquery('simple', p_query)
    )
  ORDER BY
    CASE WHEN d.searchable_text ILIKE '%' || replace(replace(p_query, '%', E'\\%'), '_', E'\\_') || '%' ESCAPE E'\\' THEN 0 ELSE 1 END,
    ts_rank_cd(d.search_vector, websearch_to_tsquery('simple', p_query)) DESC,
    d.freshdesk_updated_at DESC
  LIMIT least(greatest(p_limit, 1), 200);
$$;

REVOKE ALL ON FUNCTION public.search_freshdesk_documents(text, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.search_freshdesk_documents(text, integer)
  TO service_role;