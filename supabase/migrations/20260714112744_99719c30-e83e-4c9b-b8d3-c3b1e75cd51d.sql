-- Personal BlueVerse work/training knowledge vault.
CREATE TABLE public.knowledge_folders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 80),
  description text NOT NULL DEFAULT '' CHECK (char_length(description) <= 500),
  color text NOT NULL DEFAULT '#22d3ee' CHECK (color ~ '^#[0-9A-Fa-f]{6}$'),
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, name)
);

CREATE TABLE public.knowledge_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  folder_id uuid REFERENCES public.knowledge_folders(id) ON DELETE SET NULL,
  title text NOT NULL DEFAULT 'Untitled note' CHECK (char_length(title) BETWEEN 1 AND 200),
  content_html text NOT NULL DEFAULT '' CHECK (char_length(content_html) <= 250000),
  note_type text NOT NULL DEFAULT 'work-note'
    CHECK (note_type IN ('work-note', 'training', 'prompt', 'procedure', 'reference')),
  tags text[] NOT NULL DEFAULT '{}',
  is_pinned boolean NOT NULL DEFAULT false,
  is_favorite boolean NOT NULL DEFAULT false,
  is_archived boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX knowledge_folders_owner_order_idx
  ON public.knowledge_folders (user_id, sort_order, name);
CREATE INDEX knowledge_notes_owner_updated_idx
  ON public.knowledge_notes (user_id, is_archived, updated_at DESC);
CREATE INDEX knowledge_notes_folder_idx
  ON public.knowledge_notes (user_id, folder_id, updated_at DESC);
CREATE INDEX knowledge_notes_tags_idx
  ON public.knowledge_notes USING gin (tags);

REVOKE ALL ON public.knowledge_folders, public.knowledge_notes FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.knowledge_folders, public.knowledge_notes TO authenticated;
GRANT ALL ON public.knowledge_folders, public.knowledge_notes TO service_role;

ALTER TABLE public.knowledge_folders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.knowledge_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own knowledge folders"
  ON public.knowledge_folders FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users manage own knowledge notes"
  ON public.knowledge_notes FOR ALL TO authenticated
  USING (
    auth.uid() = user_id
    AND (
      folder_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.knowledge_folders f
        WHERE f.id = folder_id AND f.user_id = auth.uid()
      )
    )
  )
  WITH CHECK (
    auth.uid() = user_id
    AND (
      folder_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.knowledge_folders f
        WHERE f.id = folder_id AND f.user_id = auth.uid()
      )
    )
  );

CREATE TRIGGER knowledge_folders_set_updated
BEFORE UPDATE ON public.knowledge_folders
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER knowledge_notes_set_updated
BEFORE UPDATE ON public.knowledge_notes
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();