## Problem

The structured Ticket Issue schema is already wired for ticket pulls, but two paths still drop raw/paragraph text into the Ticket Issue field:

1. **Initial seed on ticket pull** — `ticketsStore.pullFromFreshdesk` seeds `issueText` with `extractRequestAndBackground(description)`, which is the raw REQUEST / BACKGROUND INFO block copied from Freshdesk. It stays visible until the async AI parse completes, and permanently if AI fails.
2. **"Summarize into Issue" button** on the ticket work page — calls `aiSummarizeTicket`, which returns a free-form paragraph summary and overwrites `issueText` with it. That directly violates "do not summarize everything as one paragraph."

## Fix

### 1. Always seed the structured layout

`src/lib/tickets-store.ts`, inside `pullFromFreshdesk`:

- Replace `const seedIssue = extractRequestAndBackground(...)` with `const seedIssue = formatTicketIssue({})`. Since every field is missing at seed time, this produces the full schema with `Not provided.` in every slot.
- Keep the async `aiParseTicketIssue` → `formatTicketIssue` upgrade exactly as-is. When it succeeds, real values replace the "Not provided." lines. If it fails, the operator still sees a clean structured skeleton instead of raw Freshdesk text.
- `extractRequestAndBackground` stays exported (other callers unaffected) but is no longer used for seeding.

### 2. Route "Summarize into Issue" through the structured parser

`src/routes/_authenticated/freshdesk-tickets.$ticketId.work.tsx`, `summarizeIntoIssue`:

- Swap `aiSummarizeTicket` for `aiParseTicketIssue` (`src/lib/ai/ai.functions.ts`), passing `{ number, subject, description }`. Description = `ticket.freshdeskNotes[0]?.body ?? ""` truncated to 12000 chars to match the validator.
- On success, `update({ issueText: formatTicketIssue(res.parsed) })`.
- On failure, existing toast path.
- Button label stays "Summarize into Issue" (or rename to "Rebuild Structured Issue" — flag in build turn).

### 3. Verify the AI prompt matches the requested rules

The prompt already in `aiParseTicketIssue` (system message) already enforces:
- Strict JSON of the exact schema (issue, background, requestedAction, specificField, category, messageTakingOrDispatching, f9Issue, attached.{msgId, callTimestamp, messageSummary, for, caller, phone, patient, message}).
- "Use ONLY facts present in the ticket text. Do NOT invent values." → empty string when missing → renders as "Not provided." via `formatTicketIssue`.
- Preserve account numbers, company names, phone numbers, timestamps, field names, categories, message IDs verbatim.
- Separate the main ticket issue from the attached phone-message block.

No prompt change needed. If any rule is missing after re-read, tighten it in the same edit.

## Out of scope

- No schema or DB changes.
- No changes to `formatTicketIssue` output.
- No new UI, no rich-text rules change, no snip changes.
- Manual edits by operators in the Ticket Issue box are still free-form; we only control the auto-populated value.
