## Problem

The generated Freshdesk note dumps the entire Ticket Issue field (Issue, Background, Requested Action, Specific Field, Category, Message Taking/Dispatching, F9 Issue, and the whole Attached Message / Example block) into the note body. Then `htmlToPlainText` flattens all of it into one giant squished paragraph before `buildSummaryHtml` wraps it in `<pre>`. The user only wants:

- Issue + Background (from Ticket Issue box)
- Changes Made (with Before / After snips)
- Result / Testing (with Testing snips)

## Fix

### 1. Extract only Issue + Background from `issueText`

In `src/lib/tickets-store.ts`, add a helper `extractIssueAndBackground(issueHtml: string): { issue: string; background: string }` that parses the HTML produced by `formatTicketIssue()`:

- Split on `<p><strong>…</strong></p>` heading markers.
- Return only the text following `Issue:` and `Background:` headings.
- Fallback: if the HTML doesn't match the expected shape (operator-edited freeform), treat the whole thing as `issue` and leave `background` empty.
- Return plain text (not HTML) since `buildGeneratedNote` returns a plain-text string that later gets re-rendered by `buildSummaryHtml`.

### 2. Rewrite `buildGeneratedNote` to only include the three requested sections

In `src/lib/tickets-store.ts` (`buildGeneratedNote`, lines ~1108-1158):

```
[Template Name]

Issue:
<issue text>

Background:
<background text>          ← omit whole block if empty

Changes Made:
<changes text>
  [[SNIP:before-1]]        ← Before Change snips grouped under Changes Made
  [[SNIP:after-1]]         ← After Change snips grouped under Changes Made

Result / Testing:
Status: …
<result notes>
  [[SNIP:testing-1]]       ← Testing Result snips grouped under Result/Testing
```

Specifically:
- Replace the `s.issueText.trim()` dump with `Issue:` + issue body, then `Background:` + background body (skipped if empty).
- Remove the standalone `Before Change:` and `After Change:` sub-headings and their separate snip blocks; instead append **all Before Change and After Change snip markers directly after** the `Changes Made:` body.
- Keep `Result / Testing:` section and append Testing Result snip markers directly under it (drop the separate `Testing Snips:` heading).
- Drop the intermediate "Before Change:" / "After Change:" / "Testing Snips:" labels since snips now sit under their parent section.

### 3. No changes to snip rendering pipeline

`buildSummaryHtml` in `src/lib/summary/rich-copy.ts` already renders `[[SNIP:id]]` markers inline with the surrounding text, and unknown/leftover snips fall through to "Other Snips". No changes needed there — the new note shape naturally produces the requested layout.

## Out of scope

- No change to `formatTicketIssue()` (the operator-facing editor still shows the full structured layout — only the generated Freshdesk note is trimmed).
- No change to snip categories, storage, or the AI prompt.
- No change to the rich-copy HTML/markdown builders.
