## Goal

In Contact Dispatch testing → Reason for Call Flow, when you click **Add Reason**, automatically collapse all existing reason cards so only the newly added one is expanded. You can still click any collapsed card header to re-open it.

## What changes in the UI

- Each reason card gets a collapsible body. The header row (source label, type, status chip, Duplicate, Delete) stays visible with a chevron + click target to expand/collapse.
- New reasons are inserted expanded. All sibling reasons collapse at the same moment.
- Collapsed cards show a one-line summary: reason text + result chip, so you can still scan the list quickly.
- Manually expanding an old card does NOT re-collapse others; the auto-collapse only fires on Add Reason / Duplicate.

## Technical notes

- `ReasonFlowSection` owns a `Set<string>` of expanded reason IDs in local state (no store changes — purely UI).
- Wrap each `ReasonCardView` body (everything below the header row) in `Collapsible` from `@/components/ui/collapsible`, controlled by that set.
- Add Reason handlers (`addManual`, `addFromTemplate`, and the per-card Duplicate button) replace the expanded set with `{ newReasonId }` after calling the store. To get the new ID, read the returned id from `dispatchStore.addReason` / `duplicateReason` (verify return shape in `src/lib/dispatch-store.ts`; if they don't return the id, diff `session.reasons` before/after to find it, or have the store return the id — minimal store tweak only if needed).
- Default state on mount: only the last reason is expanded (so reopening a session doesn't show a wall of open cards). If there are zero reasons, nothing to expand.
- No persistence — expanded state is per-session-view only.

## Out of scope

- Persisting expanded/collapsed state across reloads.
- Collapsing other sections (Phone, Repeat, Save/Message). This only affects Reason cards.
