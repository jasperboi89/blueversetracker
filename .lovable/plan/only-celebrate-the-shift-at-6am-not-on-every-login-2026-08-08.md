# Only celebrate the shift at 6am, not on every login

## What's happening

The "Shift Complete" celebration is tied to the shift *state*, not the *moment* the shift ends. Between 6:00am and 10:00am the app considers the shift "complete", so the first time the home dashboard loads in that window the overlay plays. On top of that, the "already celebrated today" marker is only saved after the full 13-second animation finishes — so if you close or navigate away early, the marker never gets written and it replays on the next load too.

## The fix

1. **Fire only on the live transition.** The celebration triggers only when the shift status changes from active/near-end to complete while the dashboard is open (i.e. the clock rolls past 6:00am with the app running). If the page loads and the shift is *already* complete, no celebration.
2. **Mark it immediately.** When the celebration starts, record today's shift as celebrated right away instead of at the end of the animation, so a refresh or early navigation can't replay it.
3. **Silently mark past shifts.** On load during the 6–10am window, quietly record that shift as celebrated so nothing is queued up to play later.

Everything else about the celebration (the wave overlay, the Quantum Bloom variant, the finalizing pause) stays the same.

## Technical notes

- All changes are in `src/components/home/ShiftCard.tsx`.
- Replace the `status !== "complete"` early-return effect with a `prevStatus` ref: seed it from the mounted status; only run the celebration when `prevStatus` was a non-complete value and the new status is `complete`.
- On first mount with `status === "complete"`, write `localStorage[CELEB_KEY] = getShiftKey(now)` without playing anything.
- Move the `localStorage.setItem` from the 13s timeout to the point where `phase` is set to `finalizing` (and, for Quantum Bloom, where `triggerCelebration` fires — already the case there).
