# Causal Hypothesis Engine (Phase 8)

Helps an operator investigate **why** something may be happening without ever
pretending correlation proves causation.

## Modules

- `hypothesis-contract.ts` — vocabulary: hypothesis types, strength classes,
  relation claims, evidence stances, discriminating tests, conclusions.
  Autonomy is capped at `prepare`.
- `hypothesis-strength.ts` — deterministic scoring + the strict verification
  rule (mechanism, direct evidence, a discriminating test, confirmed
  predictions, competitors rejected, operator confirmation).
- `hypothesis-generation.ts` — bounded candidate generation from script
  structure, anomalies, patterns and resolution memory; mechanism-level dedupe.
- `discriminating-tests.ts` — proposes tests whose OUTCOMES DIFFER between
  hypotheses. Outcome → effect mapping is fixed at preparation time, so
  recording a result never asks an AI what it meant. Tests are **prepared**,
  never executed, and project into Phase 4 Test Intelligence.
- `counterfactual.ts` — Phase 7 structure answers "is this mechanism
  structurally possible?" only. Structural plausibility never becomes direct
  causal evidence, and low recognition yields INDETERMINATE.
- `investigation-engine.ts` — pure lifecycle: recompute from all evidence every
  time (contradiction-first), conclusion states, alternative search, temporal
  `investigationAsOf`.
- `investigation-store.ts` — persisted state + append-only timeline, cross-device
  via the shared blob store. Emits durable lifecycle events only.
- `hypothesis-graph.ts` — projection over the canonical Evidence Graph
  vocabulary. Not a second graph store.

## Conclusions

`insufficient_evidence`, `multiple_plausible_explanations`,
`most_supported_explanation`, `hypotheses_rejected`, `cause_verified`.
"Most supported" is never rendered as "the cause".

## Surfaces

`InvestigatePanel` on the account Intelligence tab (contradictions above
support, conclusion state first) and the read-only `operational_investigation`
Copilot tool.

## Boundaries

Persists references, classes and outcome keys — never ticket bodies, notes,
script source or model output. AI may propose a hypothesis (as `ai_proposed`,
with no evidence and no strength) and explain; it may never verify, test, or
act.
