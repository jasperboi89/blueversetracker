# Operational Event Ledger & Account Cortex

**Phase 2 — Operational Intelligence Foundation** (updated in Phase 3)
Status: implemented (foundation). Extends canonical systems; introduces no
parallel architecture.

> **Phase 3 update — server-backed ledger + allowlist.** The Phase 2 local
> bounded ledger and its consumer-facing API (`queryLedger`, `aggregateAccount`,
> the local store) are **unchanged and preserved**. Phase 3 adds durability
> BEHIND that API — see **Phase 3: server-backed ledger** near the end of this
> document. The two-layer model is now: transient Event Spine → durable ledger
> (local bounded cache + server-backed table).

This document describes the two foundation pieces added in Phase 2 and the
seams later phases build on:

1. **Durable Operational Event Ledger** (Layer 2 of the two-layer event model)
2. **Account Cortex** (per-account operational world model)

The intended progression is:

```
current operational data
      ↓        (already emitted as AccEvents on the Event Spine)
DURABLE EVENT LEDGER            ← Phase 2
      ↓
ACCOUNT CORTEX                  ← Phase 2 (foundation)
      ↓
evidence-aware intelligence     ← extends Evidence Graph / Reality Boundary
      ↓
contextual Copilot              ← wired: world model flows into Copilot context
      ↓
future pattern / predictive systems
```

---

## 1. Two-layer event model

| Layer | Module | Scope | Lifetime | Cap |
| --- | --- | --- | --- | --- |
| **1. Transient** | `event-spine.ts` | current shift | cleared on shift rollover | 300 events |
| **2. Durable** | `event-ledger.ts` | all shifts | persisted + cloud-synced | 1500 events / 60 days |

Both layers speak the **same** `AccEvent` contract from `events.ts`. The ledger
is a **durable sink on the existing spine**, not a second bus:

- `startEventLedger()` (run once by `EventLedgerWatcher`, mounted in the
  authenticated shell) seeds from the spine's current buffer, then subscribes
  via `eventSpine.subscribe(...)`. Every sanitized event the spine fans out is
  appended to the ledger.
- Nothing emits into the ledger directly. Producers keep emitting to the spine
  exactly as before — **zero changes to the emit path**.

### Persistence

Reuses the app's own primitives — no new table, no migration:

- `createPersistedStore("aih:core:eventledger:v1", …)` → localStorage
  durability per device (SSR-safe).
- `attachCloudSync({ storeKey: "event-ledger", … })` → the shared
  `user_store_blobs` blob for **cross-device** durability.
- Cloud snapshots are **unioned** with local history (`mergeLedgers`, dedupe by
  event id) so switching devices never overwrites events — a ledger must not
  lose history.

### Rotation (bounded)

`rotate()` keeps newest-first, drops entries older than `LEDGER_MAX_AGE_DAYS`
(60), and caps at `LEDGER_MAX_ENTRIES` (1500) so the synced blob stays modest.
Entries with an unparseable timestamp are never silently aged out.

> **Scale note / Phase 3:** blob-sync is fine for a bounded foundation but is
> not an append-log at scale. The clean upgrade is a server-backed append-only
> table behind the same `record()`/`queryLedger()` API — the store is the only
> thing that changes; callers do not. Documented, not built.

### Query & aggregate API (deterministic, bounded)

- `queryLedger({ accountId?, ticketId?, types?, sinceMs?, untilMs?, limit? })`
- `aggregateAccount(entries, accountId, now)` — **pure** rollup: totals, counts
  by type, 7d / prev-7d / 30d windows, active days, touched tickets, first/last
  seen. `getAccountAggregate(accountId)` supplies the live store.

### Privacy

The ledger stores exactly what the spine already sanitized (`sanitizeMetadata`):
ids, labels, statuses, timestamps, small routing metadata. **Never** ticket
bodies, notes, conversations, caller/patient data, prompts, or model output.

---

## 2. Account Cortex

`account-cortex.ts` derives a per-account **world model** from two canonical
inputs — it is **not** a second account-context engine:

- the durable ledger aggregate (temporal signal), and
- a few bounded facts already produced by the **Account Context Pack**
  (`deriveFactsFromPack`: open tickets, verified resolutions, recurring
  pressure, warnings).

`buildAccountWorldModel(input)` is **pure and deterministic** (same inputs →
same output). It emits rule-based, evidence-shaped signals:

| Signal | Source | Meaning |
| --- | --- | --- |
| `activity_trend` | ledger | last-7d vs prior-7d volume (rising = warning) |
| `recency` | ledger | how recently the account was touched |
| `recurring_pressure` | account context | recurring issues active |
| `open_load` | account context | open tickets on the account |
| `resolution_coverage` | account context | verified reusable fixes on file |
| `cold_account` | ledger | on record but no events yet |

