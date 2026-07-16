## Fix: Knowledge Vault "column knowledge_notes.ai_content_html does not exist"

The Knowledge Vault code reads three AI columns (`ai_content_html`, `ai_generated_at`, `ai_source_fingerprint`) from `knowledge_notes`, but the migration that adds them was never applied to your database — so every load fails with a Postgres "column does not exist" error and the vault refuses to render.

### Fix

Re-run the missing migration against the database so the columns exist:

```sql
ALTER TABLE public.knowledge_notes
  ADD COLUMN IF NOT EXISTS ai_content_html text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS ai_generated_at timestamptz,
  ADD COLUMN IF NOT EXISTS ai_source_fingerprint text NOT NULL DEFAULT '';
```

Uses `IF NOT EXISTS`, so it's safe if any column somehow already exists. No RLS, grant, or code changes needed — the app code already targets these columns.

### Verification

Reload `/knowledge-vault` — the error card is gone and notes list normally.