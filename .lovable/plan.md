
## Freshdesk Intelligence Search

A new read-only sidebar tab that searches Freshdesk live, AI-summarizes the best matches, and lets a result be added to the Night Plan. Tickets stay where they already live (localStorage + cloud blob sync); no ticket mirror table is added.

### Scope confirmed
- Search scope: live Freshdesk API on demand.
- Semantic: keyword/filter pre-pass on Freshdesk, then Lovable AI (Gemini) re-ranks and summarizes — no embeddings.
- Full conversations: pulled lazily only when a result is opened in Intelligence Search; full pagination of `/conversations`.
- Read-only. No writes to Freshdesk. No new secrets (reuses existing `FRESHDESK_DOMAIN` + `FRESHDESK_API_KEY` + `LOVABLE_API_KEY`).

### What exists today (audit)
- `src/lib/api/freshdesk.functions.ts` — server fns `freshdeskTestConnection`, `freshdeskPullTicket`, `freshdeskSyncTicket`. They call `/api/v2/tickets/{id}?include=requester,company,stats` plus a single un-paginated `/conversations` fetch. Normalized ticket fields are good (subject, description, status, priority, requester, company, type, tags via `detectAccount`, dueAt, custom_fields read for account number) but `groupName`, `agentName`, `tags`, and full custom_fields are not surfaced.
- `src/lib/tickets-store.ts` — localStorage store of opened tickets with notes/attachments, synced via blob-sync. There is no Supabase ticket table.
- `src/components/freshdesk/*` — lookup card, active sections, ticket workspace, preview drawer.
- `src/components/layout/AppSidebar.tsx` — sidebar nav (where the new tab is added).
- `src/lib/night-plan-store.ts` — "Add to Night Plan" target.

### New files
- `src/lib/api/freshdesk-search.functions.ts` — three server fns:
  1. `freshdeskSearch({ query, filters })` — runs Freshdesk filter API (`/api/v2/search/tickets?query=...`) with a query built from filters + extracted keywords, paginates up to N pages, normalizes a lightweight result list (no conversations).
  2. `freshdeskPullFullConversations({ ticketId })` — paginates `/api/v2/tickets/{id}/conversations?page=1..` until empty, returns normalized notes + attachments. Used on-demand from the result card "Open" action and from Sync Check.
  3. `freshdeskIntelligenceRank({ query, filters, candidates })` — calls Lovable AI Gateway (`google/gemini-3-flash-preview`) with `Output.array` of `{ ticketNumber, matchReason, issue, latestUpdate, suggestedAction, owner?, signal: "stale"|"urgent"|"duplicate"|"ready-to-close"|"needs-review", confidence: 0-1, snippet }`. Strict system prompt: no invention, evidence snippet must come from supplied text. Receives at most ~20 candidates (truncated subject+description+latest note bodies).
  4. `freshdeskSyncCheck({ number })` — pulls ticket + full conversations, returns a debug payload (counts, latest conversation date, errors, "fully indexed for AI search" boolean).
- `src/routes/_authenticated/freshdesk-intelligence.tsx` — new route. Renders search bar, filter row, results list, debug panel toggle.
- `src/components/freshdesk-intel/SearchBar.tsx` — natural-language input + Search button + Scanning Freshdesk… loader.
- `src/components/freshdesk-intel/FilterRow.tsx` — chips/inputs: account number, status (multi), priority, group, agent, date range, include closed.
- `src/components/freshdesk-intel/ResultCard.tsx` — fields per request (number, account, subject, status, priority, group, agent, last updated, match reason, snippet, AI summary, suggested action, confidence pill, signal badge, **Open in Freshdesk**, **Add to Night Plan**). "Open" first triggers `freshdeskPullFullConversations` if not yet pulled.
- `src/components/freshdesk-intel/SyncCheckPanel.tsx` — admin/debug panel: ticket number input → calls `freshdeskSyncCheck`, shows checklist (description pulled, conversations pulled, count, latest date, last sync time, errors, fully-indexed).
- `src/components/freshdesk-intel/EmptyStates.tsx` — empty/error/loading visuals matching BlueVerse glass style.

### Modified files
- `src/lib/api/freshdesk.functions.ts` — extend `NormalizedTicket` (and `freshdeskPullTicket`/`freshdeskSyncTicket`) to also pull `groupName`, `agentName` (via `/groups/{id}` + `/agents/{id}` when ids present, cached per request), full `tags`, and `custom_fields`. Replace the single `/conversations` call with a paginated helper shared with the new module so opening a ticket from anywhere gets the full thread. Add `searchable_text` builder (pure function) that concatenates the requested fields including note body texts.
- `src/lib/api/freshdesk.types.ts` — add `groupName`, `agentName`, `tags`, `customFields`, `searchableText` to `NormalizedTicket`.
- `src/components/layout/AppSidebar.tsx` — add "Freshdesk Intelligence" nav item under the existing Freshdesk Tickets entry.
- `src/routeTree.gen.ts` — auto-updated by the router plugin once the route file exists.
- `src/components/settings/` — add a small note (single line) in the existing Freshdesk settings section: "Ticket data may include sensitive information. Only process through company-approved AI tools."

### Search behavior detail
1. UI sends `{ query, filters }` to `freshdeskSearch`.
2. Server builds a Freshdesk filter query: ticket-number / account-number / phone regex matches go in as exact `query="..."` clauses; free-text becomes `subject:'x' OR description:'x'`; filters add `status:`, `priority:`, `group_id:`, `agent_id:`, `updated_at:>...`. Closed tickets only included when toggle on.
3. Up to ~3 pages (30 results) normalized and returned with a small `excerpt` per ticket (subject + first 400 chars of description).
4. UI then calls `freshdeskIntelligenceRank` with the candidates + original NL query. AI returns structured array; UI joins by `ticketNumber` and renders cards sorted by AI confidence.
5. If `LOVABLE_API_KEY` is missing or AI errors out, results render with keyword highlights only (graceful degrade) and a small "AI summaries unavailable" notice.

### Add-to-Night-Plan
Reuses existing `nightPlanStore.add(...)` shape. The card's button creates a task like: `FD #{number} — {subject}` with notes including AI suggestedAction + link to Freshdesk; priority defaults to AI signal (urgent → must, otherwise normal).

### Safety / permissions
- All Freshdesk calls remain in server functions (creds via `process.env`). No client ever sees the API key.
- No POST/PUT/DELETE to Freshdesk anywhere in this module.
- `freshdeskIntelligenceRank` system prompt forbids invented details and requires the model to quote evidence snippets from supplied text only.

### Out of scope (explicit)
- No Supabase ticket mirror, no embeddings/pgvector, no background full sync.
- No edits to existing Freshdesk pull/sync behavior beyond pagination + extra fields listed above.
- No changes to other tabs' UI besides the new sidebar entry and the one-line settings note.
