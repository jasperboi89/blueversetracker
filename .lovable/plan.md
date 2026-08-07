# Fix the "Invalid datetime" popup in the Knowledge Vault

## What's happening

Opening the vault now auto-upgrades older notes (the AI copy becomes the note, the original moves into Versions) and saves them. That save sends the note's existing "AI generated at" timestamp straight back to the server, and the server's validation rule only accepts one exact timestamp spelling. The database returns a slightly different spelling (a `+00:00` timezone offset instead of a `Z`), so the save is rejected and the red `Invalid datetime` toast appears. Nothing is damaged — the upgrade just can't finish, which is why the editor also shows "Unsaved changes".

## The fix

1. Accept both timestamp spellings when saving a note, and store one normalized value.
2. Apply the same leniency to the timestamps on archived versions, so restoring or archiving can't hit the same wall.
3. Re-open the vault and confirm the popup is gone, the older note shows the AI text as its body, and Versions holds the original.

## Technical notes

- `src/lib/knowledge/knowledge.functions.ts`: replace `aiGeneratedAt: z.string().datetime()` with a lenient parse-and-normalize transform (`new Date(v).toISOString()`), and do the same for `createdAt` in the version schema.
- No database migration and no UI changes required.