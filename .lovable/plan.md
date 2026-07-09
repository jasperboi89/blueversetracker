## Goal

Improve the readability of the auto-filled **Ticket Issue** field after a Freshdesk pull by giving the parsed **Request** and **Background Info** sections cleaner, more evenly spaced formatting.

## Where

Single change: `extractRequestAndBackground()` in `src/lib/tickets-store.ts` (the helper added in the previous turn). No UI or store-shape changes.

## Formatting rules

Update the helper's text normalization and final output:

1. **Inside each captured section**
   - Trim leading/trailing whitespace.
   - Collapse runs of spaces/tabs to a single space per line.
   - Collapse 2+ blank lines to exactly one blank line (paragraph break).
   - Preserve list-like lines: if a line starts with `-`, `*`, `•`, or `N.`/`N)`, keep it on its own line.

2. **Section headers**
   - Render as uppercase labels with an underline of dashes for visual weight, e.g.
     ```
     REQUEST
     ───────
     <body>
     ```
   - Use a Unicode rule (`─` repeated to header length) so it renders as a clean line in the textarea.

3. **Between sections**
   - Exactly two blank lines between `Request` and `Background Info` blocks.

4. **Final output shape** (when both present):
   ```
   REQUEST
   ───────
   <request body, paragraphs separated by one blank line>


   BACKGROUND INFO
   ───────────────
   <background body>
   ```
   Only include sections that were found and non-empty. Return `""` if neither is found (unchanged behavior).

## Non-goals

- No changes to the parser's header detection or stop-list.
- No changes to seeding logic or fallback behavior.
- No UI/CSS changes to the Ticket Issue textarea.
- Existing tickets are not re-formatted — only new pulls.

## Verification

- Typecheck.
- Pull a ticket in preview and confirm the Ticket Issue box shows the two sections with clear headers, single blank lines between paragraphs, and two blank lines between sections.
