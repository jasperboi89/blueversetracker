# IS Script Work area in the Knowledge Vault

A dedicated workspace inside the Knowledge Vault for IS script material — prompts, tree helps, calculations — plus a searchable library of IS manuals (Supervisor, Directory).

## 1. The IS Script Work tab

The vault gets a top-level "IS Script Work" section next to the existing notes area, with its own list and editor built for scripts rather than free-form notes.

Each entry has a kind: **Prompt**, **Tree help**, **Calculation**, **Snippet**, **Other** — filterable with counts.

Each entry captures:

- **Title**
- **Kind** (prompt / tree help / calculation / snippet / other)
- **Script body** — monospace code editor, wraps preserved exactly, with a one-click "Copy script"
- **What it's used for and where** — short rich-text field (the screen, tree, report, or client area it applies to)
- **Why we use it** — short rich-text field (the reasoning / the problem it solves)
- **Example values / expected result** — optional
- **Tags**, **pin/favorite**, **archive** — same behavior as notes
- **Attachments** — reuses the existing attachment panel (paste or upload snips)

List view supports search across title, body, usage, and reason; sort by updated / title / kind; and the same print action notes already have.

## 2. IS manuals library (PDF upload + search)

A second pane in the same tab: **Manuals**.

- Upload PDFs (IS Supervisor, IS Directory, anything else) by drag-and-drop or file picker.
- On upload the text of each page is extracted in the browser and stored alongside the file, so the manual becomes searchable.
- A search box across all manuals returns page-level hits: manual name, page number, and a highlighted snippet of surrounding text.
- Clicking a hit opens the PDF viewer at that page.
- "Save as entry" turns a hit into a new IS Script Work entry with the quote prefilled into "What it's used for and where".
- Manuals can be renamed, labeled (Supervisor / Directory / Other), and deleted.

## Technical notes

- New table `is_script_entries` (user-scoped, RLS + grants): `kind`, `title`, `script_body` text, `usage_html`, `reason_html`, `example_html`, `tags`, `is_pinned`, `is_favorite`, `is_archived`, `attachments jsonb`.
- New table `is_manuals` (metadata: name, category, page count, storage path) and `is_manual_pages` (`manual_id`, `page_number`, `text`, tsvector + GIN index) for page-level full-text search via a security-definer search function scoped to the owner.
- New private storage bucket `is-manuals` with owner-scoped policies; PDFs served through signed URLs.
- PDF text extraction runs client-side with `pdfjs-dist` (loaded lazily, browser-only — Worker runtime can't do native PDF parsing), then pages are inserted in batches.
- Server functions in `src/lib/is-scripts/is-scripts.functions.ts` and `src/lib/is-scripts/manuals.functions.ts`, following the existing knowledge functions pattern.
- UI: `src/components/knowledge/is-scripts/` (list, editor, manuals pane, PDF viewer), mounted as a tab in `KnowledgeVault.tsx` so the existing note code stays untouched.
