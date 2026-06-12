## Goal

Two problems to fix in **Settings**:

1. **Freshdesk API key** — the UI shows only a masked field and a "Test Connection" button. The note tells the user to ask Lovable to "add Freshdesk credentials," which is confusing. You need a way to actually save the API key from the app.
2. **Demo items** — the Hub is seeded with demo tickets, dispatch sessions, additional-work items, accounts, and night-plan archive entries. The current "Demo Mode" toggle only hides them; it doesn't delete them. You want a fresh slate.

## Plan

### 1. Freshdesk credentials — save from the UI

Right now `FRESHDESK_DOMAIN` and `FRESHDESK_API_KEY` are read from `process.env` in `src/lib/api/freshdesk.functions.ts`, but there's no way to set them from inside the app.

- In the Freshdesk Settings section, add a **"Save credentials"** button next to the existing Domain field and masked API Key field.
- Clicking it triggers the Lovable secret-entry prompt for `FRESHDESK_DOMAIN` and `FRESHDESK_API_KEY` (entered securely — values are not stored in the codebase or in the browser).
- After you submit them, click **Test Connection** to verify, which will flip the status chip to "Connected" and show the agent name.
- Keep the existing "Clear Connection" button (it clears the Hub-side status; secrets removal stays a separate admin action).

Technical note: secret entry is handled by Lovable's secret tool flow — the front-end just needs a button that surfaces the request. The server function `freshdeskTestConnection` already validates the saved values.

### 2. "Clear all demo data" — wipe the seeded items

Add a new block at the top of the **Data / Cleanup** section called **"Reset Hub Data"** with one destructive button: **"Clear all demo data"** (with a confirm modal).

When confirmed, it:
- Empties Freshdesk Tickets store (`aih:tickets:v1`)
- Empties Contact Dispatch Sessions store
- Empties Additional Work store
- Resets Accounts store back to empty (no seeded accounts, notes, or templates)
- Clears Night Plan history (archived + active)
- Turns **Demo Mode OFF** so seeds don't re-appear on next reload
- Leaves untouched: Freshdesk connection, AI settings, templates, dropdowns, shift settings, display preferences, security/access

To make this work each affected store gets a small `clearAll()` action that sets state to an empty object and persists. The button calls them in sequence and shows a toast `"Hub data cleared."`.

The existing **Hub Data Counts** block will then read 0 across the board, confirming the reset.

### Files to touch

- `src/routes/_authenticated/settings.tsx` — add Save-credentials button in Freshdesk section; add Reset Hub Data block + confirm modal in Data section.
- `src/lib/tickets-store.ts`, `src/lib/dispatch-store.ts`, `src/lib/additional-work-store.ts`, `src/lib/accounts-store.ts`, `src/lib/reports/night-plan-history.ts` — add a `clearAll()` action each.
- No schema changes, no edge functions.

### Out of scope

- I won't touch the demo seeders themselves (so devs can still inspect demo data with Demo Mode ON later if useful). The reset just wipes the live persisted store and disables the toggle.
- Removing Freshdesk secrets entirely (vs. clearing the Hub-side status) — that stays a separate action since secrets are managed outside the app.
