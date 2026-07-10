## Goal

Make "Copy with Snips (Rich)" produce a note that's visually organized and easy to scan when pasted into Freshdesk — Changes Made on top in bold, Result/Testing next, then Issue and Background, with real vertical space between sections and snips inline under their correct section.

## Target layout (rendered)

```text
Changes Made:                       ← bold heading
<changes text>
[Before Change snip]
[After Change snip]

Result / Testing:                   ← bold heading
Status: …
<result notes>
[Testing Result snip]

Issue:                              ← bold heading
<issue text>

Background:                         ← bold heading (omitted if empty)
<background text>
```

Section blocks are separated by real vertical whitespace (not just a `\n` inside a `<pre>`), and section headings render bold so the note is skimmable at a glance.

## Changes

### 1. Reorder `buildGeneratedNote` in `src/lib/tickets-store.ts`

Emit sections in this order with a blank line between each block, and drop the leading `[Template Name]` line (that label doesn't help the reader in Freshdesk):

1. `Changes Made:` + body + Before/After snip markers
2. `Result / Testing:` + Status/Failure/Waiting/notes + Testing snip markers
3. `Issue:` + body
4. `Background:` + body (skip entire block if empty)

Keep snip-marker indentation as-is so `buildSummaryHtml` still recognizes them.

### 2. Upgrade `buildSummaryHtml` in `src/lib/summary/rich-copy.ts`

Today it dumps everything into one `<pre>` which is why Freshdesk shows it "squished". Rewrite the text-rendering path so the output is structured HTML instead of one monolithic `<pre>`:

- Split the plain text into blocks by blank lines.
- Within a block, if the first line matches a known section heading (`Changes Made:`, `Result / Testing:`, `Issue:`, `Background:`) — or more generally a short line ending in `:` at column 0 — render it as `<div style="font-weight:600; margin-top:14px; margin-bottom:6px;">Heading</div>` and render the remaining lines of the block as a `<div style="white-space:pre-wrap; margin-bottom:10px;">…</div>` paragraph.
- Non-heading blocks render as the same styled `<div>` paragraph with bottom margin so paragraphs breathe.
- Snip markers (`[[SNIP:id]]`) continue to render inline as image/file blocks via the existing `renderSnipHtml`; keep their own margin so they sit visually under the preceding section.
- Preserve the existing "unknown snip id → drop marker" and "leftover snips → Other Snips block" behavior.
- Preserve the embed-size budget / truncation reporting.

Markdown builder (`buildSummaryMarkdown`) gets a small tweak so headings render as `**Heading**` on their own line followed by a blank line, matching the rich version.

### 3. No other changes

- `formatTicketIssue()`, snip storage, AI prompt, `copyRich`/`copyText` helpers, and version-history flow are untouched.
- Plain-text copy ("Copy Text Only") already reads from `htmlToPlainText(session.summaryNotes)`; because the editor value keeps the blank lines between sections, plain-text copy improves for free.

## Files touched

- `src/lib/tickets-store.ts` — reorder `buildGeneratedNote` (Changes → Result/Testing → Issue → Background), drop `[Template]` header line, ensure blank lines between blocks.
- `src/lib/summary/rich-copy.ts` — new block-based renderer in `buildSummaryHtml`, matching heading treatment in `buildSummaryMarkdown`.
