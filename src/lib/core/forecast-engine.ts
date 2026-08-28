/**
 * Phase 6 — Forecast engine.
 *
 * Turns comparable-state searches into canonical forecast observations. Pure,
 * deterministic, no AI and no network: the statistical/deterministic layer owns
 * the forecast; AI may only explain what this file produced.
 *
 * Every forecast either has an interpretable band backed by minimum evidence,
 * or it is an explicit INSUFFICIENT FORECAST EVIDENCE record. Forecasts are
 * never forced.
 */

import {
  FORECAST_CALC_VERSION,
  FORECAST_CONFIG,
  FORECAST_HORIZON_BY_TYPE,
  FORECAST_RECOMMENDATIONS,
  FORECAST_SCHEMA_VERSION,
  FORECAST_TARGET_OUTCOME,
  FORECAST_TYPES,
  FORECAST_TYPE_LABEL,
  FORECAST_UNCERTAINTY_REDUCERS,
  FORBIDDEN_FORECAST_PHRASES,
  FORECAST_BAND_RANK,
  HORIZON_DAYS,
  HORIZON_LABEL,
  OUTCOME_CONTRACT_VERSION,
  WHAT_THIS_DOES_NOT_MEAN,
  type ComparableOutcomeSummary,
  type ForecastBand,
  type ForecastObservation,
  type ForecastType,
  type InsufficientForecastReason,
} from "./forecast-contract";
import {
  findComparableStates,
  type ForecastInput,
  type StateFeatures,
} from "./comparable-state";
import type { ConfidenceClass, PatternEvidenceRef } from "./pattern-intelligence";
import { ANOMALY_DAY_MS as DAY_MS } from "./anomaly-contract";

export type { ForecastInput } from "./comparable-state";

const cfg = FORECAST_CONFIG;

export interface ForecastResult {
  /** Forecasts with an interpretable band, ranked and bounded. */
  forecasts: ForecastObservation[];
  /** Explicit "not enough evidence to forecast" records — never findings. */
  evidenceGaps: ForecastObservation[];
  generatedAt: string;
}

/* ------------------------------------------------------------------ */
/* Applicability — is the current state even about this forecast?       */
/* ------------------------------------------------------------------ */

interface Applicability {
  applicable: boolean;
  reason?: InsufficientForecastReason;
  scriptContext?: { scriptId: string; coverage: number; unresolvedCount: number };
}

function applicabilityFor(
  type: ForecastType,
  input: ForecastInput,
  f: StateFeatures,
): Applicability {
  const activeAnomalies = (input.anomalies ?? []).filter((a) => a.state === "anomaly");
  switch (type) {
    case "follow_up_work":
      return activeAnomalies.length > 0 || f.recurringFamily || f.activityBand === "high"
        ? { applicable: true }
        : { applicable: false, reason: "current_state_not_applicable" };

    case "escalation": {
      const recorded = input.tickets.filter((t) => t.reopened || t.escalated).length;
      if (recorded < 3) return { applicable: false, reason: "outcome_data_unreliable" };
      return { applicable: true };
    }

    case "extended_duration": {
      const completed = input.work.filter((w) => w.durationMs > 0 && w.endedAtMs > 0);
      if (completed.length < 4) return { applicable: false, reason: "too_few_outcome_observations" };
      const recent = completed.some((w) => w.endedAtMs > input.now - 3 * DAY_MS);
      return recent ? { applicable: true } : { applicable: false, reason: "current_state_not_applicable" };
    }

    case "recurrence":
      return f.recurringFamily
        ? { applicable: true }
        : { applicable: false, reason: "current_state_not_applicable" };

    case "post_change_follow_up":
      return f.recentChange
        ? { applicable: true }
        : { applicable: false, reason: "current_state_not_applicable" };

    case "script_test_gap": {
      const scripts = input.scripts ?? [];
      const revised = scripts.filter(
        (s) =>
          typeof s.lastRevisionAtMs === "number" &&
          s.lastRevisionAtMs > input.now - cfg.stateWindowDays * DAY_MS,
      );
      if (revised.length === 0) return { applicable: false, reason: "current_state_not_applicable" };
      // Phase 4.5 hard boundary: no structural forecasting from a partial read.
      const usable = revised.find(
        (s) => s.coverage >= cfg.scriptMinCoverage && s.versionCount >= cfg.scriptMinVersions,
      );
      if (!usable) return { applicable: false, reason: "script_coverage_below_threshold" };
      return {
        applicable: true,
        scriptContext: {
          scriptId: usable.scriptId,
          coverage: usable.coverage,
          unresolvedCount: usable.unresolvedCount,
        },
      };
    }
  }
}

