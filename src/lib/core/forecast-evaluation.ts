/**
 * Phase 6 — Forecast outcome evaluation & calibration foundation.
 *
 * When a forecast's horizon ends, we grade whether the DEFINED target outcome
 * actually occurred. This evaluates the FORECASTING SYSTEM — never an operator.
 * No probabilities are claimed yet; this records the seam a later phase needs
 * to ask "when we said ELEVATED, how often did the outcome occur?".
 */

import {
  FORECAST_BANDS,
  FORECAST_CALC_VERSION,
  OUTCOME_CONTRACT_VERSION,
  type ForecastBand,
  type ForecastObservation,
  type ForecastType,
} from "./forecast-contract";
import { observeOutcome, extractStateFeatures, type ForecastInput } from "./comparable-state";

export type ForecastOutcomeGrade = "hit" | "miss" | "censored" | "not_applicable";

export interface ForecastEvaluationEntry {
  forecastId: string;
  forecastType: ForecastType;
  band: ForecastBand;
  horizonDays: number;
  targetOutcome: string;
  outcome: ForecastOutcomeGrade;
  createdAt: string;
  horizonEndedAt: string;
  evaluatedAt: string;
  calcVersion: number;
  outcomeContractVersion: number;
}

/**
 * Grade every persisted forecast whose horizon has fully elapsed.
 * Bands of "insufficient_evidence" are graded NOT APPLICABLE: the system
 * declined to forecast, so there is nothing to score.
 */
export function evaluateElapsedForecasts(
  forecasts: readonly ForecastObservation[],
  input: ForecastInput,
): ForecastEvaluationEntry[] {
  const out: ForecastEvaluationEntry[] = [];
  for (const f of forecasts) {
    const anchor = Date.parse(f.createdAt);
    const end = Date.parse(f.expiresAt);
    if (!Number.isFinite(anchor) || !Number.isFinite(end)) continue;
    if (end > input.now) continue; // horizon not complete — do not grade

    let outcome: ForecastOutcomeGrade;
    if (f.band === "insufficient_evidence") {
      outcome = "not_applicable";
    } else {
      const features = extractStateFeatures(input, anchor);
      const observed = observeOutcome(input, f.forecastType, anchor, f.horizonDays, features);
      outcome =
        observed === "occurred" ? "hit" : observed === "did_not_occur" ? "miss" : "censored";
    }

    out.push({
      forecastId: f.id,
      forecastType: f.forecastType,
      band: f.band,
      horizonDays: f.horizonDays,
      targetOutcome: f.targetOutcome,
      outcome,
      createdAt: f.createdAt,
      horizonEndedAt: f.expiresAt,
      evaluatedAt: new Date(input.now).toISOString(),
      calcVersion: FORECAST_CALC_VERSION,
      outcomeContractVersion: OUTCOME_CONTRACT_VERSION,
    });
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Calibration summary (descriptive only — never a claim of accuracy)   */
/* ------------------------------------------------------------------ */

export interface BandCalibration {
  band: ForecastBand;
  graded: number;
  hits: number;
  misses: number;
  censored: number;
  notApplicable: number;
  /** hits / (hits + misses), or null when nothing gradeable. */
  hitRate: number | null;
}

export interface ForecastQualitySummary {
  totalForecasts: number;
  insufficientEvidenceRate: number | null;
  byBand: BandCalibration[];
  byType: Array<{ type: ForecastType; count: number; graded: number; hits: number }>;
  calcVersion: number;
  outcomeContractVersion: number;
  /** True when samples are too small to say anything about calibration. */
  insufficientEvaluationData: boolean;
}

const MIN_CALIBRATION_SAMPLES = 20;

export function summarizeForecastQuality(
  forecasts: readonly ForecastObservation[],
  evaluations: readonly ForecastEvaluationEntry[],
): ForecastQualitySummary {
  const byBand: BandCalibration[] = FORECAST_BANDS.map((band) => {
    const rows = evaluations.filter((e) => e.band === band);
    const hits = rows.filter((r) => r.outcome === "hit").length;
    const misses = rows.filter((r) => r.outcome === "miss").length;
    return {
      band,
      graded: rows.length,
      hits,
      misses,
      censored: rows.filter((r) => r.outcome === "censored").length,
      notApplicable: rows.filter((r) => r.outcome === "not_applicable").length,
      hitRate: hits + misses > 0 ? hits / (hits + misses) : null,
    };
  });

  const types = new Map<ForecastType, { count: number; graded: number; hits: number }>();
  for (const f of forecasts) {
    const cur = types.get(f.forecastType) ?? { count: 0, graded: 0, hits: 0 };
    cur.count += 1;
    types.set(f.forecastType, cur);
  }
  for (const e of evaluations) {
    const cur = types.get(e.forecastType) ?? { count: 0, graded: 0, hits: 0 };
    cur.graded += 1;
    if (e.outcome === "hit") cur.hits += 1;
    types.set(e.forecastType, cur);
  }

  const insufficientCount = forecasts.filter((f) => f.band === "insufficient_evidence").length;

  return {
    totalForecasts: forecasts.length,
    insufficientEvidenceRate: forecasts.length ? insufficientCount / forecasts.length : null,
    byBand,
    byType: [...types.entries()].map(([type, v]) => ({ type, ...v })),
    calcVersion: FORECAST_CALC_VERSION,
    outcomeContractVersion: OUTCOME_CONTRACT_VERSION,
    insufficientEvaluationData:
      evaluations.filter((e) => e.outcome === "hit" || e.outcome === "miss").length <
      MIN_CALIBRATION_SAMPLES,
  };
}
