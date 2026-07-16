-- Keep AI-organized Knowledge Vault content separate from the original note.
ALTER TABLE public.knowledge_notes
  ADD COLUMN IF NOT EXISTS ai_content_html text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS ai_generated_at timestamptz,
  ADD COLUMN IF NOT EXISTS ai_source_fingerprint text NOT NULL DEFAULT '';

COMMENT ON COLUMN public.knowledge_notes.ai_content_html IS
  'Editable AI-organized copy. The original note remains in content_html.';
COMMENT ON COLUMN public.knowledge_notes.ai_generated_at IS
  'When the current AI-organized copy was generated.';
COMMENT ON COLUMN public.knowledge_notes.ai_source_fingerprint IS
  'Client-generated fingerprint of content_html used to detect stale AI output.';
