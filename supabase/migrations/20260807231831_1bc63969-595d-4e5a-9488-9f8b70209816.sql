ALTER TABLE public.knowledge_notes
  ADD COLUMN IF NOT EXISTS versions jsonb NOT NULL DEFAULT '[]'::jsonb;