## Add: Delete a ticket

Give you a way to remove a ticket you created by mistake. It clears the ticket, its notes, snips, attachments, hub history, recents entry, and any open dispatch/additional-work it spawned through links back to that ticket id.

### Where the delete lives

1. **Ticket Preview Drawer** (`TicketPreviewDrawer.tsx`) — add a small "Delete ticket" button in the header action row (red ghost style, Trash icon). Opens a confirm modal.
2. **Ticket Card** (`TicketCard.tsx`) — add a Trash icon button in the card's top-right corner so you can delete straight from the Active Tickets list without opening the drawer.
3. **Workspace page** (`freshdesk-tickets.$ticketId.work.tsx`) — add "Delete ticket" in the page header overflow. After confirm, navigate back to `/freshdesk-tickets`.

All three entry points use the same `ConfirmModal` (tone: `danger`) with copy:
> Delete ticket #{number}? This permanently removes the ticket, its notes, snips, attachments, and hub history. This cannot be undone.

### Store changes

`src/lib/tickets-store.ts`:
- Add `deleteTicket(id: string): { ok: boolean }` — removes from `tickets`, `recents`, persists, notifies listeners.
- Used by all three UI entry points.

No business-logic changes beyond deletion. Sheboygan Internal Medicine and its seeded ticket remain untouched unless you delete them yourself.

### Out of scope

- Soft delete / trash bin / undo (hard delete only, matches your earlier "completely remove" preference).
- Bulk delete.
- Server-side deletion (tickets are client-side store; nothing to sync to Freshdesk).

### Files

**Edited**
- `src/lib/tickets-store.ts` — add `deleteTicket`
- `src/components/freshdesk/TicketPreviewDrawer.tsx` — Delete button + confirm
- `src/components/freshdesk/TicketCard.tsx` — Trash icon + confirm
- `src/routes/_authenticated/freshdesk-tickets.$ticketId.work.tsx` — header Delete + navigate away
