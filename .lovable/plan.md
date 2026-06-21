## Plan

1. **Fix live search query formatting**
   - Update the Freshdesk Intelligence search builder so name/free-text searches are sent in the format Freshdesk search accepts.
   - Avoid invalid `OR`/parentheses patterns that can trigger `Freshdesk returned 400`.
   - Add a safe fallback: if a rich search query fails with 400, retry with simpler Freshdesk-supported searches instead of immediately showing an error.

2. **Improve search reliability for names and general text**
   - Keep direct ticket-number lookup as-is.
   - For names/free text, search likely fields separately, merge/dedupe results, and preserve filters where Freshdesk supports them.
   - Return clearer errors when Freshdesk rejects a query, including a practical message instead of only “returned 400.”

3. **Fix conversation status reporting**
   - Adjust the Sync Check so “conversations pulled” distinguishes between:
     - API failed to pull conversations
     - API succeeded but the ticket has zero conversations
   - Show the actual Freshdesk conversation API error when present.

4. **Keep module read-only**
   - No Freshdesk writes.
   - No duplicate API setup.
   - No database mirror or embeddings changes.

## Technical scope

Files to update:
- `src/lib/api/freshdesk-search.functions.ts`
- `src/lib/api/freshdesk.functions.ts`
- `src/components/freshdesk-intel/SyncCheckPanel.tsx` if needed for clearer labels

Validation:
- Check the updated query generation and error handling paths.
- Ensure ticket-number lookup, normal search, and sync check still call the existing Freshdesk backend functions only.