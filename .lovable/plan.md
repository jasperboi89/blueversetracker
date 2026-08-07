# Portal improvements: notes, prior fixes, dispatch flow

Three focused upgrades aimed at the three things that eat your night. Everything AI-driven proposes and waits for Apply/Discard — nothing rewrites your work silently.

## 1. Faster notes and summaries

- **Snippet library**: save any phrase, paragraph, or full note skeleton you retype (per note type: work note, retest note, dispatch summary). Insert with a `/` shortcut inside any rich text box or from a small toolbar button.
- **Polish this note** action on Changes Made, Result/Testing and retest notes: AI tightens wording and fixes structure, shown side by side as Apply / Discard. Your original stays until you accept.
- **Recent values**: account, issue category and classification fields remember the last few values you used on that account, so repeat work is two clicks.

## 2. Finding prior fixes

- **"Seen this before" panel** on the ticket work page. As soon as a ticket is pulled, it searches the existing Freshdesk ticket index plus your Knowledge Vault notes and lists the closest past tickets: number, account, subject, what fixed it, and a one-line AI "why this matches".
- Each hit gets **Copy fix** and **Open ticket** buttons, so a matching past resolution becomes your Changes Made draft in one click.
- The same panel appears on the account page, scoped to that account's history.
- Semantic (meaning-based) search is deferred as you asked; this first version uses the full-text ticket index already built, which handles account numbers, field names and error phrasing well.

## 3. Dispatch testing flow

- **Resume banner**: if a dispatch session is left mid-test, the dispatch page shows it at the top with where you stopped, instead of you rediscovering it.
- **Prefill from last dispatch** for the same account: checks, reason flow and summary skeleton carry over as a starting point, all editable.
- **Retest rollup**: retest notes stay clean text, and a "summarize retests" action rolls repeated rounds into one readable block for the final summary.
- **Completion meter** showing exactly which required sections are still empty before you generate the summary, so you never generate a half-filled one.

## Parked until approval

Outlook and OneDrive both need your admin's approval before anything can connect. Once approval lands, mail triage into "Assigned to Me" and OneDrive file attach in the Knowledge Vault are both straightforward additions.

## Technical notes

- Snippets and recent values use the existing persisted-store pattern in `src/lib/settings/`, cloud-synced like other prefs.
- Prior-fix search runs as a new authenticated server function querying `freshdesk_search_documents` (`search_vector`) plus `knowledge_notes`, ranked server-side; the AI "why this matches" line is one cheap call over the top hits only.
- Note polishing and retest summarization reuse `ai.functions.ts` and the Apply/Discard proposal path already built for the Copilot.
- Dispatch resume, prefill and completion meter are frontend work over `dispatch-store.ts`; no schema change.

Suggested order: 2, then 1, then 3.