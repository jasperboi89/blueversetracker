# Clara gets a real face — cutout avatar, free positioning

Replace the boxy holographic video loop with the uploaded portrait, cut out on a transparent background, and let her be dragged anywhere on screen instead of snapping into a square corner tile.

## What you'll see

- Clara appears as a clean cutout of the woman from the uploaded photo — no black box, no square video frame, no hard edges.
- A soft cyan/violet rim glow and floor glow keep the holographic feel; scanlines get toned down and follow her silhouette instead of a circle.
- She idles with a gentle float and brightens when she has something to say (unchanged behavior).
- Drag her anywhere: she stays wherever you drop her, not only in the four corners. Position persists between sessions and stays on screen if the window is resized.
- The speech bubble flips to whichever side has room so it never runs off the edge.
- Close (X) still collapses her to the small pill; the pill sits near her last position.

## Technical notes

- Generate a transparent PNG from `user-uploads://ChatGPT_Image_Aug_8_2026_11_51_55_PM.png` (portrait cropped to head-and-shoulders, background removed) and register it via `lovable-assets` as `src/assets/clara-avatar.png.asset.json`.
- `src/components/presence/PresenceAvatar.tsx`: swap the `<video>` for an `<img>` of the cutout; drop `mix-blend-mode: screen`, `rounded-full`, and `object-cover`. Glow via layered `drop-shadow` filters so it hugs the silhouette. Keep a CSS orb fallback if the image fails.
- Free-drag: track pointer deltas and store `{ x, y }` as viewport fractions; clamp to visible bounds on drop and on window resize. Bubble side chosen from x position.
- `src/lib/presence/presence-prefs-store.ts`: add `pos: { x: number; y: number }` (default bottom-right), keep `corner` for migration of existing saved prefs.
- The old `avatar-hologram.mp4` asset stays in the repo but is no longer referenced.
- Presentation-only: no changes to triggers, voice, or Copilot logic.
