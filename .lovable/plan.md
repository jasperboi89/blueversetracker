## Problem

The "Copy with Snips (Rich)" and "Copy Markdown" buttons in the dispatch Summary Notes section (and any other Freshdesk-bound summary copy paths) pass `session.summaryNotes` straight through. Since we upgraded those boxes to a Rich Text editor, `summaryNotes` may now contain HTML (bold, colors, fonts, lists). That formatting leaks into what gets pasted into Freshdesk — and worse, `buildSummaryHtml` escapes the HTML into a `<pre>` block so raw tags can appear literally.

You want notes pasted into Freshdesk to be **plain text only**, with the snips still attached inline.

## Fix

### 1. Strip formatting inside the copy helpers

`src/lib/summary/rich-copy.ts`:

- Import `htmlToPlainText` from `src/lib/rich-text.ts`.
- At the top of `buildSummaryHtml(text, snips)` and `buildSummaryMarkdown(text, snips)`, normalize the input:
  ```ts
  const plain = htmlToPlainText(text);
  ```
  Then run the existing line-walker / SNIP marker logic against `plain` instead of `text`. The `[[SNIP:id]]` markers survive `htmlToPlainText` because they're just text.
- `copyRichSummary` and `copyMarkdownSummary` also pass the plain-text version to the clipboard's `text/plain` slot so Freshdesk's plain-text paste target gets clean text too.

Result: no `<span style=...>`, no `<strong>`, no font/color styles, no `<p>` wrappers — just the text lines plus inline `<img>` / 📎 file snips exactly like before.

### 2. "Copy Text Only" cleanup

Same file / `SummaryNotesSection.tsx`: the current "Copy Text Only" button does a regex on `summaryNotes` that only strips bullet lines. Route it through `htmlToPlainText` too so it produces clean plain text regardless of formatting.

### 3. Generated summary body stays plain

`buildDispatchSummary` in `src/lib/dispatch-store.ts` already returns plain text, so no change there. But when the user hits "Generate Summary Note", the current flow stores the plain string into `summaryNotes` and then the RichTextEditor may wrap subsequent edits in HTML. That's fine for on-screen editing; the copy helpers above guarantee formatting is stripped at paste time.

## Scope

- Touch only `src/lib/summary/rich-copy.ts` and the "Copy Text Only" call site in `src/components/dispatch/SummaryNotesSection.tsx`.
- The Rich Text editor UI stays exactly as-is — users can still bold/color/list inside the box for their own reference; the formatting just isn't carried into Freshdesk.
- No changes to snip embedding, size limits, or the "Other Snips" fallback block.
- No backend, no store schema, no AI changes.
