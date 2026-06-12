# Phase 5 — Reports & Shift Summary

Build the Reports page as a clean BlueVerse command center for seven reports, finish the Programming Status Email Generator, and wire the supporting alerts. Mock/local only — no Freshdesk/Gmail/Outlook integration, no chart libs, no redesigns of Phases 1–4.

## 1. New stores & helpers

`src/lib/reports/`
- `programming-email-store.ts` — drafts keyed by shift key + custom range hash. Per draft: window, includedIds, attentionIds, versions (Generated / User Edited / Final Sent / Marked Sent), sentAt, initials. Persist to `aih:prog-email:v1`. Versions stay portal-only, never appear in copied email.
- `recurring-issues.ts` — pure selectors over `ticketsStore`: `scriptingTicketsByAccount(months=6)`, `rollingWindowCount(account, days=30)`, `accountsTriggered()` (>3 in any rolling 30-day window since last review), `dismiss(account)` / `markReviewed(account)` persisted to `aih:recurring:v1` with `lastReviewedAt` and `lastTriggeredAt`. Only `issueClassification === "Scripting Issue"`.
- `night-plan-archive.ts` — extends `nightPlanStore` reads: groups historical items by `shiftKey`, computes carry-over trail, exposes `archived()` (>30 days), `readyForCleanup()` (>3 months), `confirmDelete(ids[])`. Add archive storage `aih:nightplan-archive:v1` written when a shift rolls; for Phase 5 derive on the fly from the existing store plus a small `archived` flag.
- `shift-window.ts` — single source of truth for shift bounds:
  - `currentShiftWindow(now)` returns `{start,end,label}` following the 10pm/12am/6am rules in the spec.
  - `windowFromRange(startISO,endISO)`.
  - `itemsInWindow(updatedAt|completedAt, window)`.

Extend `additional-work-store.ts` only as needed: add `completionFinalNotes` accessor already exists; add `setStatus` is already there. No schema change.

## 2. Mock seeds

`src/lib/mock/reports-seed.ts` runs once at first load to push extra demo rows into the existing stores so reports have data without redesigning Phases 1–4:
- Freshdesk: 1 completed Scripting, 1 completed Client Change, 1 completed Other, plus 3 historical Scripting tickets for one account (~10/25/60 days ago) so recurring-issue logic trips.
- Dispatch: ensure one of each status, one with failed+retest history, one with summary versions.
- Additional Work: completed w/ account, completed w/o account (existing seed already covers active variants).
- Night Plan archive: synthesize a handful of `archived` items across older shift keys including one carried-over trail, one converted, one ready-for-cleanup.

Run guarded by `localStorage.getItem("aih:reports-seed:v1")`.

## 3. Reports page

`src/routes/reports.tsx` replaces the placeholder.

Layout:
- Header — 3D glass document icon, "Reports", subtitle.
- Selector grid — 7 BlueVerse cards (icon, title, one-line purpose, count/last-updated chip, "Open Report" button). Responsive grid → 1/2/3 columns.
- Active report area — full-width panel below the grid; deep-linkable via search param `?r=ticket-history|dispatch-status|add-work|account-history|prog-email|recurring|night-plan`. Use `validateSearch` with zod fallback.
- Export/copy actions live inside each report (Copy Report Text, Export — placeholder toast).

Components in `src/components/reports/`:
- `ReportSelectorGrid.tsx`
- `ReportShell.tsx` — title bar, filter bar slot, body slot, footer actions.
- `FilterBar.tsx` — date range picker (shadcn datepicker w/ `pointer-events-auto`), status multi-select, classification multi-select, account search, free-text search. Collapses into an accordion on mobile.
- `ExpandableRow.tsx` — row + chevron-expanded detail; works for all list reports.

### Report 1 — Freshdesk Ticket Work History
`reports/FreshdeskHistoryReport.tsx`. Reads `ticketsStore`. Filters: range, status (incl. Completed), classification, account, ticket #. Default last 30 days, newest first. Row: ticket #, account, status chip, classification chip, updated, completed, posted indicator. Actions: Open Ticket Preview (reuse existing `TicketPreviewDrawer`), Open Account (`/accounts/$number`), Copy latest generated note. Expand shows Issue, Changes, Result/Testing, Failure/Waiting reasons, latest generated note, snip thumbnails.

### Report 2 — Contact Dispatch Testing Status
`reports/DispatchStatusReport.tsx`. Reads `dispatchStore`. Filters: range, status, account, linked ticket #, has-failed-sections, has-retest-history. Row: account, status chip, readiness %, ticket link, updated, completed. Expand: reason summaries, three section results, failed/retested sections, review/not-ready reason, latest summary version. Actions: Open Testing (`/contact-dispatch/$sessionId/work`), Open Account, Copy latest summary.

### Report 3 — Additional Work History
`reports/AddWorkHistoryReport.tsx`. Reads `additionalWorkStore`. Filters: range, status, account-linked toggle, classification, account, title. Row: title, linked account, status, classification, updated, completed. Expand: whatNeedsDone, completionSummary/finalNotes, notes, programmingStatusNotes, snips. Actions: Open Work, Open Account, Copy Programming Status Notes.

### Report 4 — Account History / Issues by Account
`reports/AccountHistoryReport.tsx`. Requires account search; shows recently viewed accounts otherwise (use `accountsStore.recent`). Row per account: name/number, status, counts (FD/CD/AW/Notes), last activity. Expand: grouped lists newest-first per type with Open Record. Filters: range, work type checkboxes, classification, status. Actions: Open Account Profile, Export placeholder.

### Report 5 — Programming Status Email Generator
`reports/ProgEmailReport.tsx` + companion modal `components/reports/ProgEmailSetupModal.tsx`.

