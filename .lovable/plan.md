## Problem

The Active Work dock pill (and the Insight toast "Open" action) link to a `to` value like `/_authenticated/contact-dispatch/$sessionId/work`. TanStack's `_authenticated` is a pathless layout — the real URL is `/contact-dispatch/$sessionId/work`. So clicking the dock or toast navigates to a path that doesn't exist and hits the 404 boundary.

## Fix (frontend only)

1. Drop the `/_authenticated` prefix from the `to` value passed into `setActiveWork(...)` in all three work routes:
   - `src/routes/_authenticated/contact-dispatch.$sessionId.work.tsx` → `to: "/contact-dispatch/$sessionId/work"`
   - `src/routes/_authenticated/freshdesk-tickets.$ticketId.work.tsx` → `to: "/freshdesk-tickets/$ticketId/work"`
   - `src/routes/_authenticated/additional-work.$workId.work.tsx` → `to: "/additional-work/$workId/work"`

2. Defensive sanitizer for already-persisted bad values (the store is persisted in localStorage, so an old value like `/_authenticated/...` could still be in play until the user re-opens the work page). Add a tiny helper that strips a leading `/_authenticated` segment and use it at the two link sites:
   - `src/components/workspace/ActiveWorkDock.tsx` — normalize `current.to` before passing to `<Link to>`.
   - `src/components/workspace/InsightToaster.tsx` — normalize `ins.to` before `navigate({ to })`.

No changes to the store shape, the work-log entries, business logic, styling, or any other files.

## Verification

- Start a dispatch session → dock pill appears → click the label → lands on the work page (no 404).
- Same for a ticket work page and an additional-work page.
- Insight toast "Open" action navigates correctly.