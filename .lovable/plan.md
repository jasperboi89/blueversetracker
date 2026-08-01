## Goal

Add a clean, printer-friendly way to print any Knowledge Vault note.

## Approach

A "Print note" action that opens the browser print dialog with a stripped-down, paper-styled version of the note — no sidebar, no galaxy background, no toolbars, no dark theme.

## What gets printed

- Note title
- Folder name, note type, tags, and last-updated date as a small header line
- The note body (rich text, formatting preserved: bold, lists, colors as grayscale-safe text)
- The AI-organized version too, if one exists (as a second section, labeled)
- Attachments: images printed inline at a sensible max width with their labels; non-image files listed by name

## Changes

1. **New `src/components/knowledge/PrintableNote.tsx`**
   - Renders the note into a hidden container (`id="knowledge-print-root"`) using light-on-white styling and serif-ish readable body type, independent of the app theme.

2. **`src/components/knowledge/KnowledgeVault.tsx`**
   - Add a Printer icon button next to the Maximize button in the editor header, and a "Print" item in each note card's hover action menu.
   - Clicking sets the note to print, renders `PrintableNote`, then calls `window.print()`.

3. **`src/styles.css`** — add an `@media print` block:
   - Hide everything except `#knowledge-print-root` (sidebar, dock, toasts, dialogs, background canvas).
   - Force white background / black text, remove shadows and blur.
   - `page-break-inside: avoid` on images and attachment blocks; sensible page margins.
   - Screen-only: `#knowledge-print-root` is hidden.

## Notes

Uses the browser's native print dialog, so "Save as PDF" works from the same flow — no new dependencies.
