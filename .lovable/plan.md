## Fix: Account Number handling in Freshdesk Ticket Workspace

Right now the ticket header shows `Account {accountNumber} — {accountName}` as plain text with no way to edit, and when Freshdesk doesn't supply an account number the ticket falls back to `"----"`. We'll improve detection, surface an editable field when missing, persist manual entries, and link to the Accounts table.

### 1. Broaden Freshdesk auto-detect

In `src/lib/api/freshdesk.functions.ts` (`detectAccount`):
- Keep custom-field check first.
- Then scan, in order: `subject`, `description_text`, `tags[]`, `company.name`, `requester.name`/`email`.
- Match a 3–8 digit number, with optional prefixes like `Acct`, `Account #`, `[1234]`, or a bare numeric token.
- Pass `tags` and `description_text` through (already in DTO).
- Return both `accountNumber` and `accountName` (prefer company name).

### 2. Track account source on the ticket

In `src/lib/tickets-store.ts`:
- Add `accountSource?: "freshdesk" | "manual"` to `Ticket`.
- `createFromFreshdesk`: leave `accountNumber` empty (`""`) instead of `"----"` when none detected; set `accountSource: "freshdesk"` only when detected.
- New action `setAccountNumber(ticketId, number, name?)`:
  - Validates numeric (digits only, 3–8 chars).
  - Looks up `accountsStore.get(number)`; if found, uses its name and links; if not, creates a new Account via `accountsStore.create({ number, name: name || "Unlinked Account" })`.
  - Updates ticket `accountNumber`, `accountName`, `accountSource: "manual"`, pushes a hub history entry.
- New action `refreshAccountFromFreshdesk(ticketId)`: re-runs `freshdeskPullTicket`, replaces the account fields, resets `accountSource` to `"freshdesk"`.
- `mergeFreshdeskData` (sync): only overwrite `accountNumber`/`accountName` when `accountSource !== "manual"`.

### 3. Workspace header UI

In `src/routes/_authenticated/freshdesk-tickets.$ticketId.work.tsx`, replace the static "Account {n} — {name}" line with a small inline component:

- **Has account number** (linked): show `Account {n} — {name}` with a small "Edit" pencil and a "Refresh from Freshdesk" button. Account number is a `Link` to `/accounts/{n}`.
- **No account number**: show an amber warning panel:
  > No account number found from Freshdesk. Enter one manually to link this ticket to an account.
  
  Below it: a numeric `Input` + "Link Account" button. If the entered number doesn't exist in Accounts, surface an inline "Create new account" row with an optional Account Name field, then `setAccountNumber`.
- **Edit mode** (from pencil): same input flow but pre-filled; "Replace Account Number" confirm before saving over a manual value.

### 4. Ticket lookup fallback

`src/components/freshdesk/TicketLookupCard.tsx`: no logic change required — manual create already exists, and pulled tickets will now render the warning + editor in the workspace when account number is missing.

### Files changed
- `src/lib/api/freshdesk.functions.ts` — broader detection
- `src/lib/tickets-store.ts` — `accountSource`, `setAccountNumber`, `refreshAccountFromFreshdesk`, sync guard, default empty string
- `src/routes/_authenticated/freshdesk-tickets.$ticketId.work.tsx` — header editor + warning
- (new) `src/components/freshdesk/AccountLinker.tsx` — small reusable inline editor/warning component

No backend/migration changes — accounts live in `accountsStore` (localStorage), matching existing patterns.
