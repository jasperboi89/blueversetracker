# Risk Forecasting & Future-State Intelligence

**Phase 6** — `src/lib/core/forecast-contract.ts`, `comparable-state.ts`,
`forecast-engine.ts`, `forecast-store.ts`, `forecast-evaluation.ts`,
`src/components/intelligence/OutlookPanel.tsx`.
Status: **BUILT NOW** (bounded, comparative, non-causal).

## The three layers stay separate

| Layer | Example | Owner |
| --- | --- | --- |
| CURRENT FACT | "12 tickets were recorded this week." | Account Context Pack |
| ANOMALY (Phase 5) | "That is materially above this account's baseline." | `anomaly-engine.ts` |
| FORECAST (Phase 6) | "Comparable past states were more often followed by additional related work within 7 days." | `forecast-engine.ts` |

An anomaly is never rendered as a forecast, and a forecast never claims a cause.

## How a forecast is produced

1. **Extract current state features** — activity band, workload band, dominant
   issue family, recurrence, recent change, reopen/escalation, script revision
   recency. Structured features only; no text similarity.
2. **Find comparable states** on the *same account* by scanning historical
   anchors and scoring feature overlap (strong / moderate / weak).
3. **Observe what happened afterward** inside an explicit outcome window.
   Windows that have not fully elapsed are **censored**, never counted as
   "did not occur".
4. **Band the outcome distribution** by lift over the account's own base rate:
   `lower than usual` · `typical` · `elevated` · `highly elevated`.

## Hard rules encoded in the contract

- **INSUFFICIENT FORECAST EVIDENCE is first-class.** Too few comparables, too
  few elapsed windows, or too little history returns a declared evidence gap.
  It is never reported as "low risk".
- **No probabilities.** Bands are interpretable classes; percentages would imply
  a calibration the system has not earned.
- **Explicit outcome windows always.** A horizonless claim is forbidden.
- **Non-causal, non-certain language.** `violatesForecastLanguage()` and
  `FORBIDDEN_FORECAST_PHRASES` are enforced in tests.
- **No temporal leakage.** Features read only facts at or before the anchor;
  outcomes read only facts strictly after it.
- **Autonomy capped at PREPARE.** Observe, explain, recommend, prepare. A
  forecast can never trigger a write; the Safe Action Executor still gates
  everything an operator chooses to do.

## Lifecycle & persistence

`forecast-store.ts` persists ids, types, bands, horizons, comparable counts,
evidence ids and lifecycle history — no prose, no bodies, no model output.
Transitions emit ledger events exactly once (`intelligence.forecast_created` /
`_updated` / `_resolved` / `_expired`); recalculation with an unchanged band is
deliberately silent so the surface stays quiet.

## Calibration foundation

`forecast-evaluation.ts` grades forecasts whose horizon has elapsed as
hit / miss / censored / not applicable, and summarizes by band. Below
`MIN_CALIBRATION_SAMPLES` it reports `insufficientEvaluationData` rather than a
misleading accuracy figure. This evaluates the *system*, never the operator.

## Copilot

`operational_forecast` exposes forecasts read-only, with the interpretation
guardrail attached to every response. The model may explain and recommend
preparation; it may not act.

## FOUNDATION ONLY

- Cross-account comparable states are deliberately deferred (same-account only).
- Script-structure forecasting rides on the Phase 4 coverage gate and stays
  dormant when structural recognition is weak.
- Calibration is recorded but not yet fed back into banding.

## FUTURE

Calibrated bands, cross-account comparables, horizon-aware scheduling of
preparation work. Not built.
