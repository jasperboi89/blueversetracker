# Phase 2 — Freshdesk Tickets Module

Mock/local data only. No real Freshdesk API. No changes to Phase 1 visuals or Home Dashboard. No new top-level pages beyond the existing `/freshdesk-tickets` route plus a nested workspace route.

## Routes

- `/freshdesk-tickets` (replace Phase 1 placeholder) — ticket command center.
- `/freshdesk-tickets/$ticketId/work` — full Ticket Work Workspace page. Back goes to `/freshdesk-tickets`, not preview.

Files: `src/routes/freshdesk-tickets.tsx` (rewrite), `src/routes/freshdesk-tickets.$ticketId.work.tsx` (new).

## Data layer (mock, localStorage-persisted)

`src/lib/tickets-store.ts` — single subscribable store, same pattern as `night-plan-store.ts`. Shapes:

- `Ticket`: id, number, accountNumber, accountName, status (`working` | `waiting-cs` | `waiting-prog` | `completed`), priority, dueAt?, updatedAt, syncedAt?, issueClassification?, completedAt?, lastSyncFailed?
- `TicketDetails` (collapsed section): subject, region, company, topic, type, group, agent, freshdeskUrl
- `FreshdeskNote[]`, `HubHistoryEntry[]`, `FreshdeskAttachment[]`, `HubSnip[]` (with category, label, dataUrl, createdAt, initials)
- `WorkSession`: ticketId, issueText, changesText, resultStatus (`passed`|`failed`|`waiting-cs`|`waiting-prog`|`completed`|null), failureReason, waitingReason, resultNotes, hubNotes[], workSnips[], generatedNote { content, version, posted, postedAt }

Actions: `addNote`, `addSnip`, `updateWorkSession`, `syncTicket` (mock: 90% success, sets `syncedAt`/`lastSyncFailed`), `markPosted`, `markCompleted` (validates issueClassification only), `createManual`, `pullFromFreshdesk` (placeholder spawns a mock ticket). Recently-opened ticket IDs cached per shift via `getShiftKey()`.

`src/lib/mock/tickets-seed.ts` — seeds the store on first load (if empty) with at least one of each: Currently Working, Waiting CS, Waiting Programming, an overdue one, with-due/without-due, with-priority, synced/not-synced, plus notes/history/attachments/snips on at least one ticket. No real customer data.

## Components

`src/components/freshdesk/` (new folder):

- `TicketLookupCard.tsx` — numeric input, search-as-you-type against store; "Include Completed" toggle; last-5 recents this shift; no-match panel exposing "Pull Ticket from Freshdesk" (placeholder mock add) and "Create Ticket Work Manually" (mock add + open preview).
- `ActiveTicketSections.tsx` — header "Open / Active Ticket Work" with two display toggles (`Show Due Times` default on, `Show Priority` default off) persisted in `localStorage` (`aih:fd:toggles`). Renders `Currently Working On`, `Waiting on Customer Service`, `Waiting on Programming` only when non-empty. Sort: overdue first (most-overdue first), then oldest-updated. Soft empty state when all three are empty.
- `TicketCard.tsx` — compact glass card: ticket #, account, status, updated, optional due/priority/synced lines, Overdue badge with stronger red/amber edge glow. Actions `Open Preview` (primary), `Open Account` (secondary, placeholder for future Account Profile), `Sync` (icon). Mock sync produces inline shimmer "Synced" / "Sync failed. Open Preview for details." that fades; updates `syncedAt`; no modal. Card click opens preview. Subject/agent/raw URL hidden.
- `TicketPreviewDrawer.tsx` — right-side `Sheet` (bottom sheet on mobile, expandable). Top: ticket summary + conditional Due/Synced; primary `Continue Ticket Work` button (navigates to workspace route); action row `Add Note` `Add Snip` `Sync Freshdesk` `Open Account Profile` `Open Freshdesk`. Sections in fixed order:
  1. Ticket Summary
  2. Latest Freshdesk Notes (3 with View All / Show Less in place)
  3. Account Intel Hub History (same pattern)
  4. Freshdesk Attachments (same)
  5. Hub Saved Snips / Attachments (same)
  
  Collapsible **Ticket Details** (collapsed default) containing subject, region, company, topic, type, priority, group, agent, Freshdesk Link.
