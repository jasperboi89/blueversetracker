# Restrict deleting completed additional work

Delete stays available for active tasks. Completed tasks can only be deleted from Settings.

## Changes

- **Additional Work list**: remove the trash icon from completed cards. Active cards keep theirs.
- **Task detail page**: the delete action only shows while the task is still active (status "working"). Once completed, it disappears.
- **Settings → Data / Cleanup**: new "Completed Additional Work" block listing completed tasks (title, account, completed date) with a trash button per row and the same confirmation dialog.

## Technical notes

- `src/routes/_authenticated/additional-work.index.tsx`: drop `DeleteWorkButton` from `CompletedCard`.
- `src/routes/_authenticated/additional-work.$workId.work.tsx`: render the delete action only when `work.status === "working"`.
- `src/routes/_authenticated/settings.tsx`: inside the existing `data` SectionCard, add a list driven by `useAdditionalWork()` filtered to `status === "completed"`, reusing `DeleteWorkButton`. Empty state when none.
