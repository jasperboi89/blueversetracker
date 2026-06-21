## Plan

### Goal
Make Freshdesk Intelligence behave like a strict, read-only, AI-assisted Freshdesk search: correct candidate retrieval first, then AI ranking, with clear admin diagnostics and grouped results.

### What I’ll change

1. **Date range and All Time control**
   - Replace the single “Updated after” filter with a date-range filter offering:
     - All Time
     - Last 7 / 30 / 90 days
     - Custom start/end dates
   - Default is **All Time**. No hidden recent-window cap is applied unless the user picks a range.
   - All search modes (account, general, email, ticket #) respect the chosen range.

2. **Single server-side search pipeline with grouped output**
   - One backend call returns:
     - `strong`, `possible`, `relatedMentions` groups
     - `debug` block (see Search Debug)
   - The UI no longer merges raw candidates back in when AI returns fewer results.
   - If nothing qualifies, return “No strong matches found” — never fall back to dumping unrelated tickets.

3. **Account search must be exact first**
   - Trigger account mode when the Account # filter is set (or the query is a clean account number).
   - **Strong Match (exact only):**
     - normalized `accountNumber`
     - account-like custom fields (`cf_account*`, `cf_acct*`, etc.)
     - account / company metadata returned by Freshdesk (company name, company_id linkage)
     - account / company tags
   - **Related Mentions:**
     - account number appearing only in subject, description, notes, replies, or conversation body
   - Account searches scan **all available Freshdesk tickets for that account** unless a date range is selected. No recent-window cap.
   - If no exact account match exists, show “No exact account match found” and surface Related Mentions in a collapsed section.

4. **General search retrieval**
   - Pull candidates from the live Freshdesk API using supported filters.
   - If no date range is selected, do **not** cap to a recent window (unless the result set would be too large to safely process; if a cap is needed, surface it explicitly in Search Debug).
   - Pull full conversations for the candidate pool using paginated `/tickets/{id}/conversations` so AI sees notes, replies, and conversation body text.
   - Build searchable text from subject, description, tags, custom fields, account/company, requester, notes, replies, and conversation body.

5. **AI ranking with structured output**
   - Send enriched candidate blocks to AI. Strict rules: only return tickets with actual evidence; snippets must be verbatim from supplied text.
   - Structured fields per result:
     - ticket number, account number/name, subject, status, priority
     - match reason, evidence snippet, short summary, suggested action
     - confidence (0.0–1.0)
     - group: `strong` / `possible` / `related-mention`
   - Validate AI output against actual candidate ticket numbers and drop any result without a snippet.

6. **Result grouping in the UI**
   - Strong Matches, Possible Matches, Related Mentions as separate sections.
   - Related Mentions is collapsed by default.
   - Weak matches never appear in Strong Matches.

7. **Admin-only Search Debug**
   - Visible only to admins (uses existing role context).
   - For each search, display:
     - search mode used (account exact, keyword, AI semantic, hybrid, ticket #, email)
     - data source searched (live Freshdesk API; note if any local cache was consulted)
     - Freshdesk query / filter string actually sent
     - date range used (or “All Time”)
     - number of tickets scanned
     - number of tickets excluded before AI (with reason buckets)
     - number of tickets sent to AI
     - number of conversations pulled (and pages)
     - filters applied
     - result counts per group
     - reason each displayed result was included (e.g. “exact account custom field match”, “AI confidence 0.82 with snippet”)
     - detected account field name, when applicable

8. **All Tickets / All Time diagnostic test**
   - Add an admin diagnostic in Search Debug: enter an account number and run a coverage check.
   - Report shows:
     - whether the search scanned all available tickets for that account or a limited subset
     - total tickets found for that account across All Time
     - oldest and newest ticket dates returned
     - whether pagination was exhausted or truncated
     - any API errors or rate limits encountered
   - Result makes it obvious if account coverage is complete or partial.

9. **Content coverage check**
   - Update the existing sync/search check to confirm which content is available per ticket: subject, description, custom fields, tags, account/company, notes, replies, conversation body text.
   - No Freshdesk writes anywhere.

### Database
Do not make database schema changes unless required. If required, I will explain the exact change first and wait for approval before applying it.

### Read-only guarantee
This work only reads Freshdesk tickets and conversations. It will not modify tickets, statuses, notes, merges, or closures.

### Files expected to change
- `src/lib/api/freshdesk-search.functions.ts`
- `src/routes/_authenticated/freshdesk-intelligence.tsx`
- `src/components/freshdesk-intel/FilterRow.tsx` (date-range filter)
- `src/components/freshdesk-intel/ResultCard.tsx` (group rendering)
- `src/components/freshdesk-intel/SyncCheckPanel.tsx` (rename/extend into Search Debug + coverage check)
- possibly `src/lib/api/freshdesk.types.ts` for richer DTO/debug types