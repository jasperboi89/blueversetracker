## Problem

When you enter a ticket number that isn't already tracked and click **Pull Ticket from Freshdesk**, it always fails with the same generic "Ticket not found in Freshdesk. Check the number or connect Freshdesk in Settings." toast — even when the real cause is different (Freshdesk isn't connected, wrong API key, wrong ticket #, network error).

The root cause: this project's server function `freshdeskPullTicket` needs two server-side secrets, `FRESHDESK_DOMAIN` and `FRESHDESK_API_KEY`. Neither is set in this project's env right now (only commented-out placeholders exist in `.env.example`). Without them, the server returns `"Freshdesk is not connected. Add your domain and API key in Settings."`, but the client-side `pullFromFreshdesk` shim swallows the message and the lookup card shows the wrong error, so it looks like every pull just fails.

The Settings → Freshdesk Integration panel stores the domain + a display-only masked key in localStorage — it does NOT actually write the secrets used by the server. The tooltip already tells you to ask Lovable in chat to save them, but nothing on the failure path surfaces that.

## What to change

Scope: UI + error surfacing only. No changes to Freshdesk API logic or data model.

1. **`src/lib/tickets-store.ts` — return the real error from `pullFromFreshdesk`**
   Change the return type to `{ ticket: Ticket | null; error?: string; notConnected?: boolean }` so callers can distinguish "not connected" from "not found" from a transport error. Detect the "Freshdesk is not connected" message from `readCreds` and set `notConnected: true`. Update the other two callers (`AssignedInboxRow`, `CommandPalette`) minimally to unwrap `.ticket`.

2. **`src/components/freshdesk/TicketLookupCard.tsx` — show the real reason**
   - Show the actual server error text in the failure toast (e.g. "Freshdesk 401: invalid API key", "Ticket not found in Freshdesk", "Could not reach Freshdesk").
   - When `notConnected` is true, show a clearer toast: "Freshdesk isn't connected yet. Add credentials in Settings → Freshdesk Integration, or ask Lovable in chat to save `FRESHDESK_DOMAIN` and `FRESHDESK_API_KEY`."
   - Keep the "Create Ticket Work Manually" fallback so you can still proceed offline.

3. **`src/routes/_authenticated/settings.tsx` — make the missing-secrets state obvious**
   In the Freshdesk Integration card, when `freshdeskTestConnection()` returns the "not connected" error, replace the generic status row with an explicit callout that says the secrets aren't set and gives the exact chat prompt to save them. No new UI framework, just a styled note using existing components.

## Out of scope

- Wiring a UI form that writes `FRESHDESK_DOMAIN`/`FRESHDESK_API_KEY` directly to project secrets (that requires the secrets tool and is a separate ask).
- Any change to the Freshdesk fetch/normalize/search logic.
- Changing how already-tracked tickets open.

## Files to edit

- `src/lib/tickets-store.ts`
- `src/components/freshdesk/TicketLookupCard.tsx`
- `src/components/assigned-inbox/AssignedInboxRow.tsx` (unwrap new return shape)
- `src/components/command/CommandPalette.tsx` (unwrap new return shape)
- `src/routes/_authenticated/settings.tsx`

After the change, if Freshdesk secrets truly aren't set for this project, the toast will tell you so — and once we add `FRESHDESK_DOMAIN` / `FRESHDESK_API_KEY` via the secrets flow, Pull will work.