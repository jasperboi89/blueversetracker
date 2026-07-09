## Goal

Replace plain `<Textarea>` inputs across the app with a rich text editor that has a formatting toolbar. Save content as HTML going forward; existing plain-text values keep working.

## Approach

Use **Tiptap** (ProseMirror-based, headless, works cleanly with Tailwind and shadcn). Well-maintained, small, and lets us build the exact toolbar you asked for.

### New building blocks

1. `src/components/ui/rich-text-editor.tsx` — `<RichTextEditor value onChange placeholder className minHeight />`. Same props shape as our current `Textarea` so it's a near drop-in. Internally renders:
   - Sticky toolbar (see below)
   - Tiptap `EditorContent` styled with `prose` classes and our design tokens
2. `src/components/ui/rich-text-toolbar.tsx` — toolbar with grouped controls:
   - **Text**: Bold, Italic, Underline, Strikethrough
   - **Lists**: Bullet list, Numbered list
   - **Color**: Text color picker + Highlight color picker (small popover with a preset swatch grid + custom hex)
   - **Font**: Font family dropdown (System, Inter, Georgia, Courier New, Arial) and Font size dropdown (12 / 14 / 16 / 18 / 20 / 24)
   - **Clear formatting** button
3. `src/components/ui/rich-text.tsx` — `<RichText html />` view-only renderer. Sanitizes with DOMPurify and applies the same `prose` styling so notes render identically in read-only surfaces (drawers, cards, previews).
4. `src/lib/rich-text.ts` — helpers: `sanitizeHtml(html)`, `htmlToPlainText(html)` (for search / previews / AI prompts that still need plain text), `isEmptyHtml(html)` (treats `<p></p>` as empty).

### Packages to add

- `@tiptap/react`, `@tiptap/starter-kit`, `@tiptap/extension-underline`, `@tiptap/extension-text-style`, `@tiptap/extension-color`, `@tiptap/extension-highlight`, `@tiptap/extension-font-family`, `@tiptap/extension-placeholder`
- `dompurify` + `@types/dompurify`
- A small `FontSize` custom extension (built inline — Tiptap doesn't ship one, ~15 lines)

### Migration of existing Textareas

Sweep every file in the current `Textarea` usage list and swap to `RichTextEditor`:

- Ticket surfaces: `TicketPreviewDrawer`, `AddNoteModal`, `AddSnipModal`, `TicketLookupCard`, `freshdesk-tickets.$ticketId.work.tsx`, `additional-work.$workId.work.tsx`
- Dispatch: `SummaryNotesSection`, `ReasonFlowSection`, `OverallResultSection`, `ChecksSection`, `RetestModal`
- Home / workspace: `NightPlan`, `ShiftSummaryButton`, `CopilotSheet`
- Other: `accounts.$accountNumber`, `reports.tsx`, `settings.tsx`, `CreateAdditionalWorkModal`

For each site:
- Keep the same `value` / `onChange` prop wiring — value is now an HTML string.
- Wherever that value is displayed elsewhere (cards, drawers, printouts), render via `<RichText html={value} />` instead of raw `{value}`.
- Wherever that value is passed into AI prompts or search indexes, run it through `htmlToPlainText()` first so the AI sees clean text.
- `isEmptyHtml()` replaces `value.trim() === ""` guards.

### Backward compatibility

Existing values in `tickets-store`, notes, snips, dispatch state, etc. are plain strings today. Tiptap accepts plain text as initial content and wraps it in a `<p>`, so nothing breaks. The first edit re-saves it as HTML. No data migration needed.

### Ticket Issue box specifics

The Freshdesk parser currently writes a formatted plain-text template into `issueText`. When it writes, we'll convert its section headers (`Issue:`, `Background:`, `Requested Action:`, etc.) into `<h4>` + `<p>` blocks so the structured template renders with real visual hierarchy in the editor. Same information, just marked up.

## Out of scope

- Single-line `<Input>` fields (email, subject, phone) — stay plain.
- No image/link insertion, no tables, no @mentions, no markdown import/export.
- No new AI features.
- No changes to backend schemas — HTML strings fit existing string columns.

## Verification

- Typecheck.
- Open each migrated screen: toolbar appears, formatting persists on save/reopen.
- Open a ticket with existing plain-text notes: renders correctly, becomes editable, edits save as HTML.
- Pull a Freshdesk ticket: Ticket Issue box shows the structured template with real headings.
