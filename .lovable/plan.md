## Problem

Retest notes are captured with the rich-text editor (stored as HTML like `<p>Added a If Urgent for Consults &amp; Notices...</p>`), but the Retest History list renders that string as plain text, so tags and entities show up literally.

## Fix

**File:** `src/components/dispatch/ReasonFlowSection.tsx` — `RetestList` component (~line 365)

Change the notes render from raw text to HTML:

```tsx
{rt.notes && (
  <div
    className="mt-1 text-foreground/90 rich-text-content"
    dangerouslySetInnerHTML={{ __html: rt.notes }}
  />
)}
```

That's the whole change. Existing retests already saved render correctly (tags become formatting, `&amp;` becomes `&`).

## Out of scope

- RetestModal input (already rich-text)
- Storage shape / dispatch store
- Other note surfaces
- Sanitization changes beyond current app conventions (input comes from the same trusted editor used elsewhere)
