## Bug

Clicking **Continue Ticket Work** crashes with "This page didn't load". Console shows:

> Invariant failed: Could not find an active match from "/freshdesk-tickets/$ticketId/work"

TanStack Router's `useParams({ from })` needs the **full route ID**, which includes the `_authenticated` layout segment (even though `_authenticated` is stripped from the URL).

Two route files have the wrong `from`:

- `src/routes/_authenticated/freshdesk-tickets.$ticketId.work.tsx` — uses `from: "/freshdesk-tickets/$ticketId/work"`
- `src/routes/_authenticated/contact-dispatch.$sessionId.work.tsx` — uses `from: "/contact-dispatch/$sessionId/work"`

## Fix

Add the `/_authenticated` prefix to both:

- `from: "/_authenticated/freshdesk-tickets/$ticketId/work"`
- `from: "/_authenticated/contact-dispatch/$sessionId/work"`

Then verify by navigating to a ticket work page and a dispatch session work page in the preview.

No other files affected.