/* ------------------------------------------------------------------ */
/* Bands, confidence                                                    */
/* ------------------------------------------------------------------ */

/** Interpretable bands from lift over the account's own base rate. */
export function bandFor(summary: ComparableOutcomeSummary): ForecastBand {
  const { rate, lift } = summary;
  if (rate == null) return "insufficient_evidence";
  if (lift == null) {
    // No usable base rate: fall back to the absolute rate, conservatively.
    return rate >= 0.6 ? "elevated" : rate <= 0.2 ? "lower_than_usual" : "typical";
  }
  if (lift >= cfg.highlyElevatedLift && rate >= cfg.highlyElevatedRate) return "highly_elevated";
  if (lift >= cfg.elevatedLift) return "elevated";
  if (lift <= cfg.lowerLift) return "lower_than_usual";
  return "typical";
}

export function confidenceFor(summary: ComparableOutcomeSummary): ConfidenceClass {
  if (summary.observedCount < cfg.minObservedOutcomes) return "insufficient";
  const strongShare = summary.comparableCount
    ? summary.strongCount / summary.comparableCount
    : 0;
  const consistent =
    summary.rate != null && (summary.rate >= 0.7 || summary.rate <= 0.3);
  const wellEvidenced =
    summary.comparableCount >= cfg.supportedComparables &&
    summary.distinctPeriods >= cfg.minDistinctPeriods &&
    strongShare >= cfg.supportedStrongShare;
  // "verified" is never reachable: a forecast is never a verified fact.
  return wellEvidenced && consistent ? "supported" : "inferred";
}

/* ------------------------------------------------------------------ */
/* Language — comparative, horizon-bound, never certain                 */
/* ------------------------------------------------------------------ */

function describe(
  type: ForecastType,
  band: ForecastBand,
  s: ComparableOutcomeSummary,
  horizonLabel: string,
): string {
  const of = `${s.occurredCount} of ${s.observedCount} historically comparable state(s)`;
  const target = FORECAST_TARGET_OUTCOME[type];
  const base =
    s.baseRate != null
      ? ` This account's overall rate for the same outcome is ${Math.round(s.baseRate * 100)} in 100 comparable windows.`
      : "";
  const framing =
    band === "highly_elevated" || band === "elevated"
      ? "more often than this account's own baseline"
      : band === "lower_than_usual"
        ? "less often than this account's own baseline"
        : "at about this account's own baseline rate";
  return `Within ${horizonLabel.toLowerCase()}, ${of} were followed by ${target} — ${framing}.${base} This is an association between comparable historical states and what followed them.`;
}

function titleFor(type: ForecastType, band: ForecastBand): string {
  const label = FORECAST_TYPE_LABEL[type];
  switch (band) {
    case "highly_elevated":
      return `Highly elevated ${label.toLowerCase()}`;
    case "elevated":
      return `Elevated ${label.toLowerCase()}`;
    case "lower_than_usual":
      return `Lower-than-usual ${label.toLowerCase()}`;
    case "typical":
      return `Typical ${label.toLowerCase()}`;
    case "insufficient_evidence":
      return `${label} — insufficient forecast evidence`;
  }
}

