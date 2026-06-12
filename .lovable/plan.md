# Editable Dropdown Labels (Global)

A single "Dropdown Labels" section in Settings lets you manage every dropdown in the portal: rename text, add new options, remove options you don't use, and drag to reorder. Changes apply everywhere the dropdown is used.

## What you'll see in Settings

A new card: **Settings → Dropdown Labels**.

It lists every dropdown group in the app, each as a collapsible panel:

- **Ticket — Section Status** (Working, Waiting, Blocked, Ready, etc.)
- **Ticket — Snip Category** (Dispatch snip categories)
- **Ticket — Check Result** (Passed, Failed)
- **Ticket — Reason Urgency** (Routine, Urgent, N/A, Not Sure Yet)
- **Ticket — Retest Result** (Passed, Still Failed)
- **Additional Work — Reason** (Scripting Issue, Client Change, Other)
- **Additional Work — Snip Category**
- **Freshdesk Snip — Category**
- **Settings — Quantum Bloom Density / Motion** (Off/Low/Normal/High, Low/Medium/High)

Each panel shows the current options as a draggable list. For every row:
- Edit the label inline
- Drag handle to reorder
- Trash icon to remove (with confirm)
- "Add option" button at the bottom
- "Reset to defaults" button per group

## Two categories of dropdowns

Some dropdowns drive logic (status, result), others are free-form tags (categories). The editor handles both, but with one safety rule:

- **Logic-bound groups** (status, result, urgency, retest result): rename + reorder + add new entries freely; removing a built-in option is allowed but warns "tickets currently using this option will keep it until changed." The internal value stays stable so existing data never breaks.
- **Free-form groups** (snip categories, additional-work reason): full rename / add / remove / reorder with no restriction. Existing items that referenced a removed category fall back to "Uncategorized."

## How it works

A new store `src/lib/settings/dropdown-labels-store.ts` holds the user's overrides:

```ts
type DropdownOption = { value: string; label: string; builtin?: boolean };
type DropdownGroupId =
  | "ticket.sectionStatus" | "ticket.snipCategory" | "ticket.checkResult"
  | "ticket.reasonUrgency" | "ticket.retestResult"
  | "addwork.reason" | "addwork.snipCategory"
  | "freshdesk.snipCategory"
  | "qb.density" | "qb.motion";
```

Persisted in `localStorage` under `dropdown-labels:v1`. Defaults seeded from the current hard-coded lists in `src/lib/dispatch-store.ts`, `src/lib/additional-work-store.ts`, `src/components/freshdesk/AddSnipModal.tsx`, and `src/components/settings/ThemesSection.tsx`.

A hook `useDropdownGroup(groupId)` returns the ordered, labeled options. Every existing `<Select>` consumer is refactored from hard-coded `<SelectItem>` lists to `group.map(o => <SelectItem value={o.value}>{o.label}</SelectItem>)`. Label display (e.g. `SECTION_STATUS_LABEL[s]` in `StatusChip`) reads from the same store via a helper `getLabel(groupId, value)`.

Drag-and-drop uses `@dnd-kit/core` + `@dnd-kit/sortable` (already common; will add if missing).

## Files

**New**
- `src/lib/settings/dropdown-labels-store.ts` — store, defaults, helpers
- `src/hooks/use-dropdown-labels.ts` — `useDropdownGroup`, `useDropdownLabel`
- `src/components/settings/DropdownLabelsSection.tsx` — collapsible groups + sortable rows

**Edited**
- `src/routes/_authenticated/settings.tsx` — mount the new section
- `src/components/dispatch/ChecksSection.tsx`, `OverallResultSection.tsx`, `ReasonFlowSection.tsx`, `RetestModal.tsx`, `AddSnipModal.tsx`, `StatusChip.tsx`
- `src/components/additional-work/CreateAdditionalWorkModal.tsx`, `AddWorkSnipModal.tsx`
- `src/components/freshdesk/AddSnipModal.tsx`
- `src/components/settings/ThemesSection.tsx` (density/motion dropdowns)
- `src/lib/dispatch-store.ts` — `SECTION_STATUS_LABEL` becomes a getter that reads overrides; types stay
- `src/lib/additional-work-store.ts` — same treatment for `ADDWORK_SNIP_CATEGORIES`

## Out of scope

- Adding new dropdown *groups* the app doesn't already have
- Per-user/team sync (local to this browser, like other settings)
- Renaming non-dropdown UI labels (buttons, headings)

Ready to build?
