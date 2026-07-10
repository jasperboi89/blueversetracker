## Problem

The Ticket Issue field is a **rich-text (HTML) editor**, but `formatTicketIssue()` in `src/lib/tickets-store.ts` returns **plain text joined by `\n`**. HTML collapses whitespace, so every line runs together into one paragraph — exactly what the screenshot shows ("Issue: … Background: … Requested Action: …" all on one line).

Two write paths feed the editor with this raw newline-joined string:
1. `pullFromFreshdesk` seed and async AI upgrade in `src/lib/tickets-store.ts` (lines ~1043, 1060–1061).
2. "Summarize into Issue" button in `src/routes/_authenticated/freshdesk-tickets.$ticketId.work.tsx` (line ~290).

## Fix

Convert the structured output to real HTML so the editor renders it as separate paragraphs / headings, and bold the labels so it reads like the requested layout.

### 1. Change `formatTicketIssue()` to return HTML

In `src/lib/tickets-store.ts`, rewrite `formatTicketIssue()` to emit HTML instead of `\n`-joined text:

- Section headings ("Issue:", "Background:", "Requested Action:", "Attached Message / Example:") become `<p><strong>…</strong></p>`.
- The multi-sentence body under each heading becomes its own `<p>…</p>`.
- The single-line fields (Specific Field, Category, Message Taking or Dispatching, F9 Issue, and the Attached fields) become `<p><strong>Label:</strong> value</p>`.
- Missing values still render as `Not provided.` (unchanged rule).
- HTML-escape every interpolated value (`&`, `<`, `>`) so raw text from Freshdesk can't inject markup.

This is the single source of truth — both the initial seed and the AI-upgraded value pass through it, so both call sites are fixed by this one change. No changes needed at the call sites in `tickets-store.ts` or `freshdesk-tickets.$ticketId.work.tsx`.

### 2. Backfill existing sessions on open

Existing tickets already have the old squished plain-text string stored in `issueText`. On the ticket work page mount, if `session.issueText` looks like the old plain-text skeleton (contains `"Issue:\n"` or does not contain any HTML tag but does contain our known section headers), regenerate it once via `formatTicketIssue({})` or by parsing the current text back into the schema headings. Simpler and safer: if `issueText` starts with `Issue:` and contains no `<` character, replace it with `formatTicketIssue({})` (the fresh skeleton). Operator edits that already contain HTML are left alone.

This runs once per session as a lightweight effect in `freshdesk-tickets.$ticketId.work.tsx`, guarded so it doesn't overwrite operator edits.

## Out of scope

- No change to the AI prompt or `ParsedTicketIssueShape`.
- No change to the "Summarize into Issue" flow beyond it now receiving HTML from `formatTicketIssue`.
- No change to plain-text consumers (e.g. `htmlToPlainText` already handles HTML→text for exports/notes).
- No DB migration; the backfill is client-side on load.
