## Goal

Make snips travel with the Programming Status Email automatically — no more downloading and re-uploading them. Organize them under each ticket / session / work item, and let one email span multiple shifts with clear shift headings.

## What you'll see in Reports → Programming Status Email

1. New button: **Copy Email with Snips (Rich)** (gradient, primary action)
   - Copies email as rich HTML with all image snips embedded inline + plain-text fallback
   - Pastes directly into Outlook, Gmail, or Freshdesk's rich editor with images in place
   - Existing `Copy Email` / `Copy Plain Text` / `Mark Sent Manually` stay
2. Snip counter line under the buttons: "Includes 12 image(s), 2 file(s) across 4 tickets"
3. Each ticket / dispatch session / additional-work block in the body gets:
   - Inline image thumbnails (max-width 600px) right under that item's notes
   - Non-image snips as `📎 filename.pdf` lines with `data:` download links
4. **Multi-shift mode** in the window picker:
   - New "Combine shifts" option alongside Current / Custom range
   - Pick 2+ shifts (date pickers or shift-key checkboxes)
   - Email body groups everything under shift headings (`── Shift: Jun 13 into Jun 14 ──`)
   - Each ticket/session/work item appears under the shift it was completed/worked in
   - Single shift behaves exactly like today (no shift header added)

## Out of scope (deferred)

- Actually sending the email through Gmail/Outlook/SMTP — that's the "real send later" follow-up. We'll revisit once you tell me which provider to wire up.
- Resizing/recompressing snip images (8 MB total `data:` payload cap; over that, falls back to per-item download links with a toast).
- Embedding snips into Freshdesk via API attachment — still copy/paste.

## Technical notes

**Files to add**
- `src/lib/reports/prog-email-rich.ts` — `buildEmailHtml(opts)` walks the same sections as `buildEmail`, emits HTML with `<img src="data:…">` for image snips and `<a href="data:…">` for non-images grouped under each record. Reuses helpers from `src/lib/summary/rich-copy.ts` (`copyRich`, `snipCounts`, 8MB guard).
- `src/lib/reports/multi-shift.ts` — `buildEmailMulti(windows[], opts)` calls `buildEmail` per window, concatenates with shift headers, deduplicates header/footer.

**Files to edit**
- `src/lib/reports/prog-email-format.ts` — emit section markers (e.g. `<!--ITEM:ticket:{id}-->`, `<!--SHIFT:{key}-->`) so the HTML builder can inject snips at the right boundaries. Plain-text consumers strip them.
- `src/lib/reports/shift-window.ts` — add `combinedWindows(keys: string[]): ShiftWindow[]` and a multi-window `kind: "combined"`.
- `src/lib/reports/programming-email-store.ts` — `windowKey()` accepts array; store `windowKeys: string[]` on drafts (back-compat: keep `windowKey` for single).
- `src/routes/_authenticated/reports.tsx` `ProgEmailReport`:
  - Add "Combine shifts" picker UI (multi-select of recent shift keys).
  - Add Rich-copy button + snip counter row.
  - Pass selected snips into rich-copy builder.

**Snip sources used** (already in stores)
- Tickets: `t.hubSnips` (filtered by category groupings already used in summaries).
- Dispatch: `s.snips`.
- Additional work: `a.snips`.

**Search-param schema**: extend `reportSchema.window` to accept `"combined"` with a `shifts=key1,key2` param (back-compat preserved).
