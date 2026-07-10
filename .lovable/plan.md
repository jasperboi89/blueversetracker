## Problem

Copy with Snips (HTML) for a Contact Dispatch summary produces one dense wall of monospace text. Two root causes:

1. `buildDispatchSummary` (src/lib/dispatch-store.ts) emits reasons and checks with no blank lines between them, so `buildSummaryHtml` treats the whole block as a single paragraph.
2. `buildSummaryHtml` (src/lib/summary/rich-copy.ts) renders paragraphs as small monospace `<pre>`-style blocks (13px, ui-monospace). Bullets, indented sub-lines, and section labels all get squished together.

## Fix (frontend / presentation only)

### 1. `src/lib/dispatch-store.ts` — space out the generated text

In `buildDispatchSummary`:
- Header lines: emit `Contact Dispatch Summary — …`, account line, ticket line, completed line, reason line, each followed by a blank line separator between the header block and the first section.
- `Reasons for Call:` heading, then a blank line, then each reason rendered as its own block:
  - `• [Status] Reason text (Type)` on one line.
  - Sub-details (`Expected:`, `Actual:`, `Failure:`, `Changes:`, `Urgent:`, `Retest [...]`) each on their own line, indented with two spaces.
  - Any `[[SNIP:id]]` markers on their own indented line.
  - **Blank line after every reason** so paragraphs split cleanly in the HTML renderer.
- `sec()` (Phone Number Field Check / Repeat Caller / Save / Message Summary):
  - Heading line `Phone Number Field Check:` alone (ends with colon so it hits the HTML heading rule), then a line `Status: Passed`, then details/retests/snips as their own lines, then a blank line separator.
- Preserve existing content, `onlyIssues` filtering, and the `[[SNIP:id]]` markers exactly as today — this is a spacing/layout change, not a data change.

### 2. `src/lib/summary/rich-copy.ts` — readable HTML renderer

Rewrite the paragraph rendering inside `buildSummaryHtml` so the output is easy to scan:
- Wrap everything in a root `<div>` with a readable sans-serif stack (system-ui / -apple-system / Segoe UI / sans-serif), `font-size:15px`, `line-height:1.55`, `color:#111`.
- Section headings (existing `isHeading` rule — short line ending in `:`) render as `<div>` with `font-size:16px`, `font-weight:700`, `margin:18px 0 8px 0`, and a subtle bottom border for separation.
- Body paragraphs render as `<div>` per line (not per blank-line-delimited block) so each bullet / sub-detail becomes its own block. Indented lines (leading spaces) get a proportional `margin-left` so the visual hierarchy from the text is preserved.
- Lines that start with `•` render with the bullet kept and slightly tighter top/bottom margin, so a reason and its sub-lines read as a group.
- Consecutive plain lines with no indent stay in a single paragraph (join with `<br>`) so free-form notes don't get chopped into single-word lines.
- Keep the existing snip-marker handling (`renderSnipHtml`) and the leftover "Other Snips" block. Bump snip caption font to 12px and image `max-width` to 640px so embedded shots are legible.
- No changes to `copyRich`, `copyText`, `copyRichSummary`, `copyMarkdownSummary`, `buildSummaryMarkdown`, `snipCounts`, or the sanitizer.

### 3. Out of scope

- Ticket note builder (`buildGeneratedNote` in tickets-store) — the user's screenshot is the dispatch summary path only.
- RichTextEditor, storage shape, snip capture, sanitization rules.
- Any business logic, dispatch state, or API calls.

## Expected result

The copied HTML pastes into Gmail / Freshdesk as a readable document: a bold header, spaced-out `Reasons for Call` section with each reason as its own block, snips inline right under their reason, and the three check sections (Phone Number, Repeat Caller, Save / Message Summary) as bold headings with their status and details grouped underneath.