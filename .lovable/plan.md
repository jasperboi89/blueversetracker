## Goal

Make notes in the Knowledge Vault easier to edit, remove, and organize directly from the middle note list — without having to open each note first.

## Changes (frontend only, `src/components/knowledge/KnowledgeVault.tsx`)

### 1. Per-note quick actions on each `NoteCard`

Add a hover-revealed action menu (three-dot `MoreHorizontal`, like folders already have) to every card in the note list. Menu items:

- Rename — inline-edit the title on the card
- Pin / Unpin
- Favorite / Unfavorite
- Move to folder → submenu listing folders + "Unfiled"
- Change type → submenu of the 5 note types
- Archive / Restore
- Delete permanently (rose, with confirm)

Also add a small pencil quick-button next to the menu for one-click rename.

Wire actions through the existing `updateKnowledgeNote` / `deleteKnowledgeNote` server functions — no backend changes. Clicking an action must not trigger card selection (stop propagation).

### 2. Sort control above the list

Add a compact sort dropdown next to the "N notes" header:

- Recently updated (current default)
- Recently created
- Title A–Z
- Type
- Folder

Pinned notes stay on top in every sort. Store selection in local component state.

### 3. Bulk selection (light)

Add a small checkbox that appears on card hover. When any card is checked, a slim action bar appears at the top of the list with: Move to folder, Archive, Delete, Clear selection. Uses the same server functions in a loop.

### 4. Small polish

- Show folder chip on each card when the current view is not already scoped to that folder.
- Show note-type label under the title for quicker scanning.
- Keep the existing right-pane editor and autosave behavior unchanged.

## Out of scope

- No schema or server-function changes (edit + delete already exist server-side).
- No changes to folder sidebar behavior beyond what's above.
- No changes to other "notes" areas (ticket Hub notes, dispatch summaries).
