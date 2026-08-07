# Time editing, faster additional work, vault rework, and a continuous assistant

## 1. Edit time spent on a ticket or dispatch test

Today time is tracked automatically and can't be corrected — if you forget to close a ticket, the entry is wrong forever.

- The timer chip in the header and the floating dock get a click-to-edit control: set hours/minutes/seconds directly, with quick "+15m / -15m / reset" buttons.
- The account page "Time" tab gets per-entry actions: edit duration, edit the label/account it was filed under, add a manual entry ("Add time"), and delete a bad entry.
- Manual and edited entries are marked "adjusted" so the numbers stay honest in reports and the shift summary.

## 2. Easier subject documentation for Additional Work

Creating additional work currently means a blank "Work Title" plus a rich-text "What Needs Done".

- **Subject line builder**: a compact row of common subject starters (Client change, Scripting fix, Email client, Report request, Follow-up, Data correction...) that prefill the title, leaving you to add only the specifics.
- **Recent subjects**: the last subjects you used are one-click reusable, filtered to the account when one is selected.
- **Describe it once**: paste or type the raw request into "What Needs Done" and hit "Suggest subject" — AI proposes a short, consistent title (Apply / Discard, never silent).
- The same subject builder appears in the quick-create path and when converting a night-plan item.

## 3. Knowledge Vault: AI version becomes the note

- When AI organizes a note, the AI version becomes the primary content you read and edit.
- The original is archived as a version entry, not shown beside it. Split View and the "AI Organized" tab go away.
- A small "Versions" button opens a history list (original + each AI pass, timestamped) with **Preview** and **Restore** — restoring pushes the current text into history rather than losing it.
- Existing notes migrate on open: if a note has an AI version, it becomes the body and the old original is filed as version 1.

## 4. Vault improvements

- **Layout**: three panes — folders, note list, editor — with the list collapsible so the editor can breathe; note cards get a 2-line preview, attachment/AI badges, and cleaner spacing.
- **Views**: switch between a comfortable list and a card grid; group by folder, type, or last updated.
- **Faster finding**: search that also matches note body and tags, a tag rail with counts, and filter chips for pinned / favorite / has attachments / archived.
- **Editor**: sticky title and toolbar, word count and reading time, a table-of-contents strip built from headings for long notes, and full-width focus mode.
- **Quality of life**: a quick-capture box at the top of the list that creates a note instantly, keyboard shortcuts (new note, search, save, focus mode), and a subtle "saved" indicator instead of silence.

## 5. Continuity — the portal that stays with you

A persistent presence rather than a chat you have to open.

- **Continuity rail**: a slim always-available strip that knows what you're on right now and surfaces the two or three most useful things — a prior fix that matches, a knowledge note about this account, the unfinished section blocking your summary, the timer you left running.
- **Learning loop**: every completed ticket, dispatch, and note quietly feeds an operator profile — which accounts recur, which fixes you reuse, where you slow down — and that profile sharpens later suggestions.
- **Stuck detection**: if you sit on the same item with no edits for a while, it offers help once, quietly, with a dismiss it remembers.
- **Nightly recap**: at shift end it summarizes what it learned that night (a new recurring issue, an account that keeps coming back) and offers to save it into the Knowledge Vault.
- Everything stays propose-then-apply; nothing rewrites your work on its own.

## Technical notes

- Timer edits: extend `active-work-store.ts` with an elapsed-adjust action and `work-log-store.ts` with edit/add/delete entry actions plus an `adjusted` flag; UI in `InlineWorkTimer`, `ActiveWorkDock`, and the account Time tab.
- Subject builder: new persisted, cloud-synced `subject-presets-store.ts` alongside the snippets store; AI suggestion reuses `aiComplete` via `ai.functions.ts`.
- Vault versions: new `versions jsonb` column on `knowledge_notes` (default `[]`); `aiOrganizeKnowledgeNote` writes the AI text into `content_html` and pushes the prior body into `versions`; `KnowledgeVault.tsx` drops the split/organized tabs.
- Vault layout work is presentation-only inside `KnowledgeVault.tsx` plus a few extracted components (note list, tag rail, versions dialog) to keep that 2,270-line file manageable.
- Continuity rail builds on the existing `awareness.ts` page context, `prior-fixes.functions.ts`, and `aiOperatorProfile`; no new backend service.

Suggested order: 1 and 2 (small, immediate), then 3 and 4, then 5.