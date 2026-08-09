# Fix: "Shift Complete" celebration firing when the shift isn't over

## What's actually happening

The earlier fix corrected the Shift card itself — it only celebrates on the live 6:00am transition. But there is a second, unrelated source of the same overlay.

`MilestoneWatcher` fires celebrations for ordinary milestones (every 5th completed ticket, clearing all overdue) and tags them with `kind: "shift"`. The Quantum Bloom celebration layer renders any `kind: "shift"` event as the full-screen aurora sweep that reads **"Shift Complete — Good morning, Luke."** So completing a 5th ticket at 1am shows a shift-complete celebration.

## The fix

1. Add a distinct `milestone` celebration kind to the celebration bus.
2. Point the ticket-count and overdue-cleared milestones at that new kind.
3. Give `milestone` its own visual in the celebration layer: a shorter bloom/ring with the event's own label ("5 tickets completed this shift", "All overdue tickets cleared") instead of the shift copy.
4. Reserve the aurora + "Shift Complete" overlay strictly for the real 6:00am shift end.

Also: make the shift-end overlay double-check the clock, so it can only render while the shift status is genuinely `complete`.

## Technical notes

- `src/lib/quantum-bloom/celebration-bus.ts`: add `"milestone"` to `CelebrationKind`.
- `src/components/quantum-bloom/CelebrationLayer.tsx`: add a `DURATIONS.milestone` (~1800ms) and a branch rendering a crystal-glass toast-style bloom using `active.label`.
- `src/components/workspace/MilestoneWatcher.tsx`: change both `kind: "shift"` to `kind: "milestone"`.
- `src/lib/achievements/catalog.ts`: the `comeback_kid` achievement counts discoveries of kind `shift`; leave it on `shift` so it tracks real shift completions only.
- `src/components/home/ShiftCard.tsx`: guard the `finalizing`/`celebrating` render on `status === "complete"`.
