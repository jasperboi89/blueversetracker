## Plan

Two separate bugs in Freshdesk Intelligence search.

### 1. "Array must contain at most 30 element(s)"
The AI re-rank validator caps the candidates array at 30, but live search can return up to 3 pages × 30 = 90 tickets. The cap fires before the handler can slice.

**Fix:** raise the cap to 100 (handler still slices to the top 20 for the AI prompt). No UX change.

### 2. `cf_account_number: Unexpected/invalid field in request`
Freshdesk rejects the query because this account isn't called `cf_account_number` in your instance. Custom field names are tenant-specific (e.g. `cf_account`, `cf_acct`, `cf_account_num`).

**Fix:**
- On first use, auto-detect the account custom field by calling `/api/v2/ticket_fields` once, picking the first custom field whose name contains "account", and caching it in memory.
- If detection fails, fall back to a free-text search path: pull a recent window of tickets via supported filters and let the AI re-rank find the account number in subject/description. No 400.
- Show a clearer message if Freshdesk truly has no account custom field, telling the user to set the field name in Settings.

### 3. Small follow-ups
- Surface the detected field name in the Sync Check panel so the user can confirm it.
- Keep the read-only contract — no Freshdesk writes, no schema changes.

## Files to touch
- `src/lib/api/freshdesk-search.functions.ts` — raise `candidates` cap, add `detectAccountField()`, change account-number branch to use detected field or fall back.
- `src/components/freshdesk-intel/SyncCheckPanel.tsx` — show detected account field (optional, small).

## Validation
- Search by account number → should succeed without 400.
- Free-text/name search with >30 results → no Zod cap error.
- Account number when no matching custom field exists → graceful fallback, not a hard error.