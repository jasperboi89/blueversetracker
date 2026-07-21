## Approach

Drop the manual group ID inputs and match tickets by **group name** only.

Since Freshdesk tickets only include `group_id` (not the name), the sync will resolve each ticket's group name on demand via `GET /api/v2/groups/{id}`, cache the id→name mapping in memory for the run, and compare (case-insensitive, trimmed) against the three target names: Programming Support, Customer Support, Sup Pod - GB.

## Changes

1. **`src/lib/api/freshdesk-index.functions.ts`**
   - Remove `resolveTargetGroupIds` / `fetchAndCacheGroupIds` from the 24h flow (no more `/api/v2/groups` list call).
   - Remove the `freshdeskGetTargetGroupIds` / `freshdeskSaveTargetGroupIds` server fns added last turn.
   - In `freshdeskSync24h`, build a per-run `Map<number, string | null>` cache. For each ticket with a `group_id`, fetch `/api/v2/groups/{id}` once, store the name. If that call returns 401/403, return a clear error: "Your Freshdesk API key can't read group details — ask an admin to enable Groups access for the key." Other errors go to warnings and the ticket is treated as `group_not_allowed`.
   - `classifyExclusion` switches from an `allowedGroupIds: Set<number>` to a resolved group-name string, comparing against the three target names normalized.
   - Report the resolved `groupIds` map in the result as `{ name: id }` derived from tickets we actually saw (so the UI still shows what was matched), or drop it entirely.

2. **`src/components/freshdesk-intel/SearchDebugPanel.tsx`**
   - Remove the group ID input row and the save button/state added last turn.
   - Keep the "Sync last 24h" button, results table, and warning list unchanged.

No schema changes; the `target_group_ids` column stays but is no longer read or written by this flow.
