# AI upgrades for the Hub

Here's what I found and what I'd recommend, in priority order. Approve all of it, or tell me which items to keep.

## What exists today
- One shared AI call path (`aiComplete`) hitting the gateway with a single Gemini Flash preview model — no streaming, no tools, no conversation memory.
- Nine one-shot AI actions: ticket summarize, draft note, classify, ticket-issue parse, copilot Q&A, shift summary, focus, account intel, knowledge-note organize.
- Copilot answers from a truncated 7.5k-character text snapshot of local stores, one question at a time, no follow-ups.
- A deterministic rule-based awareness layer feeding insights and toasts.

## Recommended improvements

### 1. Modernize the model layer (foundation)
Move the shared AI call onto the current default model via the gateway Responses API, with a small per-task model map: a fast, cheap model for classify, parse, and organize; the flagship for copilot, focus, and account intel. Add streaming so long answers appear as they generate instead of after a pause.

### 2. Make the Copilot a real conversation with tools
Today it's one question, one canned snapshot, no memory. Change it to:
- Multi-turn chat with history in the sheet, so "what about that account?" works.
- Streaming answers rendered as markdown.
- Tool calling instead of a text dump: read-only tools for search tickets, ticket detail, accounts, account history, night plan, work-time logs, and recurring issues. It then pulls exactly what it needs and can answer about any ticket, not just the first 40.
- Show which tools it used, so answers are auditable.
- Optional: safe actions on confirmation — add a night plan item, set a ticket classification, start a timer.

### 3. Proactive AI briefings
- Shift-start briefing: one generated paragraph on open, from overdue tickets, waiting items, rolled-over night plan, and last shift's completions.
- Shift-end handoff: a copy-ready handoff note for the next operator, from the same data plus the work-time log.
- Weekly pattern digest: recurring issue clusters across accounts, phrased as "this account keeps hitting X."

### 4. Semantic search over your own data
There's already a Freshdesk search index. Extend it with embeddings so Freshdesk Intelligence and the Knowledge Vault support meaning-based search ("that DST scheduling bug") instead of keyword-only, plus "similar past tickets" on an open ticket — the highest-leverage time saver on repeat issues.

### 5. Knowledge Vault assist
- Auto-suggest tags, folder, and title on save.
- "Turn this ticket into a knowledge note" from a completed ticket.
- Ask-your-vault Q&A with citations back to specific notes.

### 6. Efficiency and cost hygiene
- Cache AI results by content fingerprint (the vault already has one) so re-opening a ticket doesn't re-bill.
- Debounce and deduplicate background calls; add a per-user daily AI call ceiling visible in Settings.
- Better failure states: keep the rate-limit and credit messages, but add an inline retry instead of only a toast.

## Technical notes
- New shared provider helper in `src/lib/ai/ai-client.server.ts` with a streaming variant alongside the existing buffered one, and per-task model constants in one place.
- Copilot chat moves to a streaming server route (`src/routes/api/chat.ts`) using the AI SDK with `useChat` in `CopilotSheet.tsx`; tools defined server-side against the existing stores and database reads, scoped to the signed-in user.
- Copilot history persists per user in the existing cloud blob-sync layer (no new tables) unless you want cross-device threads, which would need a table.
- Semantic search needs a vector column on the existing Freshdesk documents table plus an embedding backfill job.
- Everything stays behind the existing AI kill-switch and Audit Log recording.

## Suggested first slice
Items 1 and 2 — model modernization plus a tool-using streaming Copilot — give the biggest visible jump. I can scope that as the first build.