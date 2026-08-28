# Operational Intelligence Evolution

**Account Command Center → Operational Intelligence Platform**
Status: architecture-direction document. Maps the systems that **already exist**
to the capabilities we intend to build. The governing rule: **extend the
canonical systems below — do not create parallel abstractions** ("Event Spine
2", "New Memory Service", "AgentFramework"). Each row names what exists today,
what it must become, and the seam that gets us there.

---

## Guiding principles (unchanged by this document)

1. **AI is an intelligence layer, not a dependency.** The portal must remain
   fully functional with AI services unavailable. Every AI feature degrades
   gracefully; deterministic rules produce the baseline.
2. **Evidence-first, human-governed.** Everything the model asserts carries
   source, confidence, freshness, and supersession. The Reality Boundary — not a
   model — decides truth semantics.
3. **Autonomy is a progression, never a default.** Observe → Explain →
   Recommend → Prepare → **Human Approval** → Execute → Verify → Audit.
   High-risk production changes never become casually autonomous.
4. **Privacy by construction.** Projections carry IDs, labels, statuses, and
   short bounded summaries — never ticket bodies, conversations, caller data,
   note bodies, prompts, or model output. Possible PHI stays out of the AI path.

---

## Current system → future evolution

### Event Spine → transient event nervous system **+** future durable ledger
- **Today:** `src/lib/core/event-spine.ts` — a small, shift-scoped, persisted
  **buffer** (`MAX_EVENTS = 300`) used as current-shift coordination context. It
  is deliberately lightweight.
- **Evolution:** keep the Spine as the **fast transient layer**. Add, as a
  *separate* durable layer, an **Operational Event Ledger**: long-term,
  auditable events for historical learning, correlation, analytics, and
  predictive intelligence.
- **Seam / non-goal:** do **not** mutate the Spine into a database-backed event
  store. The clean path is an append-only sink behind the existing `events.ts`
  emit path (a subscriber that persists sanitized events), so the Spine's shape
  is unchanged and the ledger consumes the same event contract.
- **Status:** transient layer exists; durable ledger **BUILT in Phase 2** —
  `event-ledger.ts` is a durable sink on `eventSpine.subscribe`, persisted +
  cloud-synced, bounded, with query/aggregate APIs. A server-backed append-only
  table (for scale) is the remaining Phase 3 upgrade behind the same API. See
  `docs/OPERATIONAL_EVENT_LEDGER.md`.

### Memory Cortex → temporal operational memory
- **Today:** `src/lib/memory/*` — `experience-compiler`, `memory-runtime`,
  `memory-store`, `memory-retrieval`, `memory-contract`. Memory is compiled when
  work completes or a change is verified.
- **Evolution:** add temporal validity + decay to memories, and correlate them
  across shifts/accounts. Feed the durable ledger into compilation for
  longitudinal patterns.
- **Seam:** extend `memory-contract` with temporal fields; keep the runtime.
- **Status:** compilation + retrieval exist; temporal/longitudinal **to build**.
- *Phase-1 note:* handoff-triggered compilation wording was removed; compilation
  on completion/verification is unchanged.

### Account Context → Account Cortex / world model
- **Today:** `account-context.ts` (+ `-service`, `-projection`) assembles a
  bounded, provenance-tagged **Account Context Pack** from authoritative stores;
  each source is isolated and fail-soft.
- **Evolution:** persist a per-account **world model** — a durable, evolving
  view with risk scoring, anomaly flags, and recurring-pattern learning surfaced
  on the account detail route.
- **Seam:** the ports interface (`AccountContextPorts`) already isolates
  sources. Phase 2 added Account Cortex as a *consumer* of the pack + ledger, not
  a fork of the pack.
- **Status:** pack assembly exists; **Account Cortex foundation BUILT in
  Phase 2** — `account-cortex.ts` derives a deterministic, evidence-shaped
  per-account world model from the durable ledger aggregate + bounded pack facts,
  wired into Copilot context. A *persistent* world model (accumulated/scored over
  time) and risk/anomaly signals are the remaining build. See
  `docs/OPERATIONAL_EVENT_LEDGER.md`.
- *Phase-1 note:* the Coverage Watch port is severed (returns empty) and its
  projection surfacing removed; the pack shape is otherwise intact.

### Resolution Memory → Operational Learning
- **Today:** `src/lib/resolution/*` — verified resolutions ranked per account,
  surfaced as "known fixes".
- **Evolution:** institutional operational learning — causal pattern learning
  ("what fix worked for which failure signature"), confidence that strengthens
  with corroboration.
- **Seam:** feed resolution outcomes into the durable ledger; rank with
  longitudinal evidence rather than recency alone.
- **Status:** ranked known-fixes exist; causal learning **to build**.

### AI Router → model / provider / capability router
- **Today:** `src/lib/ai/router/*` — task-typed routing (`task-types`,
  `routing-policy`, `deterministic-intercept`) selects a tier and can answer
  deterministically without a model.
- **Evolution:** true model-independent routing across local / private / cloud
  providers with capability-based selection and full provider/model
  traceability.
- **Seam:** `routing-policy` already keys on task type + tier; add a provider
  abstraction behind `ai-client.server` and record the served model.
- **Status:** task routing + deterministic intercept exist; multi-provider
  selection **partially** (tiers) — provider abstraction **to build**.
- ⚠️ **Tech debt (Phase 1):** `handoff_generation` is now a **generic internal
  summary** task type used by all shift-recap/briefing summarization. The Shift
  Handoff feature was removed but the routing label was intentionally kept to
  avoid breaking unrelated summarization. Rename to `summary_generation` in a
  later phase (touch: `task-types.ts`, `routing-policy.ts`,
  `capability-resolver.ts`, `capability-registry.ts`, `ai.functions.ts`,
  `api/copilot.ts`).

### Capability Registry → governed autonomy layer
- **Today:** `src/lib/capability/*` — a rich registry with permissions
  (`capability-permissions`), health, invocation, projection, and a
  tool-adapter. Capabilities gate what the AI/tools may do.
- **Evolution:** the substrate for the **autonomy progression**. Each capability
  declares its max autonomy level; production-risk capabilities require human
  approval and log to the Action Ledger.
- **Seam:** add an autonomy-level field to `capability-contract`; the executor
  enforces Prepare → Approve → Execute → Verify.
- **Status:** governed capabilities + permissions exist; autonomy levels
  **to build**.

### Evidence Graph → provenance / confidence / causal evidence
- **Today:** `evidence-graph.ts` + `reality-boundary.ts` + `evidence-contract` —
  an **index** of truth semantics over facts projected from authoritative
  records (never a second copy). The Reality Boundary decides freshness,
  promotion/demotion, and labelling deterministically. Contradictions are
  surfaced, never auto-resolved.
- **Evolution:** add causal edges (fix → outcome) and temporal reasoning so the
  graph supports predictive risk and anomaly detection.
- **Seam:** extend `EvidenceEdge` with causal/temporal edge types; keep the
  boundary as the sole truth arbiter.
- **Status:** provenance/confidence/supersession exist; causal/temporal
  **to build**.

### MCP → external / agent tool interface
- **Today:** `src/lib/mcp/*` with `tools/` (`get-night-plan`, `list-accounts`,
  `list-tickets`, `list-dispatches`, `whoami`) and a Supabase-backed invoke
  route. Read-only, bounded tools.
- **Evolution:** expose governed capabilities as MCP tools so external agents
  operate through the **same** permission + audit path as in-portal AI. Writes
  only via the governed executor.
- **Seam:** bridge `capability-tool-adapter` → MCP tool definitions; never let
  MCP bypass the capability permission checks.
- **Status:** read tools exist; governed write tools **to build**.

### Next Best Action → predictive work orchestration
- **Today:** `src/lib/nba/*` — deterministic candidate generation, gating,
  ranking, serialization; surfaced on the Command Center.
- **Evolution:** predictive orchestration that weighs risk, deadlines, and
  learned outcomes; anticipates work before it is queued.
- **Seam:** NBA `candidates` + `ranking` already pluggable; add a predictive
  ranker fed by the ledger + world model.
- **Status:** deterministic NBA exists; predictive layer **to build**.

### Copilot → contextual intelligence orchestrator
- **Today:** `CommandPalette`, `CopilotSheet`, `CopilotLauncher`, portal context
  (`portal-context-service`, `use-portal-context`), context serialization, and
  awareness. Phase 1 added a **native header entry point** that reflects live
  page/account/ticket context, and a **command-registry extension seam**
  (`src/lib/command/command-registry.ts`) for future natural-language commands.
- **Evolution:** a persistent intelligence layer that orchestrates evidence,
  memory, NBA, and governed actions — one Copilot, context-aware everywhere, not
  a second chatbot.
- **Seam:** register command providers against the new registry; keep the
  architecture brand-neutral/configurable (the "Intel Copilot" name is
  presentational only).
- **Status:** context-aware Copilot + palette + seam exist; NL command providers
  and action orchestration **to build**.

---

## Two-layer event architecture (Part 10, expanded)

| Layer | Exists? | Role | Do NOT |
| --- | --- | --- | --- |
| **1. Fast transient event context** | ✅ `event-spine.ts` | Current-shift coordination buffer (bounded, persisted per shift). | Grow it into a database. |
| **2. Durable operational event ledger** | ✅ `event-ledger.ts` (Phase 2) | Long-term, auditable events for learning, correlation, analytics, prediction. Bounded local + cloud blob; server-backed table is Phase 3. | Reuse the Spine's store; it is a separate sink on the same bus. |

The migration path was additive and is now in place: both layers consume the
**same** `events.ts` contract. The Spine keeps buffering; the ledger subscribes
via `eventSpine.subscribe` and persists sanitized events durably. No change to
emitters. Phase 3 swaps the ledger's persistence backend for a server-backed
append-only table behind the same `record()`/`queryLedger()` API.

---

## What exists vs. what must be built

**Already exists (extend, don't rebuild):** Event Spine (transient) **+ durable
Event Ledger (Phase 2)**, Memory Cortex (compile + retrieve), Account Context
Pack **+ Account Cortex world model (Phase 2)**, Resolution Memory (ranked
known-fixes), AI Router (task routing + deterministic intercept + tiers),
Capability Registry (permissions/health/invocation), Evidence Graph + Reality
Boundary (provenance/confidence/freshness/supersession), MCP (read tools), NBA
(deterministic), Copilot (context-aware, now fed the world model) + Command
Palette + command-registry seam, Action Ledger + Safe Action Executor.

**Must eventually be built:** server-backed durable ledger (scale); *persistent*
Account world models (accumulated/scored over time); temporal/longitudinal
memory; causal + temporal evidence edges; predictive risk + anomaly detection;
autonomy levels on capabilities + approval workflow; multi-provider
(local/private/cloud) routing with traceability; governed MCP write tools; NL
command providers; predictive NBA; operational digital twin & simulation.

---

## Phase 2 — delivered (Operational Intelligence Foundation)

1. ✅ **Durable Operational Event Ledger (Layer 2)** — `event-ledger.ts`,
   consuming `events.ts` via `eventSpine.subscribe`; bounded, persisted +
   cloud-synced; query/aggregate APIs. See `docs/OPERATIONAL_EVENT_LEDGER.md`.
2. ✅ **Account Cortex foundation** — `account-cortex.ts` world model over the
   ledger aggregate + bounded pack facts, evidence-shaped signals.
3. ✅ **Contextual Copilot wiring** — the world model flows into Copilot account
   context through the existing single account-context path.

## Recommended Phase 3 (candidate)

1. **Server-backed durable ledger** behind the same `record()`/`queryLedger()`
   API (scale beyond the local blob cap).
2. **Persistent, scored Account world model** surfaced on the account detail
   route (Account Cortex UI) with the first risk/anomaly signals.
3. **Autonomy levels** on `capability-contract` + the executor's
   Prepare → Approve → Execute → Verify path; expose in Settings + Audit Log.
4. **Provider abstraction** in `ai-client.server` + record served model/provider
   on every completion (traceability groundwork).
5. **Rename `handoff_generation` → `summary_generation`** and retire the dormant
   Shift Handoff / Coverage Watch code + tables once the rollback window closes.
6. Resolve `/constellations` (surface for Quantum Bloom, or retire).

---

## Phase 3 — delivered (Account Intelligence & Operational Radar)

Extends the canonical systems; no parallel architecture introduced.

1. ✅ **Server-backed Operational Event Ledger foundation** — durable-event
   allowlist (`ledger-events.ts`), append-only per-operator table (migration),
   `ledger.functions.ts`, wired behind the Phase 2 ledger API with best-effort
   fallback. See `OPERATIONAL_EVENT_LEDGER.md`.
2. ✅ **Pattern Intelligence** (`pattern-intelligence.ts`) — conservative,
   deterministic, non-causal. See `PATTERN_INTELLIGENCE.md`.
3. ✅ **Account Cortex UI** + **Intelligence Timeline** + **What Fixed This
   Before?** + **Claim Inspector** — `components/intelligence/*`, on the Account
   page. See `ACCOUNT_CORTEX_UI.md`, `ACCOUNT_CORTEX.md`.
4. ✅ **Operational Radar** — Command Center band, bounded + grounded. See
   `OPERATIONAL_RADAR.md`.
5. ✅ **Contextual Copilot retrieval** (`copilot-retrieval.ts`) — question-driven
   block selection, not prompt-growth. Wired into `CopilotSheet`.
6. ✅ **Intelligence feedback** (`intelligence-feedback.ts`) — recorded as durable
   events; suppresses radar/patterns. No auto-retraining.
7. ✅ **Persisted world-model state** (`account-cortex-store.ts`) — active
   observations + history; not a giant AI summary.
8. ✅ **Autonomy contract** — `capability-contract.ts` gains an autonomy level +
   `capabilityAutonomy()` + `isWithinPhase3AiAutonomy()`. AI stays at
   observe/explain/recommend/prepare.
9. ✅ **AI traceability foundation** (`ai-trace.ts`) — bounded recorder +
   operator redaction; one call wired in Copilot. Provider/model/token metadata
   from the server AI client is the documented follow-up.

### Recommended Phase 4

Predictive risk + anomaly detection (on the ledger aggregates); causal evidence
edges promoted into the Evidence Graph; scored/decaying Account world model with
a Cortex risk view; provider abstraction in `ai-client.server` with full
model/token/cost trace; governed MCP write tools at PREPARE autonomy; script /
dependency intelligence. Non-goals from Phase 3 stay non-goals until explicitly
scoped.