- `AddNoteModal.tsx` — single textarea; Save writes to Hub History with timestamp Central + initials `LTP`; no Freshdesk post.
- `AddSnipModal.tsx` — paste-from-clipboard (`onPaste` reads `clipboardData.items`) + file input; preview (image or filename); rename, remove, category dropdown (`Before Change` / `After Change` / `Testing Result` / `Error / Issue` / `Other`), optional label; Save stores as data URL on the ticket's Hub snips list.

## Workspace (`/freshdesk-tickets/$ticketId/work`)

`TicketWorkspace.tsx`:

- Header: ticket summary (compact) with `Back to Freshdesk Tickets`, `Sync Freshdesk`, `Open Freshdesk`, `Mark Ticket Completed` (header, near status — never inside Generate Note/Export).
- Collapsible section cards (`<details>`-style via shadcn `Collapsible`/`Accordion`) — all collapsed by default. Each header has a small status chip.
  1. **Ticket Issue** — freeform textarea. Chip: Empty / In Progress / Complete.
  2. **Changes Made** — freeform textarea. Chip: Empty / In Progress / Complete.
  3. **Result / Testing** — required status select (`Passed` / `Failed` / `Waiting on CS` / `Waiting on Programming` / `Completed`); freeform notes. Failed → require Failure Reason. Waiting CS / Waiting Programming → require Waiting Reason. Completed → no extra notes required. Validation enforced only on saving that section.
  4. **Notes** — Hub notes list, add inline (timestamp Central, initials LTP, never posts to Freshdesk). Chip: `N notes`.
  5. **Snips** — paste/upload/preview/rename/remove/category/label; saved snips show thumbnail, category, label, timestamp, actions Copy Image / Download / Open Full Size / Delete. Chip: `N attached`.
  6. **Generate Note / Export** — Issue Classification select (`Scripting Issue` / `Client Change` / `Other`) that suggests template (Scripting Issue Note / Client Change Note / Standard Ticket Work Note); user can override. Buttons: `Generate Note`, `Copy Final Version`, `Copy Text Only`, `Download Included Snips`, `Open Freshdesk Ticket`, `Mark Posted Manually`, `Save Work Session`. Editable preview rendered **inside the section**. Generation uses a local template assembling Ticket Issue / Changes Made / Result/Testing + inserts placeholder lines for included snips. Missing-detail warning panel lists `Go to …` shortcuts that expand the matching section, scroll to it, and pulse a soft glow; `Generate Anyway` is always available unless the selected Result/Testing status genuinely lacks its required reason. For Scripting Issue / Client Change show "Snips are recommended…" hint.

`MarkPostedConfirm.tsx`, `MarkCompletedConfirm.tsx` — BlueVerse confirmation dialogs. Mark Posted records posted timestamp + initials LTP, does not change status. Mark Completed requires Issue Classification only; sets status `completed`, completedAt, initials LTP, closes workspace, navigates back to `/freshdesk-tickets`; ticket disappears from active sections and surfaces in Recently Completed Work (extend the shared mock-completed store so newly completed tickets appear there).

## Toggle/preview behavior details

- `Show Due Times` / `Show Priority` persisted in `localStorage` under `aih:fd:toggles:v1`.
- Overdue computed from `dueAt < now`; styling and sorting applied regardless of Show Due Times.
- Synced line hidden when never synced.
- Sync action returns a Promise; while pending show a subtle spinner on the icon; result message lives next to the action.

## Recently Completed Work hook

Update `src/lib/mock/completed.ts` to a subscribable list (or add a thin `completed-store.ts`) so `RecentlyCompleted.tsx` re-renders when a workspace marks a ticket completed. Keep the existing seed entries.

## Strict non-goals

No Completed Tickets section on the page · no API · no subject/agent/URL on cards · ticket subject stays inside Ticket Details only · preview is always drawer · Mark Completed is header-only · Generate Note is inline in its section, not a modal · no new statuses · no Home Dashboard changes · no other modules.

## Deliverable checklist

Freshdesk Tickets page · lookup card with toggles + recents + manual create/pull placeholders · stacked active sections with hide-empty behavior · clean ticket cards · persistent toggles · overdue card behavior · mock card-level sync · Ticket Preview drawer with all five sections + collapsible Ticket Details · Add Note + Add Snip modals · workspace route with collapsible work sections · required field rules for Failed/Waiting · Generate Note inline preview + missing-detail shortcuts · Mark Posted confirm · Mark Completed confirm + return flow · responsive desktop/tablet/mobile.

Awaiting approval to build Phase 2.
