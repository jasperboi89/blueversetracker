## Goal

When a Freshdesk ticket is pulled, populate the **Ticket Issue** box with a clean, structured parse that always follows the same section layout — not a raw dump and not a vague summary.

The current regex-based `extractRequestAndBackground()` can only slice sections that already exist verbatim in the Freshdesk template. The requested output requires plain-English rewrites (Issue, Background, Requested Action) and pulling structured fields (MsgID, Caller, Phone, Patient, etc.) out of embedded message blocks. That reliably needs the AI gateway, not regex.

## Output template (rendered into the Ticket Issue textarea)

```
Issue:
[Plain-English explanation of the main issue/request.]

Background:
[Why the requester needs this change. Current problem or workflow.]

Requested Action:
[What needs to be adjusted, configured, fixed, or changed.]

Specific Field:
[value or "Not provided."]

Category:
[value or "Not provided."]

Message Taking or Dispatching:
[value or "Not provided."]

F9 Issue:
[value or "Not provided."]

Attached Message / Example:
MsgID: [value or "Not provided."]
Call Timestamp: [value or "Not provided."]
Message Summary: [value or "Not provided."]
For: [value or "Not provided."]
Caller: [value or "Not provided."]
Phone: [value or "Not provided."]
Patient: [value or "Not provided."]
Message: [cleaned-up message body or "Not provided."]
```

Rules baked into the prompt:
- Use ONLY facts present in the ticket text; never invent values.
- Missing value → literal string `Not provided.`
- Preserve account numbers, company names, names, phone numbers, addresses, timestamps, categories, field names, message IDs verbatim.
- Separate main ticket issue from the attached message block.
- Keep `Issue` / `Background` / `Requested Action` in normal, concise English (1–3 sentences each).
- If the ticket has no attached message, still emit the "Attached Message / Example" section with all fields as `Not provided.`

## Changes

### 1. New AI server function — `aiParseTicketIssue`

File: `src/lib/ai/ai.functions.ts`

- New `createServerFn` guarded by `requireActiveAuthorizedUser`, logged via `logAi(..., "ticket-issue-parse", number)`.
- Input: `{ number, subject?, description }` (Zod validated, description capped at ~12k chars).
- Calls `aiComplete({ json: true, system, prompt })` where the system prompt:
  - Describes the exact JSON schema (one key per template line — `issue`, `background`, `requestedAction`, `specificField`, `category`, `messageTakingOrDispatching`, `f9Issue`, `attached: { msgId, callTimestamp, messageSummary, for, caller, phone, patient, message }`).
  - Enforces the "Not provided." fallback and the "no invention" rule.
  - Instructs the model to strip HTML/markup before reasoning and to clean up (not paraphrase away) the attached message body.
- Returns `{ ok: true, parsed }` or `{ ok: false, error }`.

### 2. Formatter (client-side, pure)

File: `src/lib/tickets-store.ts`

- Add `formatTicketIssue(parsed)` that renders the JSON into the exact textarea template above, always emitting every section/field with `Not provided.` where empty.
- Keep `extractRequestAndBackground()` exported for now as a fallback used only when the AI call fails (so a network/AI outage still gives the operator *something* rather than an empty box).

### 3. Wire into pull flow

File: `src/lib/tickets-store.ts` (around line 503 in `pullTicket`, and line 985 in the upsert helper)

- After a successful `freshdeskPullTicket`, `await` `aiParseTicketIssue({ number, subject, description })`.
- On success → `seedIssue = formatTicketIssue(parsed)`.
- On failure or timeout (soft ~15s) → `seedIssue = extractRequestAndBackground(description)` (current behavior, kept as safety net).
- Sync path (line 834) is **not** changed — this only affects fresh pulls, matching the existing seeding contract (existing tickets keep whatever the operator already typed).

### 4. Loading affordance

File: `src/components/freshdesk/TicketLookupCard.tsx` (existing spinner path)

- Extend the "Pulling…" state to remain until the AI parse resolves so the Ticket Issue box is populated before the drawer opens. No new UI element — just make the awaited promise include the parse step.

## Non-goals

- No changes to Freshdesk fetch logic, normalization, notes, attachments, or store shape.
- No changes to the sync path or to existing tickets' `issueText`.
- No new user-facing settings or toggles.
- No changes to the section labels/wording — the template is fixed as specified.

## Verification

- Typecheck.
- Pull a real Freshdesk ticket in preview; confirm the Ticket Issue textarea shows every section in order, with `Not provided.` filling absent fields and no invented values.
- Pull a ticket with an attached phone-message block; confirm MsgID / Caller / Phone / Patient / Message populate.
- Force an AI failure (disconnect) and confirm the fallback still fills the box with the old Request/Background extraction.
