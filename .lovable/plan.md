## Goal

When you generate a summary on a Contact Dispatch session or a Freshdesk ticket, all image snips embed inline automatically and non-image snips list with a download link — no separate download/attach step.

## How it works for you

In the Summary Notes area you'll see three copy buttons instead of one:

- **Copy with Snips (Rich)** — primary. Puts both HTML (with images embedded) and plain text on the clipboard. Paste into Freshdesk's rich reply editor, Outlook, Gmail, Word, Notion → images appear inline. Paste into a plain-text field → falls back to the text-only version automatically.
- **Copy Markdown** — text with `![snip-name](data:image…)` references and `📎 filename` lines for non-images. Good for Slack-style or markdown tools.
- **Copy Text Only** — current behavior, unchanged.

Inline placement in the body:
- Each Reason for Call / section that has snips attached to it shows its images right under that section.
- Snips not attached to a specific section appear in a final **Attachments** block, in the order they were added.
- Non-image snips (PDFs, docs) always render as `📎 filename.pdf — [download]` lines. The download link is a `data:` URL that works from the pasted HTML.

A small "Includes N image(s), M file(s)" line appears under the buttons so you know what's being bundled before you paste.

## Scope

- **Contact Dispatch testing workspace** — `SummaryNotesSection`. Snips attached via `attach: { kind: "reason" | "section" }` render under their owner; unattached snips go to the Attachments block.
- **Freshdesk ticket work page** — add the same Summary Notes pattern if it doesn't exist yet (today the ticket page has hub snips but no copyable summary). New "Ticket Summary" card with Generate + the three copy buttons, building from ticket fields + notes + hub snips.
- **Additional Work** — out of scope for this pass (no summary block today); easy follow-up if wanted.

## Technical notes

New module `src/lib/summary/rich-copy.ts`:
- `buildSummaryHtml(textSummary, snipBlocks)` — converts the existing plain-text summary into HTML (preserve line breaks, escape), then injects `<img src="{dataUrl}" style="max-width:600px">` for image snips at section markers and an Attachments section at the bottom. Non-images render as `<a href="{dataUrl}" download="{name}">📎 {name}</a>`.
- `copyRich(html, text)` — uses `navigator.clipboard.write([new ClipboardItem({ "text/html": htmlBlob, "text/plain": textBlob })])`. Falls back to `document.execCommand('copy')` on a hidden contenteditable if `ClipboardItem` is unavailable (older Safari).
- `copyMarkdown(text, snips)` — builds markdown with embedded `data:` image references.

Edit `buildDispatchSummary` (and a new `buildTicketSummary`) to emit lightweight section markers (e.g. `<!--SNIPS:reason:{id}-->`) the HTML builder can use as insertion points; the plain-text fallback strips them. Existing behavior of the function unchanged otherwise.

Edit `SummaryNotesSection.tsx`:
- Replace the single Copy Final Version button with the three-button group.
- Add the "Includes N image(s), M file(s)" counter line.
- Keep "Download Included Snips" as-is for users who still want files.

New `src/components/freshdesk/TicketSummarySection.tsx` mounted on the ticket work route, mirroring the dispatch summary UI and wired to `buildTicketSummary`.

Size guard: total embedded `data:` payload capped (e.g. ~8 MB). If over, the rich copy falls back to inline thumbnails + per-snip download links and shows a toast: "Some snips were too large to embed — included as links instead."

No backend, no migrations, no schema changes. Pure frontend.

## Files

- new `src/lib/summary/rich-copy.ts`
- new `src/lib/summary/ticket-summary.ts` (buildTicketSummary)
- new `src/components/freshdesk/TicketSummarySection.tsx`
- edit `src/lib/dispatch-store.ts` (section markers in `buildDispatchSummary`)
- edit `src/components/dispatch/SummaryNotesSection.tsx` (3 buttons + counter)
- edit `src/routes/_authenticated/freshdesk-tickets.$ticketId.work.tsx` (mount new section)

## Out of scope

- Additional Work summaries
- Uploading snips to Freshdesk via API as real attachments (a future option if HTML embedding isn't enough in some destination)
- Resizing/recompressing images before embed (we'll just cap total size)
