## Root cause (confirmed)

Your `FRESHDESK_DOMAIN` and `FRESHDESK_API_KEY` secrets are saved and working for normal ticket calls. The "Sync last 24h" flow additionally calls `GET /api/v2/groups` (in `fetchAndCacheGroupIds`, `freshdesk-index.functions.ts:97`) to resolve the three target group names to IDs. That endpoint requires an **admin-scoped** Freshdesk API key. Agent-scoped keys get back **403**, which `fdFetch` surfaces as "Freshdesk authentication failed. Check API key in Settings." — even though the same key works fine for ticket reads.

## Fix

Stop depending on `/api/v2/groups` and let the sync work with any agent key.

1. **Add manual group ID input to `SearchDebugPanel.tsx` → "24-hour targeted sync" section**
   - Three small inputs (Programming Support / Customer Support / Sup Pod - GB) pre-filled from `freshdesk_search_sync_state.target_group_ids`.
   - "Save group IDs" button calls a new `freshdeskSaveTargetGroupIds` server fn that upserts the JSON into `target_group_ids`.

2. **`freshdeskSync24h` in `src/lib/api/freshdesk-index.functions.ts`**
   - Read `target_group_ids` from `freshdesk_search_sync_state` first. If all three are present, use them and **skip** the `/api/v2/groups` call entirely.
   - Only fall back to `fetchAndCacheGroupIds` when nothing is saved. If that fallback returns 401/403, return a clear result-level error ("Your Freshdesk API key can't list groups. Enter the three group IDs above and try again.") instead of the generic auth-failed string — so the UI stops implying the key itself is bad.

3. **Small UX touch**
   - When the sync returns that specific "cannot list groups" error, the panel highlights the group-ID inputs and shows a hint on where to find each group ID in Freshdesk (URL of the group page).

No other Freshdesk code paths change; ticket pulls, indexing, and coverage tests keep working exactly as they do today.
