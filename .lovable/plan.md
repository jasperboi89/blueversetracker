# Repair Night Plan item dialog and full drawer

## Goal
Make both Night Plan interactions reliably display their content above the dark overlay on the actual website:
- Clicking a task opens the item detail flow, including Completed, Carry Over, and Dismiss.
- Clicking **Open full drawer** opens the Night Plan drawer.

## Implementation
1. Harden the shared Dialog and Sheet primitives so their viewport positioning, transform, dimensions, and stacking order cannot be displaced by HoloQuiet material rules or production CSS optimization.
2. Remove the ambient `glass-panel` class from the Night Plan drawer, since portaled overlays should use the dedicated modal/sheet surface contract rather than a page-card material.
3. Keep the existing Night Plan behavior and content unchanged; only repair layer rendering and visibility.
4. Extend the modal regression coverage to include Sheet as well as Dialog, checking overlay/content ordering and the required fixed viewport anchors.
5. Add an end-to-end Night Plan regression that clicks a task and **Open full drawer**, then verifies each surface has a visible bounding box inside the viewport and sits above its overlay.

## Verification
- Run the focused Dialog/Sheet and Night Plan tests.
- Verify both click paths in a production build with Chromium and Firefox at desktop size.
- Confirm the item dialog shows the task actions and the drawer shows its tabs and task list without leaving an orphaned dark overlay.

## Technical details
The item action uses the shared Radix Dialog while **Open full drawer** uses the shared Radix-based Sheet. Their overlays mount correctly, but existing tests only prove that content exists in the DOM and that positioning class strings are present. The repair will enforce the layout contract at the primitives themselves and validate computed, on-screen geometry rather than relying on class presence alone.