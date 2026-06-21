## Problem

When `Account #` is set but no Freshdesk custom field for accounts is detected, the search falls back to "all recent tickets" and relies on the AI re-rank to filter. Two issues:

1. The server returns the whole recent-window candidate pool without any account-number filtering, so the UI shows many irrelevant tickets.
2. The page renders **every candidate**, merging AI-ranked entries with non-ranked ones — so even tickets the AI rejected still appear.

## Fix

Edit `src/lib/api/freshdesk-search.functions.ts` and `src/routes/_authenticated/freshdesk-intelligence.tsx` only.

1. **Server-side strict pre-filter for account-number fallback.** In the fallback branch (when `filters.accountNumber` is set and we ran the recent-window query), before returning, keep only candidates whose:
   - `ticket.accountNumber` exactly equals the searched number, OR
   - subject / description / excerpt contains the account number as a whole-word match (regex `\b<num>\b`).
   Return the filtered list. If empty, return the existing "No Freshdesk tickets mention that account number..." message.

2. **Same strict filter when the cf field path returns results** but the user-provided value doesn't appear in the ticket text — defensive; usually a no-op when the cf field is correct.

3. **UI: only show results that match.** In `freshdesk-intelligence.tsx`, when an `accountNumber` filter is set, drop candidates from `merged` that don't pass the same whole-word check against `subject`, `description`, `accountNumber`. This keeps the rendered list aligned with the server filter even if cached state lingers.

4. **No change** to query-text-only searches or to ticket-number / email short-circuits.

## Verification

- Searching with Account # = `1234` returns only tickets that actually reference `1234` (account field exact match or whole-word in subject/description). No more unrelated open tickets.
- Searching with Account # for a number that exists returns the matching tickets.
- Searching with Account # for a number with no hits shows the clear "no tickets mention that account number" message.
- Other search modes (free text, ticket number, email) unchanged.
