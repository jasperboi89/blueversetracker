
## Goal

1. When generating notes / emails, render each snip **inline within the section it belongs to** (Reason, Phone/Repeat/Save section, Before / After / Testing, etc.) instead of dumping everything into a single "Attachments" block at the bottom.
2. Remove the `— LTP` / `· LTP` signature from the **text of generated notes and emails**. Keep internal `initials: "LTP"` audit metadata and the small "· LTP" timestamp chips shown in UI history/archive lists (those aren't notes that get pasted into Freshdesk).

## Changes

### A. Dispatch summary (Contact Dispatch → "Generate Summary Note" + "Copy with Snips")

File: `src/lib/dispatch-store.ts` — `buildDispatchSummary`
- Stop emitting the trailing `"— LTP"` line.
- Remove `· LTP` from the `Testing Completed:` line.
- Drop the bottom `Snips:` roll-up list (snips will render inline per section in the rich copy).
- Add lightweight inline markers in the plain-text body so each section/reason references its own snips by name (e.g. `[Snip: phone-field-before.png]`) — keeps plain-text paste useful.

File: `src/lib/summary/rich-copy.ts` — `buildSummaryHtml` / `buildSummaryMarkdown`
- Replace the single bottom "Attachments" block with **per-section embedding**.
- New signature: `buildSummaryHtml(text, snipsBySection)` where `snipsBySection` is `{ reasons: Record<reasonId, Snip[]>, phone: Snip[], repeat: Snip[], saveSummary: Snip[], unassigned: Snip[] }`.
- The HTML builder walks the session structure and re-renders the summary as styled blocks (Reason cards, then Phone / Repeat / Save sections), inserting `<img>` / 📎 link directly under the heading of the section the snip is attached to.
- Any snip that isn't attached to a reason or section falls into a small "Other Snips" block at the bottom (only shown if non-empty).
- Same embed budget rules (8 MB total, large files fall back to download links, `truncated` flag preserved).

File: `src/components/dispatch/SummaryNotesSection.tsx`
- Pass the structured `snipsBySection` to `copyRichSummary` / `copyMarkdownSummary` instead of the flat `session.snips` array.

### B. Freshdesk ticket "Generated Note" (Hub work session)

File: `src/lib/tickets-store.ts` — `buildGeneratedNote`
- Remove the trailing `"— LTP"` line.
- Keep the existing per-section snip listing under **Before Change / After Change / Testing Snips** (already inline by category). Add a parallel `buildGeneratedNoteHtml` that embeds the actual `<img>` for each snip under the matching section heading, reusing the embed budget helper.
- Wire the ticket work page's "Copy with Snips" button to the new HTML builder so images travel inside Before / After / Testing rather than appended.

### C. Programming Status Email (rich HTML)

File: `src/lib/reports/prog-email-rich.ts`
- Snips already render per item via `renderSnips`. Two cleanups:
  - Remove the top duplicated plain-text `<pre>` block + "Snips by item" divider so the email is one cohesive document instead of "text on top, snips repeated below."
  - Render the Waiting and Attention sections in HTML too (currently skipped with a comment) so the rich version is the full email and snips stay inline next to each ticket / dispatch / additional-work item.

File: `src/lib/reports/prog-email-format.ts` (plain-text `buildEmail`)
- Remove any trailing `— LTP` lines from the generated text.

### D. Strip `— LTP` / `· LTP` from generated note text only

Edits limited to **builders that produce text the user copies/pastes**:
- `src/lib/dispatch-store.ts` `buildDispatchSummary` (lines 561, 611)
- `src/lib/tickets-store.ts` `buildGeneratedNote` (line 876)
- `src/lib/reports/prog-email-format.ts` (if a trailing signature exists)
- Any equivalent in `additional-work-store.ts` completion-note builder

**Not changed** (these are UI metadata, not note bodies):
- `initials: "LTP"` stored on snips, hub notes, history entries
- "Activated … · LTP", "Marked posted manually … · LTP" labels in archive/history components
- `USER_INITIALS` constant in `src/lib/shift.ts`
- "record initials as LTP" instructional copy in the Mark-Ready / Mark-Posted modals

### Out of scope

- No DB schema changes.
- No Freshdesk write behavior changes (still copy-to-clipboard only).
- No change to how snips are uploaded, categorized, or attached.

## Acceptance

- Clicking **Copy with Snips (Rich)** on a Contact Dispatch summary pastes an HTML block where each reason and each section (Phone / Repeat / Save) shows its own attached images directly below that section's heading. No "Attachments" block at the bottom unless there are unattached snips.
- Clicking **Copy with Snips** on a Freshdesk ticket generated note pastes Before / After / Testing sections with the actual images embedded under each heading.
- The Programming Status Email rich copy is a single document with snips inline beside each ticket / dispatch / work item — no duplicate plain block above it.
- None of the generated note/email bodies contain `— LTP` or `· LTP` anymore.
- UI history rows still display "· LTP" timestamp chips as they do today.
