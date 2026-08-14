# Production Modal Black-Screen Repair

## Confirmed production issue
The working source defines an explicit fixed, centered modal contract, but the stylesheet currently served by the published website omits that positioning block while retaining the overlay and modal surface rules. This creates the reported production-only failure: Chrome and Firefox show the dark overlay, but the dialog content can remain offscreen.

## Implementation
1. Move the non-negotiable viewport positioning into the shared dialog primitive using production-safe important utilities, so CSS optimization cannot discard it and HoloQuiet selectors cannot override it.
2. Keep the modal surface styling in the global theme contract, but remove duplicate positioning declarations that the production optimizer currently eliminates.
3. Apply the same invariant positioning treatment to alert dialogs; preserve sheets as edge-anchored panels.
4. Strengthen regression tests to inspect the shared primitive’s authoritative classes and validate the compiled production CSS—not only the uncompiled source stylesheet.

## Verification and release
- Test Night Plan item, add-item, completion decision, and close flows in Chromium and Firefox against a production build.
- Confirm the dialog bounding box is inside the viewport, content is above the overlay, and HoloQuiet does not alter its position or transform.
- Publish the verified build to the actual website and re-check the live production URL in both browsers.

## Scope
No Night Plan data, status, rollover, or workflow behavior changes.
