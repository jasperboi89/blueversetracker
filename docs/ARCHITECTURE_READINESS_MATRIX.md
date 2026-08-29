# Architecture Readiness Matrix — Phase 10.5

One row per layer. "Verified by" points at executable evidence, not prose.

| # | Layer | Guarantee under test | Verified by | State |
|---|-------|----------------------|-------------|-------|
| 1 | Event Spine | every operational event is observed once, ordered | `phase1-event-spine` tests | READY |
| 2 | Event Ledger | append-only, RLS-scoped, authenticated writes only | Phase 3.5B migration + policy tests | READY |
| 3 | Shift Context | deterministic reduction of the spine | shift-context tests | READY |
| 4 | Script Intelligence | sanitized snapshots, no source leakage | Phase 4.5 gate | READY |
| 5 | Anomaly Detection | robust stats, `insufficient_baseline` first-class | Phase 5.5 gate | READY |
| 6 | Risk Forecasting | lift-based, non-causal language, calibration seam | Phase 6.5 gate | READY |
| 7 | Digital Twin | deterministic, production-immutable, MATCH/MISMATCH | Phase 7.5 gate | READY |
| 8 | Causal Hypothesis | contradiction-first, discriminating tests fixed up front | Phase 8.5 gate | READY |
| 9 | Cognitive workforce | routing, budgets, Critic/Guardian, injection defence | Phase 9.5 gate (63 adversarial tests) | READY |
| 10 | Governed execution | one execution path, confirmation proofs, verification | `phase10-execution.test.ts` (36) | READY |
| 10.5 | Whole organism | compound failure, escalation, concurrency, dependency loss | `phase105-red-team.test.ts` (51) | READY |

## Defects found and fixed in this gate

1. **Execution-time health check missing.** `authorizeExecution` trusted planning-time
   health. It now re-derives source health at execution time and refuses on
   `unavailable`/`disabled` (and on `degraded` for high/critical risk).
2. **Audit honesty gap.** An applied-but-unverifiable effect finalized as a plain
   `success`. The ledger row now carries
   `executed; verification unavailable — manual check required`.
3. **Confirmation floor not fingerprinted.** A client could downgrade
   `plan.confirmation` post-confirmation and the plan still verified. The
   confirmation mode is now part of the effect fingerprint.

## Standing invariants (re-proved here)

- Autonomy ceiling is **PREPARE**. No cognitive path mints a confirmation.
- A confirmation is bound to one fingerprint, one operator, a 5-minute TTL, single use.
- EXECUTED and VERIFIED are distinct states everywhere: receipt, ledger, UI copy.
- Compensation is never automatic and never described as reversal.
- Every dependency failure (ledger, provider, Guardian) fails closed.
- Retrieved text is data: injection patterns are neutralised, never obeyed.