Setup:
- Use Current Shift (window computed by `shift-window.ts`; always shown even outside window).
- Choose Custom Date/Time Range (two shadcn datepickers + time inputs).
- Selected window banner: `Shift: <date> into <date>` + `Window: 10:00 PM – 6:00 AM Central`.

Builder layout (desktop: 2-col with picker left, preview right; tablet/mobile stacked):
- Left pane — section toggles + "Items Needing Attention" picker. Picker queries only active waiting/in-progress items across FD/CD/AW (plus Night Plan items if any are pinned manually). Selecting a Night Plan item places it under Additional Work in the output and does NOT convert it.
- Right pane — editable email preview (`<textarea>` styled). Header: "Programming Status Summary / Shift: … / Window: …". Sections in fixed order: Freshdesk Tickets Worked, Contact Dispatch Testing, Additional Work, Items Still In Progress / Waiting, Items Needing Attention. Empty sections hidden; numbering omitted (plain headers, no list numbers per spec).

Local generator (`reports/prog-email-format.ts`):
- Pulls verbatim from documented fields. Never invents text.
- Detects insufficient detail per spec rules and shows inline warning chips per item with `[Add Missing Details] [Generate Anyway] [Write Note Manually]`.
- Outputs plain text formatted exactly per spec example.

Actions row: Regenerate, Copy Email, Copy Plain Text, Save Draft in Hub, Mark Sent Manually.

Version history drawer (right slide-over):
- List labelled versions, newest first.
- Click → preview, Restore, Copy. Never exported in email body.

Mark Sent Manually modal:
- Confirmation copy per spec, records `sentAt` + `LTP`, locks version as "Final Sent / Marked Sent".

### Report 6 — Recurring Issues: Last 6 Months
`reports/RecurringIssuesReport.tsx`. Lists accounts with recurring scripting issues. Row: account, scripting count (6mo), rolling-30 count, last scripting date, manual flag. Expand → related tickets list (Open Ticket Preview). Critical alert visuals (red/amber/pink glow) per account row when triggered. Dismiss / Mark Reviewed actions update `recurring-issues` store.

### Report 7 — Night Plan History
`reports/NightPlanHistoryReport.tsx`. Default last 30 days grouped by shift key (label `<MMM d> into <MMM d>`). Filters: All / Done / Carried Over / Dismissed / Archived / Converted. Search collapses groups and shows only matching items annotated with their shift. Item rendering follows spec (Done shows completed time; Dismissed no dismissed time; Carried Over shows shift trail; Converted shows Open Additional Work). Archive section toggle for items >30 days. Cleanup-ready items expose `[Review Cleanup]` → confirmation modal that only removes Night Plan rows.

## 4. Alerts integration

`src/lib/mock/alerts.ts` → replace static array with a derived selector `useAlerts()` that combines existing mock alerts with:
- Overdue Freshdesk Tickets (count > 0).
- Recurring Scripting Issue Alerts (one per triggered account).
- Night Plan Cleanup Alert (when `readyForCleanup().length > 0`).
- 5:00 AM Night Plan Check-In (between 4:50–5:10 Central if active items remain).
- Unfinished Night Plan Review (after 6:00 AM Central if active items remain in the just-completed shift).

`AlertCenter.tsx` change is additive only: pass dynamic alerts in, preserve existing dismiss behaviour (dismissal keyed per-id, re-arms when underlying condition re-triggers — per spec, recurring resets only when 3 more issues occur after review).

## 5. Account Profile recurring-issue banner

In `src/routes/accounts.$accountNumber.tsx` add a `RecurringIssueBanner` near the top when `recurring-issues` flags this account: shows scripting count, rolling-30 info, `[View Related Tickets]` (jumps to the recurring report scoped to account), `[Mark Reviewed]`. Banner styling uses critical red/amber/pink glow. Dismissal calls `markReviewed`; history is never altered.

## 6. Home wiring

- `ShiftSummaryButton.tsx`: replace the placeholder "Custom range available later" with real options. Choosing either option navigates to `/reports?r=prog-email&window=current` or `&window=custom&from=…&to=…`. The generator reads search params to auto-open the setup.
- `RecentlyCompleted.tsx`: already merges sources — verify it still surfaces Phase 5 mock completions.
- `AlertCenter.tsx`: consumes new dynamic alerts (above).

No other Home/Phase-1–4 changes.

## 7. Responsive

Desktop ≥1280: selector grid 3 cols, report panel full width, email builder side-by-side, version history as right drawer.
Tablet 768–1279: selector grid 2 cols, builder stacked, drawers right.
Mobile <768: selector grid 1 col, filter bar collapses to accordion, email builder stacks, version history & filters as bottom sheets.

## 8. Out of scope (Phase 5 boundary)

No final Settings work, no Freshdesk API, no Gmail/Outlook, no PDFs, no Audit/Genesis/CRM, no new charts, no renamed modules, no Night Plan email section, no auto-deletion without confirm, no fabricated summary content, no Client Change in recurring counts.

## Technical notes

- All stores use the existing `useSyncExternalStore` pattern; persist behind versioned keys; SSR-safe initial state `{}` arrays.
- Datepickers use shadcn `Calendar` inside `Popover` with `pointer-events-auto`.
- Report deep-link search params validated via `zodValidator` + `fallback`.
- Copy actions use `navigator.clipboard.writeText` + `sonner` toast.
- Export actions are toast-only placeholders ("Export coming in a later phase").
- All visuals reuse existing BlueVerse tokens (`--cyan-glow`, `--electric`, `--violet-glow`, `--gold-glow`, plus the critical red/amber/pink already used in `AlertCenter`).
- No new dependencies.