function stateSummary(f: StateFeatures): string[] {
  const out = [
    `Activity ${f.activityBand} (${f.activityCount} recorded event(s) in the last ${cfg.stateWindowDays} days)`,
    `Workload ${f.workloadBand} (${f.ticketCount} ticket(s) in window)`,
  ];
  if (f.issueFamily) out.push(`Dominant issue family: ${f.issueFamily}`);
  if (f.recurringFamily) out.push("Repeat of the same issue family recorded");
  if (f.recentChange) out.push("A recorded change was applied recently");
  if (f.reopenOrEscalation) out.push("A reopen/escalation is on record in the window");
  if (f.scriptRevisionRecent) out.push("A structural script revision was recorded recently");
  return out;
}

/* ------------------------------------------------------------------ */
/* Build                                                                */
/* ------------------------------------------------------------------ */

function evidenceRefsFor(input: ForecastInput, f: StateFeatures): PatternEvidenceRef[] {
  const refs: PatternEvidenceRef[] = [{ type: "account", id: input.accountId }];
  for (const t of input.tickets
    .filter((t) => (t.createdAtMs ?? 0) > input.now - cfg.familyWindowDays * DAY_MS)
    .slice(0, 6)) {
    refs.push({ type: "ticket", id: t.id });
  }
  if (f.recentChange) {
    const change = input.changes.find((c) => typeof c.appliedAtMs === "number");
    if (change) refs.push({ type: "change", id: change.id });
  }
  return refs;
}

function make(
  input: ForecastInput,
  type: ForecastType,
  band: ForecastBand,
  summary: ComparableOutcomeSummary,
  comparables: ForecastObservation["comparables"],
  features: StateFeatures,
  extra: {
    insufficientReason?: InsufficientForecastReason;
    scriptContext?: ForecastObservation["scriptContext"];
  },
): ForecastObservation {
  const horizon = FORECAST_HORIZON_BY_TYPE[type];
  const horizonDays = HORIZON_DAYS[horizon];
  const nowIso = new Date(input.now).toISOString();
  const insufficient = band === "insufficient_evidence";
  return {
    id: `fc:${type}:${input.accountId}`,
    schemaVersion: FORECAST_SCHEMA_VERSION,
    calcVersion: FORECAST_CALC_VERSION,
    outcomeContractVersion: OUTCOME_CONTRACT_VERSION,
    forecastType: type,
    entityType: "account",
    entityId: input.accountId,
    accountId: input.accountId,
    title: titleFor(type, band),
    description: insufficient
      ? `There is not enough comparable history to produce a ${FORECAST_TYPE_LABEL[type].toLowerCase()} outlook for this account yet. ${summary.comparableCount} comparable state(s), ${summary.observedCount} with an elapsed outcome window.`
      : describe(type, band, summary, HORIZON_LABEL[horizon]),
    horizon,
    horizonDays,
    targetOutcome: FORECAST_TARGET_OUTCOME[type],
    band,
    confidence: insufficient ? "insufficient" : confidenceFor(summary),
    trend: "new",
    ...(extra.insufficientReason ? { insufficientReason: extra.insufficientReason } : {}),
    currentStateSummary: stateSummary(features),
    comparables,
    outcomes: summary,
    supportingAnomalyIds: (input.anomalies ?? [])
      .filter((a) => a.state === "anomaly")
      .map((a) => a.id)
      .slice(0, 8),
    supportingPatternIds: (input.patterns ?? []).map((p) => p.id).slice(0, 8),
    ...(extra.scriptContext ? { scriptContext: extra.scriptContext } : {}),
    evidenceRefs: evidenceRefsFor(input, features),
    recommendations: insufficient ? [] : FORECAST_RECOMMENDATIONS[type],
    uncertaintyReducers: FORECAST_UNCERTAINTY_REDUCERS[type],
    whatThisDoesNotMean: WHAT_THIS_DOES_NOT_MEAN[type],
    autonomy: "recommend",
    createdAt: nowIso,
    expiresAt: new Date(input.now + horizonDays * DAY_MS).toISOString(),
    generatedAt: nowIso,
    sensitivity: "reference",
  };
}

