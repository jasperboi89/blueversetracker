ALTER TABLE public.knowledge_notes
  ADD COLUMN IF NOT EXISTS ai_content_html text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS ai_generated_at timestamptz,
  ADD COLUMN IF NOT EXISTS ai_source_fingerprint text NOT NULL DEFAULT '';