# Night Plan item dialog: black screen, no visible modal

## What is happening

Clicking a Night Plan task (e.g. Kathy's) darkens the whole app but no dialog appears. The dark layer is the modal overlay, so the dialog *is* opening — its content is either painting invisibly, painting behind theme layers, or crashing during render.

I could not reproduce this in a signed-in browser session from my side (no test session is available), so the exact cause is not yet confirmed. The first step of this plan is to confirm it with instrumentation rather than guess.

## Step 1 — Confirm the cause (before any styling change)

Add a temporary diagnostic that logs, when the item dialog opens:
- whether a `[data-slot="dialog-content"]` node exists in the DOM
- its computed `opacity`, `transform`, `z-index`, `visibility`, and bounding rect
- any render error thrown inside the dialog subtree

This distinguishes the three realistic causes:
1. Content rendered offscreen or with zero size (positioning/transform).
2. Content rendered but painted under theme decoration layers.
3. Content never rendered (a crash inside the dialog body, swallowed by a boundary).

## Step 2 — Make modal surfaces theme-independent

Regardless of which cause Step 1 confirms, the underlying fragility is that dialogs reuse `.glass-panel`, which the HoloQuiet theme decorates heavily (isolation, `::before` veil, `::after` frame at `z-index: 0`, backdrop filters). A positioned `::after` at `z-index: 0` on an isolated panel paints above the panel's own text, which is exactly the class of bug seen here.

Change:
- Introduce a dedicated modal surface class used by dialogs/sheets instead of `.glass-panel`, with its own opaque-enough background, border and blur.
- Exclude modal surfaces from HoloQuiet's `.glass-panel` decoration rules (`::before` veil, `::after` frame, hover lift, reflected-light rules).
- Keep the existing overlay/content layering contract (overlay 60, content 70) and Radix's centering transform untouched.
- Swap `glass-panel` for the new class on the Night Plan dialogs and the shared dialog/sheet/alert-dialog primitives.

## Step 3 — Guard against regression

- Extend the existing dialog-layer tests to assert that no theme rule applies `transform`, `opacity`, or a stacking `::after` to the modal surface class.
- Extend the Night Plan completion test to assert the item title text is actually rendered and visible when a task row is clicked.
- Remove the Step 1 diagnostic once the fix is verified.

## Out of scope

No changes to Night Plan store behaviour, statuses, rollover, or the Completed / Carry Over / Dismiss flow. No layout or navigation changes.
