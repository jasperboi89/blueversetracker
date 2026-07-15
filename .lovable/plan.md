## Goal

Add a way to open the currently selected Knowledge Vault note in a large pop-up window for a roomier editing experience.

## Change (frontend only, `src/components/knowledge/KnowledgeVault.tsx`)

### Expand button on the note editor pane

- Add an "Expand" icon button (Lucide `Maximize2`) in the right-pane editor header, next to the existing title/actions.
- Clicking it opens a shadcn `Dialog` sized large (`max-w-5xl`, ~85vh tall) containing:
  - The note title as an editable input at the top.
  - The full rich-text editor bound to the same note state, so edits sync live with the underlying note.
  - Same autosave behavior as the inline editor (reuses existing update logic — no new server function).
  - A "Done" / close button (Lucide `Minimize2` or `X`) that closes the dialog and returns focus to the inline editor.
- ESC and clicking the backdrop also close the dialog.
- While the dialog is open, the inline editor stays mounted but the dialog's editor is the active surface.

### Small polish

- Dialog uses the app's glass-panel styling to match the rest of the vault.
- Keyboard shortcut: pressing `F` (or a small "Expand" tooltip hint) when the editor is focused opens the pop-up. (Optional — can drop if not wanted.)

## Out of scope

- No backend, schema, or server-function changes.
- No changes to the note list, sorting, bulk actions, or folder sidebar.
- No multi-window / detached browser window (uses an in-app modal, not `window.open`).

## Technical notes

- Reuse the existing rich-text editor component already rendered in the right pane; render a second instance inside the `Dialog` bound to the same `contentHtml` state and autosave handler so both views stay in sync.
- Track `isExpanded` in local component state in `KnowledgeVault.tsx`.
