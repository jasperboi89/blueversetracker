# Phase 4 — Additional Work + Account Profiles

Build the Additional Work module, the Account Profile module, the Night Plan → Additional Work conversion bridge, and integrate both into the existing Home Dashboard. BlueVerse visual style and Phase 1–3 modules stay untouched.

## 1. State / data layer

### `src/lib/accounts-store.ts` (new)
Subscribable store, `localStorage` key `aih:accounts:v1`. Seeds from existing `mockAccounts` on first load (preserved as the canonical list).
- Types: `AccountStatus = "active" | "archived"`, `Account { number, name, status, createdAt, updatedAt }`, `AccountNote { id, accountNumber, text, createdAt, initials, editedAt? }`, `AccountTemplate { id, accountNumber, name, type: "routine"|"urgent"|"blank", expectedFlow, notes?, archived, order }`.
- Actions: `create`, `update`, `archive`, `restore`, `changeNumber(old,new)` (with uniqueness check + cascade across additional work / tickets / dispatch), `addNote`, `editNote`, `deleteNote`, template `add/edit/duplicate/archive/restore/reorder`, `touchRecent(number)` (last 5 opened this shift, sessionStorage).
- Selectors: `getAccount(num)`, `searchAccounts(query, { includeArchived })`, `getTimeline(num)` (merges Freshdesk tickets, dispatch sessions, additional work, notes — newest first, with nested snips).

### `src/lib/additional-work-store.ts` (new)
Subscribable store, `localStorage` key `aih:addwork:v1`.
- Types: `AdditionalWorkStatus = "working" | "completed"`, `IssueClassification = "scripting" | "client-change" | "other"`, `AddWorkNote { id, text, createdAt, initials }`, `AddWorkSnip { id, dataUrl, label, category, createdAt }` (categories: `email|before|after|testing|error|other`), `AdditionalWork { id, title, accountNumber?, accountName?, whatNeedsDone, notes, programmingStatusNotes, issueClassification?, status, createdAt, updatedAt, completedAt?, completedBy?, completionSummary?, completionFinalNotes?, nightPlanItemId?, snips, notesList }`.
- Actions: `create`, `update`, `addNote/editNote/deleteNote`, `addSnip/deleteSnip`, `markCompleted(id, { summary, finalNotes, force })`, `fromNightPlan(item, accountNumber?)`.
- Seeds: active w/ account, active w/o account, completed w/ account, completed w/o account, one converted-from-night-plan.

### `src/lib/night-plan-store.ts` (edit)
Add `convertToAdditionalWork(id, accountNumber?)`: calls `additionalWorkStore.fromNightPlan(item, account)`, sets night plan item status `converted` with `additionalWorkId` link. Add `additionalWorkId?: string` to `NightPlanItem`. Add `Converted` tab filter helper.

### Mock additions
- `src/lib/mock/accounts.ts` — extend with timestamps, plus archived account that has Freshdesk + dispatch + note history (seeded into stores below).
- Seed Freshdesk tickets (existing `tickets-store`) + dispatch sessions against specific account numbers so the timeline has content. Add an `accountNumber` field to existing seeded items if missing (verify and extend during build).

## 2. Additional Work module

### `src/routes/additional-work.tsx` (replace placeholder)
Sections in order:
1. Page header — 3D glass task/check icon, title, subtitle.
2. `[+ Create Additional Work]` prominent glass card/button (opens modal).
3. Active list — stacked glass cards sorted oldest updated first. Card shows title, linked account (or "No account linked"), status chip, last updated Central time, short note preview, Open Work + Open Account (if linked).
4. Recently Completed Additional Work — compact cards (title, account, completed time Central, Open Record).
5. Empty state when neither list has content.

