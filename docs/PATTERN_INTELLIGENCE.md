# Pattern Intelligence

**Phase 3, Part 5** — `src/lib/core/pattern-intelligence.ts`
Status: **BUILT NOW** (conservative, deterministic). Not predictive AI, not causal inference.

## What it is

A pure, deterministic engine that detects **interpretable repetition and
temporal association** over the durable ledger + canonical facts. Same inputs →
same output. Every observation carries its supporting evidence, a **confidence
class** (not an invented probability), a time window, and a recalculation
horizon.

## Language contract (enforced by tests)

Observations **never** say "caused", "will happen again", "root cause",
"because of the change", or "guaranteed". `FORBIDDEN_PATTERN_PHRASES` is asserted
against every observation in `pattern-intelligence.test.ts`
("LANGUAGE CONTRACT — temporal association is never labelled causation").

| Instead of… | Say… |
| --- | --- |
| "the change caused X" | "temporal association", "occurred after" |
| "this will happen again" | "recurring behavior", "observed pattern" |
| "root cause" | "worth investigating", "relevant previous resolution" |

## Confidence classes

`verified` › `supported` › `inferred` › `insufficient`. Change/incident
proximity is always **`inferred`** (timing only). A reused *verified* resolution
is `verified`; most repetition is `supported`.

## Patterns (BUILT NOW)

| Type | Fires when | Confidence | Language |
| --- | --- | --- | --- |
| `repeated_issue` | ≥3 same-classification tickets in 90d | supported | "Recurring … issues" |
| `change_incident_proximity` | ticket(s) opened ≤3d **after** a change | inferred | "Temporal association … does not establish causation" |
| `resolution_reuse` | a resolution matched ≥2× in 120d | verified/supported | "Relevant previous resolution reused N×" |
| `escalation` | ≥2 escalations in 45d | supported | "N escalations in 45 days" |
| `reopen` | ≥2 reopens in 60d | supported | "N tickets reopened" |
| `repeated_work` | ≥3 same-type work items in 30d | supported | "Recurring … work" |

Thresholds live in `PATTERN_CONFIG` (tunable, conservative).

## FOUNDATION ONLY (wired, dormant until signals exist)

The engine supports `repeated_work`, `resolution_reuse`, `escalation`, and
`reopen`, but the current Account Context Pack does not yet carry work-type,
resolution reuse counts, or explicit escalation/reopen flags. The account
assembler (`account-intelligence.ts`) therefore feeds those detectors nothing —
they stay dormant rather than mis-firing. They activate once the events/fields
exist (see the FUTURE durable events in `ledger-events.ts`).

## FUTURE (later phases, explicitly NOT built)

Predictive failure probabilities, causal inference, automatic root-cause
declaration, anomaly scoring. This engine deliberately stops at interpretable
repetition + temporal association.

## Contract (each observation)

`patternType · accountId · title · description · windowDays ·
supportingEventIds · sourceCount · evidenceRefs · confidence · firstObservedAt ·
lastObservedAt · severity · recalcAfterMs · schemaVersion (PATTERN_SCHEMA_VERSION)`.