const EMPTY_SUMMARY: ComparableOutcomeSummary = {
  comparableCount: 0,
  observedCount: 0,
  occurredCount: 0,
  unobservedCount: 0,
  distinctPeriods: 0,
  rate: null,
  baseRate: null,
  lift: null,
  strongCount: 0,
};

/** Produce one forecast (or evidence gap) for a single type. */
export function buildForecast(input: ForecastInput, type: ForecastType): ForecastObservation {
  const horizon = FORECAST_HORIZON_BY_TYPE[type];
  const search = findComparableStates(input, type, horizon);
  const { current, summary, comparables, historyDays } = search;

  const applicability = applicabilityFor(type, input, current);
  if (!applicability.applicable) {
    return make(input, type, "insufficient_evidence", EMPTY_SUMMARY, [], current, {
      insufficientReason: applicability.reason ?? "current_state_not_applicable",
    });
  }

  const gapReason: InsufficientForecastReason | undefined =
    historyDays < cfg.minAccountHistoryDays
      ? "account_history_too_short"
      : summary.comparableCount < cfg.minComparableStates
        ? "too_few_comparable_states"
        : summary.observedCount <
            (type === "escalation" ? cfg.minEscalationObservations : cfg.minObservedOutcomes)
          ? "too_few_outcome_observations"
          : summary.distinctPeriods < cfg.minDistinctPeriods
            ? "too_few_distinct_periods"
            : undefined;

  if (gapReason) {
    return make(input, type, "insufficient_evidence", summary, comparables, current, {
      insufficientReason: gapReason,
      ...(applicability.scriptContext ? { scriptContext: applicability.scriptContext } : {}),
    });
  }

  const band = bandFor(summary);
  return make(input, type, band, summary, comparables, current, {
    ...(applicability.scriptContext ? { scriptContext: applicability.scriptContext } : {}),
  });
}

/**
 * Run every forecast type for one account. A throwing type never suppresses
 * the others. Results are ranked (band → confidence → evidence weight) and
 * bounded; evidence gaps are separated so a surface cannot present
 * "still learning" as an outlook.
 */
export function buildForecasts(input: ForecastInput): ForecastResult {
  const all: ForecastObservation[] = [];
  for (const type of FORECAST_TYPES) {
    try {
      all.push(buildForecast(input, type));
    } catch (err) {
      console.warn("[forecast-engine] forecast failed", type, err);
    }
  }

  const CONF_RANK: Record<ConfidenceClass, number> = {
    verified: 0,
    supported: 1,
    inferred: 2,
    insufficient: 3,
  };

  const forecasts = all
    .filter((f) => f.band !== "insufficient_evidence")
    .sort(
      (a, b) =>
        FORECAST_BAND_RANK[a.band] - FORECAST_BAND_RANK[b.band] ||
        CONF_RANK[a.confidence] - CONF_RANK[b.confidence] ||
        b.outcomes.observedCount - a.outcomes.observedCount ||
        a.id.localeCompare(b.id),
    )
    .slice(0, cfg.maxForecastsPerAccount);

  const evidenceGaps = all
    .filter((f) => f.band === "insufficient_evidence")
    .sort((a, b) => a.forecastType.localeCompare(b.forecastType));

  return { forecasts, evidenceGaps, generatedAt: new Date(input.now).toISOString() };
}

/**
 * Dev/test guard: no forecast may assert certainty or causation.
 * Returns the offending phrases (empty when clean).
 */
export function violatesForecastLanguage(f: ForecastObservation): string[] {
  const hay = [f.title, f.description, ...f.recommendations, ...f.currentStateSummary]
    .join(" ")
    .toLowerCase();
  return FORBIDDEN_FORECAST_PHRASES.filter((p) => hay.includes(p));
}

/** Phase 6 autonomy ceiling. Forecasting may never execute a change. */
export function maxForecastAutonomy(): "prepare" {
  return "prepare";
}
