# Operational Radar

**Phase 3, Part 6** — `src/lib/core/operational-radar.ts`, `src/components/intelligence/RadarBand.tsx`
Status: **BUILT NOW** (bounded, grounded).

## What it is

A **small, ranked, grounded** set of observations surfaced in the Command
Center's "Work Intelligence" band — deliberately not a dashboard. It exists to
surface a handful of high-value items and avoid alert fatigue.

## Guarantees

- **Bounded:** capped at `MAX_RADAR_ITEMS` (6).
- **Grounded:** every item points back at real evidence. The Command Center band
  is built only from real signals — persisted Account Cortex observations
  (recorded when accounts were evaluated) and the existing recurring-issues
  signal. Nothing is manufactured.
- **Transparent ranking:** `rankRadar()` orders by severity → confidence class →
  source count → recency.
- **Dismissible:** items the operator marked not-relevant / incorrect / outdated
  / resolved (intelligence feedback) are suppressed via `suppressedRadarIds`.
- **Calm empty state:** when nothing meaningful exists, the band renders a quiet
  "nothing needs attention" message — never fake activity.

## Categories

`recurring` · `change_followup` · `resolution_match` · `workload` · `system`.

Pattern observations map to the first three; `workload` and `system` accept
external signals (`RadarWorkloadSignal`, `RadarSystemSignal`) the caller folds in.

## FOUNDATION ONLY

- Workload and system radar inputs are supported by `buildRadar` but not yet fed
  by the Command Center band (which currently sources cortex observations +
  recurring issues). Wire real workload/integration-health signals in later.
- Acknowledge/dismiss currently flows through intelligence feedback
  (not-relevant). A dedicated per-item "acknowledge" affordance is a later add.

## FUTURE

Predictive risk items, cross-account correlation clusters, anomaly-driven radar.
Not built.