### `src/components/additional-work/CreateAdditionalWorkModal.tsx`
Fields per spec (Title required, Account # / Name optional w/ live search of accounts store, What needs done required, Notes, Status default Currently Working On, Issue Classification optional, Programming Status Notes optional). No Source, no due date. Account is optional and never blocks save. Live search showing matches; if no match, allow saving with free-text account number/name (placeholder link).

### `src/routes/additional-work.$workId.work.tsx` (new)
Full workspace.
- Header: title, linked account chip, status chip, last updated Central. Actions: Back, Open Account (if linked), Mark Completed.
- Collapsible BlueVerse cards: Work Details, Notes, Snips, Programming Status Notes, Completion Summary.
- Components: `WorkDetailsSection`, `NotesSection` (timestamp Central, initials LTP, edit, delete w/ confirmation), `SnipsSection` (reuses dispatch `AddSnipModal` pattern; categories: Email/Request, Before, After, Testing, Error, Other; preview, copy, download, open full size, delete w/ confirm), `ProgrammingStatusNotesSection`, `CompletionSummarySection`.
- `MarkCompletedModal`: warns if summary empty ("Mark Completed Anyway"), blocks only if title missing. On confirm → return to `/additional-work`.

### Night Plan integration
- `src/components/home/NightPlan.tsx` (edit): per-item action "Convert to Additional Work" opens `ConvertToAdditionalWorkModal` with Attach Account search, three buttons: Cancel / Convert Without Account / Attach Account & Convert.
- Converted items: removed from active counts/progress, shown under Converted tab while the linked Additional Work is still active, moved to history once completed (link preserved).

## 3. Account Profile module

### `src/routes/accounts.tsx` (replace placeholder — Account Lookup landing)
Search-as-you-type (number priority, then name). Active first; "Include Archived / Off Service" toggle. Recent accounts (last 5 this shift). "Create New Account" button when query has no match → `CreateAccountModal` (number + name required, unique check, default Active; duplicate → "Open Existing Account"). Clicking result navigates to `/accounts/$accountNumber`.

### `src/routes/accounts.$accountNumber.tsx` (new)
Header: account number, name, status badge (Active / Off Service · Archived), last updated Central. Header actions: Start Freshdesk Ticket (modal → ticket number → links + routes), Start Contact Dispatch Testing (routes to dispatch start with prefilled account), Start Additional Work (opens Create modal prefilled), Add Account Note (modal w/ Account Note vs Ticket Note radio — if Ticket Note, choose from this account's tickets), Add Snip / Attachment, Archive / Restore (each with confirmation modal per spec). Archived banner with View History + Restore.

Main sections (BlueVerse cards, Timeline central):
- **Account Timeline** — `AccountTimeline` component. Mixed Freshdesk / Dispatch / Additional Work / Notes, newest first. Filters: All / Freshdesk / Contact Dispatch / Additional Work / Notes. Each item renders type-specific card with Expand + Open Record actions, nested snips inline (not separate entries).
- **Account Notes** — list with edit/delete (delete confirms).
- **Snips / Attachments** — grouped by source (Freshdesk → per ticket → per category; Contact Dispatch → per session → per category; Additional Work → per work item → per category). Each snip: preview, label, category, date Central, Open Source, copy, download, open full size.
- **Contact Dispatch Templates** — account-scoped templates. Add/Edit/Duplicate/Archive/Restore/Reorder. Archived hidden by default with toggle.
- **Account Details** — number/name/status/created/updated. Edit name + status inline. Account number change requires confirmation, uniqueness check, cascades, preserves history.

### Components in `src/components/account/`
`AccountTimeline.tsx`, `TimelineItemFreshdesk.tsx`, `TimelineItemDispatch.tsx`, `TimelineItemAddWork.tsx`, `TimelineItemNote.tsx`, `AddAccountNoteModal.tsx`, `ArchiveAccountModal.tsx`, `RestoreAccountModal.tsx`, `CreateAccountModal.tsx`, `StartFreshdeskTicketModal.tsx`, `AccountTemplatesSection.tsx`, `AccountDetailsSection.tsx`, `SnipsSection.tsx`.

### Dispatch templates bridge
Extend `src/lib/mock/dispatch-templates.ts` (or wire dispatch store) so the Contact Dispatch Testing workspace can read per-account templates from `accountsStore.templates`. No redesign of Dispatch — additive read only.

## 4. Home Dashboard integration (additive only)

- `src/components/home/OverviewCards.tsx` — Open Items count now includes Additional Work `working`. In Review unchanged (already pulls dispatch). 
- `src/components/home/RecentlyCompleted.tsx` — merge completed Additional Work entries (sorted by `completedAt`).
- `src/components/home/LookupCards.tsx` — Account Lookup card already routes; ensure clicking a result opens `/accounts/$number`. Last-5-this-shift list shown in lookup dropdown.
- No visual redesign; only data merge + link wiring.

## 5. Routing / route tree

Add routes: `/additional-work/$workId/work`, `/accounts/$accountNumber`. Confirm `routeTree.gen.ts` regenerates (auto). `accounts.tsx` becomes leaf landing, `accounts.$accountNumber.tsx` is the profile.

## 6. Responsive

- Desktop: 2-column where natural (header actions row, timeline + side cards stacked under on smaller widths).
- Tablet: cards wrap, sections single column.
- Mobile: stack, modals → bottom sheets where they exist in shadcn ui set, timeline cards full width.

## 7. Strict guardrails

- No Source field, no due dates, no required account on Additional Work.
- No Reports, Settings (beyond per-account templates), Audit, Genesis, CRM.
- No new statuses beyond those listed.
- Snips never appear as separate timeline items.
- Archive never deletes history; templates with usage never hard delete.
- BlueVerse tokens only; reuse existing glass/gradient utilities from `styles.css`.

## Out of scope (Phase 5+)
Reports page, Settings page, Freshdesk API integration, polish pass.

Stop after Phase 4. Awaiting approval before continuing.
