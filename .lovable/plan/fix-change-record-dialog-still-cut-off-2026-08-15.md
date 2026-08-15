# Fix: Change Record dialog still cut off

## What's going on

The Change Record dialog is one big scroll box: `DialogContent` itself scrolls, and the
header and footer are held in place with negative-offset `sticky` tricks. Its size is
controlled by a `max-height` clamp layered on top of `top: 50%` + `translate(-50%, -50%)`
centering. That combination is fragile: if the clamp is off by anything (browser chrome,
`vh` vs `dvh`, zoom, or a stripped style), the panel keeps growing outward from its centre
and runs past the top and bottom edges at once — exactly the symptom in the screenshot.

I have not measured the live element yet, so step 1 is measurement, not a guess.

## Plan

1. Reproduce at the reported window size, open the Change Record dialog, and read the real
   bounding rect plus computed `top`, `height`, `max-height`, and `transform` on
   `[data-slot="dialog-content"]` to confirm whether it truly overflows the viewport.
2. Replace centre-translate sizing with edge-anchored sizing so overflow becomes
   impossible: pin the dialog with `top: 1rem; bottom: 1rem` and centre it horizontally,
   instead of centring vertically and then clamping. A box anchored to both edges cannot
   exceed the viewport no matter what a CSS optimizer strips or how a browser reports `vh`.
3. Make the dialog a real three-row flex column: fixed header, scrolling middle, fixed
   footer. Drop the negative-offset `sticky` hacks in `ChangeRecordDialog` — the body
   scrolls, the panel does not.
4. Re-measure after the change (top >= 0, bottom <= viewport height, title and Save button
   both visible) and spot-check other dialogs (Add Snip, Night Plan item) so short dialogs
   still sit centred rather than stretching full height.

## Technical notes

- `src/components/ui/dialog.tsx`: inline style becomes edge-anchored (`top`/`bottom` inset,
  `left: 50%`, `translateX(-50%)`, `display: flex`, `flexDirection: column`, `height: auto`,
  `overflow: hidden`), with the panel no longer scrolling itself. Short dialogs stay centred
  via `margin: auto` inside the inset box instead of a translate.
- `src/components/ui/dialog.tsx`: `DialogHeader`/`DialogFooter` get `flex-shrink: 0`, and a
  scrollable body wrapper is exposed for callers to opt into.
- `src/components/changes/ChangeRecordDialog.tsx`: header, scrolling body, footer as
  siblings; remove `sticky -top-6` / `sticky -bottom-6` and the negative margins.
- `src/components/ui/dialog-layer.test.tsx`: assert the dialog is inset-anchored top and
  bottom and that popper surfaces still layer above modals.