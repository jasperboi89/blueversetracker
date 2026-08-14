# Night Plan Dialog Visibility Repair

## Confirmed cause
The Night Plan item dialog mounts successfully with its content intact, but the HoloQuiet `.glass-panel` material overrides the dialog primitive’s positioning. In the live preview the open dialog computes to `position: relative`, `transform: none`, and a top coordinate roughly 2,200px below the viewport; the fixed black overlay is therefore the only visible element.

## Implementation
1. Remove the ambient `glass-panel` material class from Night Plan modal content and use the dedicated modal surface contract instead.
2. Harden the shared dialog surface contract so portaled dialog content always retains fixed viewport positioning and its required 50% translation, regardless of theme material selectors.
3. Prevent broad HoloQuiet material rules from applying layout properties (`position`, `transform`, `isolation`) to dialog, alert-dialog, and sheet content while preserving their intended modal colors, borders, and shadows.
4. Replace the unsafe non-null item lookup in Night Plan with a guarded lookup so a stale/deleted task cannot crash dialog rendering.

## Regression coverage and verification
- Extend dialog tests to assert the modal positioning contract and ensure ambient panel classes cannot override it.
- Verify the Kathy task opens centered above the overlay in the live HoloQuiet preview.
- Verify close, edit, finish-task, and convert flows still work and that other dialogs remain centered.
