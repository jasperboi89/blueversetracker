## Goal

When a ticket is pulled from Freshdesk, auto-fill the **Ticket Issue** field with only the **Request** and **Background Info** sections from the ticket description — not the full noisy HTML body. If neither section is found, leave the field empty.

## Where

Single change point: `src/lib/tickets-store.ts`, in the block that seeds `issueText` after a pull (currently around line 884-889, using `input.description ?? input.notes[0]?.body`).

## Parser

Add a small helper `extractRequestAndBackground(html: string): string` in `src/lib/tickets-store.ts` (or a new `src/lib/api/freshdesk-issue-parse.ts` if cleaner):

1. Strip HTML to text while preserving line breaks: replace `<br>`, `</p>`, `</div>`, `</li>` with `\n`; drop other tags; decode entities (`&nbsp;`, `&amp;`, `&lt;`, `&gt;`, `&#39;`, `&quot;`).
2. Scan the plain text for headers matching (case-insensitive, tolerating trailing `:` and whitespace):
   - `Request`
   - `Background Info` / `Background Information` / `Background`
3. For each matched header, capture the text from the end of the header line up to the next known header (from a broader stop-list: `Request`, `Background`, `Steps to Reproduce`, `Expected`, `Actual`, `Impact`, `Priority`, `Environment`, `Attachments`, `Notes`, `Additional Info`, `Contact`, `Account`) or end of text.
4. Trim each captured block; collapse 3+ blank lines to 2.
5. Return formatted output:
   ```
   Request:
   <request text>

   Background Info:
   <background text>
   ```
   Include only the sections that were found and non-empty. Return `""` if neither is found.

## Seeding logic change

Replace the current seed:

```ts
const seedIssue = (input.description ?? input.notes[0]?.body ?? "").trim();
```

with:

```ts
const seedIssue = extractRequestAndBackground(input.description ?? "");
```

Drop the fallback to `notes[0]?.body` and to the full description — per user, leave empty when parsing finds nothing.

## Non-goals

- No UI changes.
- No changes to server functions or Freshdesk fetch.
- No changes to existing pulled tickets (only affects new pulls). Re-pull/refresh still overwrites nothing (existing behavior around `syncFromFreshdesk` untouched).

## Verification

- Typecheck.
- Manually pull a ticket in preview and confirm Ticket Issue shows only the two parsed sections.
