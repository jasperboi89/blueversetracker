# Making the Copilot immersive, aware, and continuous

Right now the AI is strong but *episodic*: you ask, it answers, it forgets. Three things are missing for the feel you're describing — live streaming, persistent memory, and the ability to act. Here's what I'd build, in order.

## 1. Streaming everywhere (immersive)
Answers and briefings currently appear all at once after a pause. Switch the Copilot and briefings to token streaming so text types out live, with the tool steps showing as they happen ("searching tickets… reading account 4821…") instead of a spinner. Biggest perceived-quality jump for the least risk.

## 2. Persistent Copilot memory (continuous)
- Chat history survives closing the sheet, reloading, and switching devices (stored per user in the existing cloud sync layer).
- A small rolling "operator profile" the Copilot maintains itself: accounts you touch most, recurring issue types, your shift rhythm, how you like notes written. It gets injected into every AI call so answers stop being generic.
- Named threads, so you can keep a thread per problem instead of one endless chat.

## 3. Copilot can act, not just answer (interactive)
Add write tools behind a confirm step: add/complete a night plan item, set a ticket classification, start or stop a work timer, draft a Freshdesk note into the ticket, create a Knowledge Vault note. Every action shows an inline "Apply / Discard" card before anything changes, and every applied action lands in the Audit Log.

## 4. Ambient awareness (aware)
- Upgrade the current rule-based insight layer with a periodic, cheap AI pass that watches for things rules can't see: an account trending badly, a ticket you opened three times without progress, a night-plan item quietly slipping.
- Contextual Copilot: when you're on a ticket, dispatch, or account page, the Copilot already knows what you're looking at and suggestions change to match.
- A one-line "ambient status" in the header that updates through the shift ("2 overdue, account 4821 hit its third DST ticket this week").

## 5. Voice and hands-free (optional, high wow)
Push-to-talk question, spoken answers. Genuinely useful mid-shift when your hands are in another system. Say the word and I'll scope it.

## 6. Semantic search over your own data
Embeddings on the Freshdesk index and Knowledge Vault so you can search by meaning ("that DST scheduling bug") and get "similar past tickets" on any open ticket. Highest time-saver on repeat issues.

## 7. Cost and reliability hygiene
Cache results by content fingerprint so re-opening a ticket doesn't re-bill, deduplicate background calls, inline retry on failures instead of a toast, and a visible daily AI-call ceiling in Settings.

## Technical notes
- Streaming: a TanStack server route (`src/routes/api/chat.ts`) with the AI SDK and `useChat`, replacing the buffered `aiCopilotChat` call in `CopilotSheet.tsx`; the existing Responses-API tool loop moves behind it. Briefings stream through the same route with a preset kind.
- Memory: thread + message records in the existing cloud blob-sync layer (no new tables) unless you want cross-device search, which needs one table. The operator profile is a small JSON blob refreshed on a schedule.
- Write tools: same tool registry as `copilot-tools.server.ts`, flagged `needsApproval`, executed only after the UI confirms; all routed through the existing audit recording.
- Ambient pass: debounced background call on the cheap model tier, feeding the existing `awareness.ts` insight list so toasts and the launcher dot keep working unchanged.
- Everything stays behind the AI kill-switch in Settings.

## Suggested first slice
Items 1–3: streaming + persistent memory + confirmable actions. That's the jump from "AI feature" to "assistant that's actually with you on shift."
