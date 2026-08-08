# Delete an Additional Work task

Add a delete option so you can remove additional work items you no longer need.

## What you'll see

- **On each active card** (Additional Work list): a small trash icon button next to "Open Work".
- **On each completed card**: the same trash icon next to "Open Record".
- **On the work detail page**: a "Delete task" action in the header.
- Clicking delete opens a confirmation dialog ("Delete this task? This can't be undone.") with Cancel / Delete. On confirm, the item is removed, a toast confirms it, and if you were on the detail page you're returned to the Additional Work list.

## Technical notes

- The store already exposes `additionalWorkStore.remove(id)`; no data-layer change needed.
- Add an `AlertDialog` (shadcn) driven delete button in `src/routes/_authenticated/additional-work.index.tsx` for both `ActiveCard` and `CompletedCard`.
- Add the same action to `src/routes/_authenticated/additional-work.$workId.work.tsx`, navigating to `/additional-work` after deletion.
- Use `sonner` toast for confirmation; destructive styling from existing tokens (no hardcoded colors).
