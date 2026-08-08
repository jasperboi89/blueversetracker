CREATE TABLE public.is_script_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind text NOT NULL DEFAULT 'prompt',
  title text NOT NULL DEFAULT 'Untitled entry',
  script_body text NOT NULL DEFAULT '',
  usage_html text NOT NULL DEFAULT '',
  reason_html text NOT NULL DEFAULT '',
  example_html text NOT NULL DEFAULT '',
  tags text[] NOT NULL DEFAULT '{}'::text[],
  is_pinned boolean NOT NULL DEFAULT false,
  is_favorite boolean NOT NULL DEFAULT false,
  is_archived boolean NOT NULL DEFAULT false,
  attachments jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.is_script_entries TO authenticated;
GRANT ALL ON public.is_script_entries TO service_role;
ALTER TABLE public.is_script_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own IS script entries" ON public.is_script_entries
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER is_script_entries_set_updated BEFORE UPDATE ON public.is_script_entries
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX is_script_entries_user_idx ON public.is_script_entries (user_id, updated_at DESC);

CREATE TABLE public.is_manuals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  category text NOT NULL DEFAULT 'other',
  page_count integer NOT NULL DEFAULT 0,
  size_bytes bigint NOT NULL DEFAULT 0,
  storage_path text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.is_manuals TO authenticated;
GRANT ALL ON public.is_manuals TO service_role;
ALTER TABLE public.is_manuals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own IS manuals" ON public.is_manuals
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER is_manuals_set_updated BEFORE UPDATE ON public.is_manuals
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.is_manual_pages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  manual_id uuid NOT NULL REFERENCES public.is_manuals(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  page_number integer NOT NULL,
  text text NOT NULL DEFAULT '',
  search_vector tsvector GENERATED ALWAYS AS (to_tsvector('simple', coalesce(text, ''))) STORED,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (manual_id, page_number)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.is_manual_pages TO authenticated;
GRANT ALL ON public.is_manual_pages TO service_role;
ALTER TABLE public.is_manual_pages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own IS manual pages" ON public.is_manual_pages
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX is_manual_pages_search_idx ON public.is_manual_pages USING GIN (search_vector);
CREATE INDEX is_manual_pages_manual_idx ON public.is_manual_pages (manual_id, page_number);

CREATE OR REPLACE FUNCTION public.search_is_manual_pages(p_query text, p_limit integer DEFAULT 40)
RETURNS TABLE (
  manual_id uuid,
  manual_name text,
  category text,
  page_number integer,
  text text
)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT p.manual_id, m.name, m.category, p.page_number, p.text
  FROM public.is_manual_pages p
  JOIN public.is_manuals m ON m.id = p.manual_id
  WHERE p.user_id = auth.uid()
    AND nullif(btrim(p_query), '') IS NOT NULL
    AND (
      p.text ILIKE '%' || replace(replace(p_query, '%', E'\\%'), '_', E'\\_') || '%' ESCAPE E'\\'
      OR p.search_vector @@ websearch_to_tsquery('simple', p_query)
    )
  ORDER BY
    CASE WHEN p.text ILIKE '%' || replace(replace(p_query, '%', E'\\%'), '_', E'\\_') || '%' ESCAPE E'\\' THEN 0 ELSE 1 END,
    ts_rank_cd(p.search_vector, websearch_to_tsquery('simple', p_query)) DESC,
    p.page_number ASC
  LIMIT least(greatest(p_limit, 1), 200);
$$;