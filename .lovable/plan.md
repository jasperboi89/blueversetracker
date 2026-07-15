
## Goal

Let each Knowledge Vault note carry a set of attachments ("snips") — images pasted from clipboard, uploaded image files, or uploaded non-image files (PDF, docx, etc.) — shown as a gallery under the note, with click-to-preview and delete.

## Storage approach

Attachments live on the note row itself as a JSON array (no new tables, no Storage bucket required for v1). Each entry:

```
{ id, name, mimeType, isImage, dataUrl, sizeBytes, createdAt, label? }
```

`dataUrl` is a base64 data URL so paste + upload work identically and no bucket setup is needed. This mirrors the existing pattern in `AddWorkSnipModal.tsx` / `additional-work-store.ts` / dispatch `AddSnipModal.tsx`, so it stays consistent with the rest of the app. Cap per-file size at ~5 MB and total note payload under the existing 250k `contentHtml` budget by tracking attachments in a separate column.

## Backend changes

1. Migration: add `attachments jsonb not null default '[]'::jsonb` to `public.knowledge_notes`. No new grants/policies needed — inherits existing RLS.
2. `src/lib/knowledge/knowledge.functions.ts`:
   - Extend `KnowledgeNote` type + `mapNote` with `attachments`.
   - Add `attachments` (validated Zod array, max ~20 items, each dataUrl length capped ~7 MB base64) to `UpdateNoteSchema`.
   - Select `attachments` in `listKnowledgeVault`, `createKnowledgeNote`, `updateKnowledgeNote`.

## UI changes (all in `src/components/knowledge/KnowledgeVault.tsx`)

1. New "Attachments" section under the editor (and mirrored inside the expanded modal) with:
   - Drop zone / "Upload" button (file input, multiple)
   - Global paste listener while the note is focused — capture `image/*` clipboard items
   - Grid of thumbnails: image tiles show the image; non-image tiles show file icon + name
   - Click a tile → lightbox dialog (image full-size, or download link for non-images)
   - Hover shows delete (X) and rename affordance
2. Wire changes into the existing autosave debounce so attachments save via `updateKnowledgeNote`.
3. Small helper to reject files >5 MB with a toast.

## Out of scope

- No Supabase Storage bucket (kept as data URLs for v1 parity with existing snip modals).
- No drag-reorder, no cross-note copy, no OCR.
- No changes to folders, search, or note types.

## Verification

- Paste screenshot into a note → thumbnail appears, persists after reload.
- Upload a PDF → file tile appears, click downloads it.
- Delete an attachment → gone after autosave + reload.
- Works identically in the expanded modal.
