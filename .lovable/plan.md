## Plan

Fix account-number Freshdesk search by making the account match source stricter and broader, instead of relying on the current ticket subject/description slice.

### What I’ll change

1. **Normalize account numbers before comparing**
   - Strip spaces, punctuation, and formatting from the searched account number and Freshdesk values.
   - Compare normalized values so `123-456`, `123456`, and `Account # 123456` can match correctly.
   - Avoid partial numeric matches so `1234` does not match `91234` or `12345`.

2. **Search the full ticket context for account numbers**
   - Include ticket custom fields, tags, company/requester info, subject, description, and available searchable text when checking whether a candidate belongs to the account.
   - For fallback account searches, fetch ticket conversations for the recent candidate pool and only keep tickets whose conversation text also mentions the account number.

3. **Stop showing unranked unrelated candidates**
   - When an account number is provided, the page will render only strictly matched candidates.
   - If AI ranks fewer tickets than the server returns, the UI will still only show candidates that passed strict account matching.

4. **Improve the no-results message**
   - If no ticket or conversation mentions the requested account number, show a clear message that the account number wasn’t found in the selected date/status filters.

### Technical notes

- Update only:
  - `src/lib/api/freshdesk-search.functions.ts`
  - `src/routes/_authenticated/freshdesk-intelligence.tsx`
- Keep ticket-number search, email search, and regular free-text search unchanged.
- The strict account matcher will be shared conceptually between server and UI, with server-side filtering as the source of truth.