# Fix: Clipped Change Record dialog + Snip category dropdown hiding behind the modal

## Issue 2 — dropdown behind the pane (confirmed cause)

Modal surfaces are pinned at `z-index: 70` (dialog, alert dialog, sheet), but every
popper surface — Select, Dropdown menu, Popover, Tooltip, Hover card, Context menu —
still sits at `z-50`. So any select opened *inside* a dialog (the Add Snip "Category"
picker) renders underneath the modal panel.

Fix: give popper surfaces a layer above modals.
- Select content, dropdown-menu content/sub-content, popover, tooltip, hover card,
  context menu → `z-[80]` plus an inline `zIndex: 80` (the same belt-and-braces the
  dialog primitives already use, because the production CSS optimizer has dropped
  arbitrary z/position utilities on this project before).
- Applies globally, so every category/status/template select inside a modal is fixed
  at once, not just the Add Snip one.

## Issue 1 — Change Record dialog cut off top and bottom

The dialog is height-clamped only through the `max-h-[85vh]` / `max-h-[90vh]` utility
classes; the hard positioning (`fixed`, centered, z-index) is written inline because
those utilities were previously stripped in production. The screenshot shows a box
running past both the top and bottom edges of the window, which is what a lost
max-height looks like — but that is not yet proven, so step one is to reproduce and
confirm before changing behaviour.

Plan:
1. Reproduce in a browser at the reported window size and read the computed
   `max-height` / `height` on `[data-slot="dialog-content"]`.
2. Make the clamp non-strippable: move `maxHeight: min(90vh, calc(100dvh - 2rem))`,
   `overflowY: auto` and `display: flex/grid` sizing into the same inline style block
   in `src/components/ui/dialog.tsx` that already carries position and z-index.
3. Restructure `ChangeRecordDialog` so the header and footer stay pinned and only the
   form body scrolls, instead of the whole panel growing.

## Files
- `src/components/ui/select.tsx`, `dropdown-menu.tsx`, `popover.tsx`, `tooltip.tsx`,
  `hover-card.tsx`, `context-menu.tsx` — layer above modals
- `src/components/ui/dialog.tsx` — inline height clamp + scroll
- `src/components/changes/ChangeRecordDialog.tsx` — sticky header/footer, scrolling body
- `src/components/ui/dialog-layer.test.tsx` — assert popper layers sit above dialog
  layer and that the dialog carries an inline max-height
