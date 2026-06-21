## Problem

When the user searches with only the **Account #** filter set (no query text), the screen shows "Freshdesk search failed — Type a search query or apply a filter."

Why it happens, tracing `freshdeskSearch` in `src/lib/api/freshdesk-search.functions.ts`:

1. `detectAccountField()` calls `GET /api/v2/ticket_fields`. This endpoint requires admin scope on the Freshdesk API key, and on many tenants returns 403 (or there genuinely is no `account` custom field). When that happens we cache `accountField = null`.
2. In `buildFreshdeskQuery`, the account clause is only pushed when `accountField` is truthy. With `accountField = null`, the clause is dropped.
3. If `includeClosed` is on (or every other filter is empty), no default status clause is added either, so `queryString === ""` and the handler returns `"Type a search query or apply a filter."` — even though the user clearly did provide an account number.

Even when the default status clause keeps the query non-empty, dropping the account clause silently returns unrelated open tickets, which is also wrong.

## Fix

Edit `src/lib/api/freshdesk-search.functions.ts` only.

1. **Always honor an `accountNumber` filter.** When the user supplies `filters.accountNumber`, treat it as a meaningful search even when `accountField` detection failed: force a recent-window scope (default 60 days, configurable via existing `updatedAfter`) so the AI re-rank step can match the account number against subject/description.
   - In the main search path: if `accountNumber` is set and `accountField` is null, pass `fallbackUpdatedAfter = filters.updatedAfter ?? isoDaysAgo(60)` into `buildFreshdeskQuery`.
   - Keep the existing detected-field path when `accountField` is non-null.

2. **Never return the "Type a search query or apply a filter" error when a filter is actually present.** Recompute `hasAnyFilter` and, if it's true but `queryString` ended up empty (e.g. `includeClosed=true` and no other clauses), inject the recent-window `updated_at` clause as a last resort so the request is valid.

3. **Make `detectAccountField()` resilient.** If `ticket_fields` returns an error (403/permissions) or an empty list, cache `null` (already done) but also log the cause server-side via `console.warn` so the failure mode is visible without leaking it to the UI.

4. **Tighten the existing account-failure fallback.** Currently it only fires when `firstError` is truthy. Also fire it when the account clause was applied AND the result set is empty AND we have an `accountNumber` filter — same recent-window retry without the cf clause. Invalidate `cachedAccountField` only when Freshdesk returned a 400 mentioning the field name (so we don't thrash the cache on transient errors).

5. **Surface a clearer message** when the search genuinely cannot run: replace `"Type a search query or apply a filter."` with `"Freshdesk returned no results for that account number in the last 60 days. Try widening 'Updated after' or adding more filters."` when the empty result comes from a recent-window account fallback.

No UI changes, no schema changes, no other files touched.

## Verification

- With only the Account # filter set, request succeeds and either returns recent tickets for AI re-rank, or shows the "no results in last 60 days" message — never the misleading "Type a search query" error.
- With Account # + a query term, behavior unchanged when `accountField` is detected; falls back to recent-window when it isn't.
- Ticket-number-only query (e.g. `7431`) still short-circuits to the direct ticket fetch.
