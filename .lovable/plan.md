# Completed Work Page

A new sidebar destination that lists every piece of finished work in one place, with filters, search, export to CSV, and the ability to reopen a record if it was marked complete by mistake.

## What you'll see

New sidebar item **Completed Work** (checkmark icon) routes to `/completed-work`.

The page has:
- Header with title + total count for the current filter
- Tabs: **All · Freshdesk · Contact Dispatch · Additional Work** (counts on each tab)
- Toolbar:
  - Search box (ticket #, account #, account name, title)
  - Date range filter: This shift · Last 7 days · Last 30 days · All time · Custom
  - **Export CSV** button (exports the currently filtered list)
- Results list grouped by day ("Today", "Yesterday", then dated). Each row shows:
  - Type icon + color (Freshdesk cyan / Dispatch violet / Additional gold)
  - Title (ticket subject, account name, or work title)
  - Reference line (ticket #, account #, completed-at time in Central)
  - Row actions: **Open** (jumps to the original work page) and **Reopen** (with confirm — moves status back to Working / clears the Ready/Completed state and `completedAt`)
- Empty state per tab when nothing matches.

## Sources (no schema changes)

Pulled live from the existing cloud-synced stores — no new tables:
- Freshdesk: `useTickets()` where `status === "completed"` and `completedAt` set
- Contact Dispatch: `useDispatch()` where `status === "ready"` and `completedAt` set
- Additional Work: `useAdditionalWork()` where `status === "completed"` and `completedAt` set

Reopen calls existing store actions:
- `ticketsStore.setStatus(id, "working")` and clear `completedAt`
- `dispatchStore.setStatus(id, "not-ready")` and clear `completedAt`
- `additionalWorkStore.setStatus(id, "working")` and clear `completedAt`
(If a store doesn't expose a clear-completedAt path today, add a small `reopen(id)` helper next to the existing setStatus.)

## Files

New:
- `src/routes/_authenticated/completed-work.tsx` — route + page shell, head() meta
- `src/components/completed-work/CompletedWorkPage.tsx` — tabs, filters, list
- `src/components/completed-work/CompletedRow.tsx` — row + Open/Reopen actions
- `src/components/completed-work/exportCsv.ts` — CSV builder

Edited:
- `src/components/layout/AppSidebar.tsx` — add "Completed Work" nav entry
- `src/lib/tickets-store.ts`, `src/lib/dispatch-store.ts`, `src/lib/additional-work-store.ts` — add `reopen(id)` if not already present
- `src/components/home/RecentlyCompleted.tsx` — wire its "View All Completed Work" button to navigate to `/completed-work` (instead of the side sheet), keeping the home preview as the quick-glance

## Out of scope

- Delete from this page (use the existing per-record delete)
- Editing fields from this page
- Real-time multi-tab refresh beyond what cloud sync already does
