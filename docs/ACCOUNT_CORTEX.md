# Account Cortex

The per-account operational world model. This doc covers the **engine + data**
side; `ACCOUNT_CORTEX_UI.md` covers the operator surface.

## Lineage

- **Phase 2 (BUILT):** `account-cortex.ts` — a pure, derived-on-read world model
  over the durable ledger aggregate + bounded Account Context Pack facts. Emits
  evidence-shaped signals (severity/confidence/basis). Wired into Copilot context.
- **Phase 3 (BUILT):** persistence + intelligence.
  - `account-intelligence.ts` — `assembleAccountIntel(pack, ledger, now)`
    connects the pure engines (patterns, timeline, what-fixed-this) to the
    canonical pack + ledger. No new data source.
  - `account-cortex-store.ts` — persisted per-account intelligence state:
    `reconcileObservations()` keeps still-firing observations active (preserving
    first-seen/recorded timestamps) and moves disappeared ones into a bounded
    history as resolved. Cross-device via the shared blob store. Schema-versioned
    (`CORTEX_CALC_VERSION`).

## What it persists (Part 11)

Active observations (id, patternType, confidence, severity, **evidence ids**,
first/last observed, recalc horizon) + a bounded resolved/expired history +
`lastEvaluatedAt` + `calcVersion`. It deliberately does **not** persist a giant
AI-generated summary. Canonical facts stay in their canonical stores; this record
only projects and connects.

## Copilot integration

`toCopilotIntel(pack, ledger, plan, now)` produces a **bounded, question-driven**
projection (Part 8) — only the blocks the retrieval plan selected
(patterns / resolutions / timeline / changes). See `copilot-retrieval.ts` and
`OPERATIONAL_EVENT_LEDGER.md`.

## Privacy

References only — ids, labels, confidence classes, counts. Never ticket bodies,
notes, PHI, or model output. Evidence ids point back at canonical records that
enforce their own access.

## FOUNDATION ONLY

- Observations derive from the two pack-supported detectors today.
- Persisted state is not yet re-projected into a scored, longitudinal risk view
  (that is the next Cortex step).

## FUTURE

Scored/decaying world model, predictive risk, anomaly signals, causal evidence
edges (promoted into the Evidence Graph). Not built.
