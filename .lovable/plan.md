## Goal
Make the Programming Status Email readable: numbered items, proper spacing, larger fonts, and clear separators — in both the rich (HTML) and plain text builders. Snips remain inline in the item's flow.

## Files to change

### 1. `src/lib/reports/prog-email-rich.ts` (rich HTML — the "Copy Email with Snips (Rich)" path)
- Bump base font to `font-size:15px; line-height:1.6; color:#111`.
- Shift heading (`<h2>`): bigger (18px), more top margin (28px), keep subtle background band.
- Section heading (`<h3>` — Freshdesk Tickets Worked, Contact Dispatch Testing, Additional Work): 16px, `margin:22px 0 10px`, stronger bottom border.
- Each item wrapped in a `<div>` "card" with:
  - `margin:14px 0; padding:12px 14px; border:1px solid #e5e7eb; border-left:4px solid #6b7280; border-radius:6px; background:#fff;`
  - A numbered title line: `**1. Ticket #369427 — Account 48043 / Dr. Movassaghi's Office**` (bold, 15.5px). Numbering resets per section.
  - Sub-lines (`Summary:`, `Status:`, `Programming Notes:` with indented notes) each on their own `<div style="margin:4px 0;">`.
  - Notes rendered as separate `<div>` per line with `margin-left:16px`.
  - Snip block appears at the end of the same card, inline (already exists, keep styling but a bit larger — image `max-width:640px`, snip caption 12px).
- Between items: rely on card margin (no additional `<hr>` needed).
- Tail plain-text fallback (Waiting / Attention sections) stays but rendered in a slightly larger, sans-serif `<pre>` (14px, `#111`, white-space:pre-wrap, padding:14px, background:#f7f7f9).

### 2. `src/lib/reports/prog-email-format.ts` (plain-text builder — used by "Copy Email" and as fallback tail)
- In `buildEmail`, number items within each section:
  - `1. Ticket #369427 - Account 48043 / Dr. Movassaghi's Office`
  - `2. Ticket #369462 - Account 5698 / Norco Medical...`
  - Same numbering for Contact Dispatch Testing, Additional Work, Waiting, Attention (numbering restarts per section).
- Add a visible separator line `----------------------------------------` between items in each section (in addition to the existing blank line) so pastes that collapse blank lines still show breaks.
- Keep existing blank lines and the `while (out.length && out[out.length - 1] === "") out.pop();` trim.
- No change to warnings, hidden sections, or data selection logic.
- `buildEmailMulti` is unchanged aside from inheriting the new formatting from `buildEmail`.

## Out of scope
- Data selection, warnings, night plan collection, attention picker, copy button wiring, RichTextEditor behavior.
- Dispatch summary/rich-copy (already done in prior turn).
- No changes to `programming-email-store.ts`, `shift-window.ts`, or any store.

## Result
- Rich copy: each ticket/dispatch/work item is a clearly bordered card with a numbered heading and inline snips, larger text.
- Plain copy: numbered items separated by dashed rules that survive editors that collapse blank lines.