Each signal carries a `severity`, a `confidence` (scaled by ledger volume), and
a `basis` (provenance). This matches the Evidence Graph / Reality Boundary
vocabulary **without duplicating** those systems — later phases can promote
signals into the Evidence Graph and add anomaly/predictive/causal signals here.

### Service & Copilot wiring

- `account-cortex-service.ts`:
  - `getAccountWorldModel(accountId)` — fetches the (cached) pack + ledger
    aggregate; returns a ledger-only model if the pack fetch fails (fail-soft).
  - `worldModelFromPack(pack)` — synchronous, for callers that already hold a
    pack (avoids a re-fetch).
- `toCopilotWorldModel(model)` — a **bounded** (~700 char), provenance-tagged
  projection.
- **Copilot integration:** `CopilotSheet.buildFocusSnapshot()` appends an
  `ACCOUNT WORLD MODEL` block after the existing `ACCOUNT CONTEXT` block, for
  whichever account the shift is on. Same single account-context path, extended.
  Fully fail-soft; never blocks the prompt; only appears for a real active
  account (no fabricated context — preserves the Phase 1 Copilot behavior).

---

## Extension points for later phases

- **Anomaly / predictive risk:** add signal kinds in `buildAccountWorldModel`
  fed by richer ledger aggregates (`countsByType`, windows) — no new store.
- **Causal edges:** correlate ledger events (fix → outcome) and promote into the
  Evidence Graph.
- **Script/dependency intelligence, simulation, agentic workflows:** consume
  `queryLedger` / `aggregateAccount`; they read the durable history rather than
  standing up a parallel event store.
- **Durable server-backed ledger:** swap the persistence backend behind the same
  API (Phase 3).

All of these extend the modules above; none replace them.

---

## Phase 3: server-backed ledger + durable-event allowlist

**BUILT NOW.** The Phase 2 API is untouched; durability is added behind it.

### Durable-event allowlist (Part 2) — `ledger-events.ts`

Not every spine event is persisted. `isDurableEvent(type)` is the single source
of truth for what belongs in the durable ledger, plus a coarse `category`
(account/ticket/work/resolution/programming/ai/intelligence/system) and
`sensitivity` (reference/operational/sensitive). Noisy view/navigation/timer/
night-plan/curator events are intentionally transient. Spec categories with no
current event (account config change, explicit escalation/reopen, AI
accept/reject decisions, integration health) are listed as
`FUTURE_DURABLE_CATEGORIES` — declared, not faked.

### Server table (Part 1 & 14) — `supabase/migrations/…_operational_event_ledger.sql`

`operational_event_ledger` is **append-only** (grant is `select, insert` only —
no update/delete — and there is no update/delete RLS policy), **per-operator**
(RLS `auth.uid() = operator_user_id`), **idempotent** (`unique(operator_user_id,
event_id)`), and **independently queryable** on account / ticket / work item /
type / category / time (each a first-class indexed column). Event-specific
detail is a small sanitized `metadata` JSONB — never bodies/PHI/secrets. Schema
is versioned (`schema_version`, `LEDGER_SCHEMA_VERSION`).

> **Not applied in this environment.** The migration ships in this change but is
> not run here (the private registry is blocked, so there is no build/deploy).
> Because the generated Supabase `Database` type does not yet include the table,
> `ledger.functions.ts` accesses the query builder through a localized `as any`
> (as `blob-sync.ts` already does) until types are regenerated post-deploy.

### Server functions — `ledger.functions.ts`

`appendLedgerEvents` (idempotent batch upsert) and `queryLedgerEvents` (bounded,
per-operator, filtered). Auth via `requireActiveAuthorizedUser`.

### Wiring behind the Phase 2 API — `event-ledger.ts`

`startEventLedger()` now also: pushes durable, allowlisted events to the server
(debounced best-effort queue, `enqueueServer`), and backfills the local cache
from server history once on start (`hydrateFromServer`, unioned via
`mergeLedgers`). **Every server call is best-effort** — on failure it logs and
leaves the bounded local ledger as the working source. A ledger outage never
disturbs ordinary operation; the local cache provides recent context.

```
Event Spine → ledger subscriber → local bounded cache  (always)
                               ↘ server ledger          (best-effort)
```

### FOUNDATION / FUTURE

Retention/cleanup jobs, a server-side query RPC with richer correlation, and a
cross-device server-authoritative merge are later refinements. The local cache
+ blob sync remain the fallback.

