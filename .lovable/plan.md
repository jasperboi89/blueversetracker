I’ll rework the Programming Status Email so it reads like a structured report instead of a compressed paragraph.

## What will change

1. **Fix the on-screen generated email preview**
   - Stop rendering the plain-text email inside a rich text editor that collapses line breaks.
   - Show/edit it in a newline-preserving editor with larger readable text.
   - Remove the tiny monospace styling that makes the email feel cramped.

2. **Make the plain-text email much more separated**
   - Add strong visual section dividers for:
     - Freshdesk Tickets Worked
     - Contact Dispatch Testing
     - Additional Work
     - Items Still In Progress / Waiting
     - Items Needing Attention
   - Put blank space before and after each section.
   - Number every entry inside each section.
   - Separate each ticket/work item with a clear divider and extra spacing.
   - Put fields on their own lines, for example:

```text
FRESHDESK TICKETS WORKED
============================================================

1. Ticket #369427 - Account 48043 / Dr. Movassaghi's Office

   Summary:
   When the office checks in...

   Status:
   Completed Programming

   Programming Notes:
   Changes: ...
   Notes: ...

------------------------------------------------------------

2. Ticket #369462 - Account 5698 / Norco Medical - Missoula
...
```

3. **Make the rich “Copy Email with Snips” version more readable**
   - Keep Freshdesk, Contact Dispatch, and Additional Work as distinct HTML sections.
   - Render each ticket/work item as a larger, spaced card with a bold numbered header.
   - Increase font size and line height.
   - Keep snips inline within the correct ticket/work item, but give them spacing so they don’t crowd the text.

4. **Keep scope limited**
   - No changes to what items are included.
   - No changes to ticket/dispatch/additional-work data logic.
   - No backend changes.
   - No changes to the dispatch summary feature unless it shares the same copy helper directly.

## Files expected to change

- `src/lib/reports/prog-email-format.ts`
- `src/lib/reports/prog-email-rich.ts`
- `src/routes/_authenticated/reports.tsx`