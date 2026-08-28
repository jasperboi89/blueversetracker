/**
 * Phase 6 — Risk Forecasting & Future-State Intelligence: canonical contract.
 *
 * A FORECAST is a statement about how historically comparable states of THIS
 * account resolved afterwards. It is not a prediction of certainty, not a
 * probability, and never a causal claim.
 *
 * Three layers stay strictly separate across the whole system:
 *
 *   CURRENT FACT      "12 tickets were recorded this week."           (context pack)
 *   ANOMALY (Phase 5) "That is materially above baseline."            (deviation)
 *   FORECAST (Phase 6)"Comparable past states were more often followed
 *                      by additional related work within 7 days."     (outlook)
 *
 * Encoded rules:
 *  1. INSUFFICIENT FORECAST EVIDENCE is a first-class, desirable result.
 *  2. Bands are interpretable classes, never fake percentages.
 *  3. Autonomy is capped at OBSERVE / EXPLAIN / RECOMMEND / PREPARE.
 *  4. Every forecast carries an explicit outcome window; horizonless claims
 *     are forbidden.
 *  5. Features are extracted strictly from information available at or before
 *     the anchor time — no future leakage (see comparable-state.ts).
 */

import type { AutonomyLevel } from "./anomaly-contract";
import type { ConfidenceClass, PatternEvidenceRef } from "./pattern-intelligence";

export const FORECAST_SCHEMA_VERSION = 1;
/** Bumped whenever feature extraction / band maths change. */
export const FORECAST_CALC_VERSION = 1;
/** Bumped whenever an outcome definition changes (calibration cannot mix). */
export const OUTCOME_CONTRACT_VERSION = 1;

export const FORECAST_TYPES = [
  "follow_up_work",
  "escalation",
  "extended_duration",
  "recurrence",
  "post_change_follow_up",
  "script_test_gap",
] as const;
export type ForecastType = (typeof FORECAST_TYPES)[number];

/** Concrete, testable outcome each forecast type targets. */
export const FORECAST_TARGET_OUTCOME: Record<ForecastType, string> = {
  follow_up_work: "additional related ticket or work activity recorded on this account",
  escalation: "a reopen or escalation recorded on this account",
  extended_duration: "a work session materially longer than this account's typical session",
  recurrence: "another ticket of the same issue family recorded",
  post_change_follow_up: "additional related work recorded after a recorded change",
  script_test_gap: "additional related work recorded after a structural script revision",
};

/** Interpretable bands. No probabilities in Phase 6 — deliberately. */
export const FORECAST_BANDS = [
  "lower_than_usual",
  "typical",
  "elevated",
  "highly_elevated",
  "insufficient_evidence",
] as const;
export type ForecastBand = (typeof FORECAST_BANDS)[number];

export const FORECAST_BAND_LABEL: Record<ForecastBand, string> = {
  lower_than_usual: "Lower than usual",
  typical: "Typical",
  elevated: "Elevated",
  highly_elevated: "Highly elevated",
  insufficient_evidence: "Insufficient forecast evidence",
};

/** Ordinal used for trajectory comparison and ranking. */
export const FORECAST_BAND_RANK: Record<ForecastBand, number> = {
  highly_elevated: 0,
  elevated: 1,
  typical: 2,
  lower_than_usual: 3,
  insufficient_evidence: 4,
};

export type ForecastTrend = "rising" | "stable" | "declining" | "new";

export type ForecastLifecycle =
  | "new"
  | "active"
  | "updated"
  | "acknowledged"
  | "expired"
  | "resolved"
  | "suppressed";

/** Explicit outcome windows. Horizonless forecasts are not representable. */
export const FORECAST_HORIZONS = ["next_24h", "next_shift", "next_3_days", "next_7_days"] as const;
export type ForecastHorizon = (typeof FORECAST_HORIZONS)[number];

export const HORIZON_DAYS: Record<ForecastHorizon, number> = {
  next_24h: 1,
  next_shift: 1,
  next_3_days: 3,
  next_7_days: 7,
};

export const HORIZON_LABEL: Record<ForecastHorizon, string> = {
  next_24h: "Next 24 hours",
  next_shift: "Next shift",
  next_3_days: "Next 3 days",
  next_7_days: "Next 7 days",
};

/** Horizon per forecast type — fixed so calibration compares like with like. */
export const FORECAST_HORIZON_BY_TYPE: Record<ForecastType, ForecastHorizon> = {
  follow_up_work: "next_7_days",
  escalation: "next_7_days",
  extended_duration: "next_3_days",
  recurrence: "next_7_days",
  post_change_follow_up: "next_7_days",
  script_test_gap: "next_7_days",
};

/** Why a forecast could not be produced. Always shown, never swallowed. */
export type InsufficientForecastReason =
  | "too_few_comparable_states"
  | "too_few_outcome_observations"
  | "too_few_distinct_periods"
  | "account_history_too_short"
  | "current_state_not_applicable"
  | "script_coverage_below_threshold"
  | "outcome_data_unreliable";

export const INSUFFICIENT_FORECAST_LABEL: Record<InsufficientForecastReason, string> = {
  too_few_comparable_states: "not enough historically comparable states for this account yet",
  too_few_outcome_observations: "comparable states exist but their outcome windows have not elapsed",
  too_few_distinct_periods: "the comparable states all come from too narrow a slice of time",
  account_history_too_short: "this account does not have enough recorded history yet",
  current_state_not_applicable: "the current state does not contain the conditions this forecast is about",
  script_coverage_below_threshold: "the structural reading of the script is too partial to forecast from",
  outcome_data_unreliable: "the outcome this forecast targets is not recorded reliably enough here",
};

/** How closely a historical state resembles the current one. */
export type ComparableQuality = "strong" | "moderate" | "weak";

/** One historical anchor that was judged comparable to the current state. */
export interface ComparableState {
  /** Anchor time the historical state was reconstructed at. */
  atIso: string;
  /** 0..1 structured-feature similarity. */
  similarity: number;
  quality: ComparableQuality;
  /** Human-readable reasons this state is considered comparable. */
  matchedOn: string[];
  /** Whether the target outcome occurred inside that state's outcome window. */
  outcome: "occurred" | "did_not_occur" | "unobserved";
}

export interface ComparableOutcomeSummary {
  /** Comparable states found (all qualities). */
  comparableCount: number;
  /** Comparable states whose outcome window has fully elapsed. */
  observedCount: number;
  /** Of the observed, how many saw the target outcome. */
  occurredCount: number;
  /** Comparable states whose window has not elapsed (censored). */
  unobservedCount: number;
  /** Distinct calendar days the comparable anchors span. */
  distinctPeriods: number;
  /** occurredCount / observedCount, or null when nothing is observable. */
  rate: number | null;
  /** The account's own base rate for the same outcome across all anchors. */
  baseRate: number | null;
  /** rate / baseRate, or null. Drives the band. */
  lift: number | null;
  strongCount: number;
}

export interface ForecastObservation {
  id: string;
  schemaVersion: number;
  calcVersion: number;
  outcomeContractVersion: number;
  forecastType: ForecastType;
  entityType: "account";
  entityId: string;
  accountId: string;
  title: string;
  /** Careful, comparative, non-causal, non-certain description. */
  description: string;
  horizon: ForecastHorizon;
  horizonDays: number;
  targetOutcome: string;
  band: ForecastBand;
  confidence: ConfidenceClass;
  trend: ForecastTrend;
  /** Set only when band === "insufficient_evidence". */
  insufficientReason?: InsufficientForecastReason;
  /** Structured description of the state the forecast was computed from. */
  currentStateSummary: string[];
  comparables: ComparableState[];
  outcomes: ComparableOutcomeSummary;
  supportingAnomalyIds: string[];
  supportingPatternIds: string[];
  scriptContext?: { scriptId: string; coverage: number; unresolvedCount: number };
  evidenceRefs: PatternEvidenceRef[];
  /** Operator-facing, human-review-only suggestions. Never auto-applied. */
  recommendations: string[];
  /** What additional evidence would narrow the uncertainty. */
  uncertaintyReducers: string[];
  /** Explicit epistemic guardrail rendered in the inspector. */
  whatThisDoesNotMean: string;
  autonomy: AutonomyLevel;
  createdAt: string;
  expiresAt: string;
  generatedAt: string;
  /** Sensitivity of the underlying inputs — references and counts only. */
  sensitivity: "reference";
}

/** Tunables. Conservative: a quiet forecast surface beats a noisy one. */
export const FORECAST_CONFIG = {
  /** How far back anchors are sampled. */
  historyWindowDays: 120,
  /** Spacing between historical anchors (days). */
  anchorStrideDays: 2,
  /** Feature window used to describe a state at an anchor. */
  stateWindowDays: 7,
  /** Longer window used for issue-family / recurrence features. */
  familyWindowDays: 14,
  /** A change within this many days before the anchor counts as "recent". */
  recentChangeDays: 3,
  /** Minimum recorded account history before ANY forecast may be produced. */
  minAccountHistoryDays: 21,
  /** Similarity at or above which a historical state counts as comparable. */
  minSimilarity: 0.6,
  strongSimilarity: 0.85,
  moderateSimilarity: 0.72,
  /** Minimum comparable states / observed outcomes / distinct days. */
  minComparableStates: 4,
  minObservedOutcomes: 4,
  minDistinctPeriods: 3,
  /** Escalation-style outcomes need more history before they are trustworthy. */
  minEscalationObservations: 6,
  /** Band thresholds on lift (rate vs the account's own base rate). */
  elevatedLift: 1.3,
  highlyElevatedLift: 2.2,
  highlyElevatedRate: 0.6,
  lowerLift: 0.7,
  /** Confidence promotion thresholds. */
  supportedComparables: 8,
  supportedStrongShare: 0.4,
  /** Script forecasts stay dormant below this extractor coverage. */
  scriptMinCoverage: 0.6,
  scriptMinVersions: 3,
  /** Cache/recalc horizon for the comparable-state projection. */
  recalcAfterMs: 3 * 60 * 60 * 1000,
  /** Radar never shows more than this many forecast items. */
  maxRadarForecasts: 2,
  maxForecastsPerAccount: 4,
} as const;

/**
 * Forbidden phrasing — certainty and causation. Enforced by tests over every
 * generated forecast title/description/recommendation.
 */
export const FORBIDDEN_FORECAST_PHRASES = [
  "will happen",
  "will occur",
  "will fail",
  "will cause",
  "caused by",
  "because of the change",
  "guaranteed",
  "certain to",
  "definitely",
  "root cause",
  "% chance",
] as const;

export const FORECAST_TYPE_LABEL: Record<ForecastType, string> = {
  follow_up_work: "Follow-up work risk",
  escalation: "Escalation risk",
  extended_duration: "Extended-duration risk",
  recurrence: "Recurrence risk",
  post_change_follow_up: "Post-change follow-up risk",
  script_test_gap: "Script test-gap risk",
};

export const WHAT_THIS_DOES_NOT_MEAN: Record<ForecastType, string> = {
  follow_up_work:
    "This does not establish that anything is wrong with the account, that another issue will occur, or that the current activity caused anything.",
  escalation:
    "This does not establish that an escalation will occur, and it is not an assessment of anyone's handling of the work.",
  extended_duration:
    "This does not establish that the current work will run long, and it is not an SLA judgement — no SLA model exists here.",
  recurrence:
    "This does not establish that the issue will recur, and it does not identify why the issue recurs.",
  post_change_follow_up:
    "This does not establish that the recorded change created the current issue or that further work will be required. It is a temporal association between comparable historical states and what followed them.",
  script_test_gap:
    "This does not establish that the script is faulty or that a regression exists. It reports that comparable structural states were more often followed by additional work.",
};

/** Human-review recommendations per type. RECOMMEND / PREPARE only. */
export const FORECAST_RECOMMENDATIONS: Record<ForecastType, string[]> = {
  follow_up_work: [
    "Review the account's recent related tickets before closing the current work",
    "Monitor this account through the next shift",
  ],
  escalation: [
    "Review prior reopens on this account for a shared theme",
    "Confirm the customer-facing summary is complete before handoff",
  ],
  extended_duration: [
    "Check for an unresolved dependency or blocker on the current work",
    "Review previous Resolution Memory entries for a faster known path",
  ],
  recurrence: [
    "Review whether the last fix was verified or only applied",
    "Check Resolution Memory for a durable fix rather than a repeat workaround",
  ],
  post_change_follow_up: [
    "Review the recorded change and its verification state",
    "Validate routing before the next production change",
  ],
  script_test_gap: [
    "Rerun the regression suite for the affected components",
    "Inspect unresolved dependency targets before further structural edits",
  ],
};

/** What extra evidence would reduce uncertainty for this forecast type. */
export const FORECAST_UNCERTAINTY_REDUCERS: Record<ForecastType, string[]> = {
  follow_up_work: [
    "More recorded history for this account (more comparable states)",
    "Outcome labels on the currently open work",
  ],
  escalation: [
    "Explicit escalation/reopen events recorded rather than inferred from status",
    "More comparable states with fully elapsed outcome windows",
  ],
  extended_duration: [
    "More completed work sessions of the same work type",
    "Recorded blocker state for the current work",
  ],
  recurrence: [
    "Verified (not just applied) resolution for the recurring issue family",
    "Consistent issue classification on recent tickets",
  ],
  post_change_follow_up: [
    "Recorded verification result for the change",
    "More historical changes with observed follow-up windows",
  ],
  script_test_gap: [
    "Higher structural recognition coverage for the script",
    "Resolution of unknown dependency targets",
    "A completed regression run recorded against this script version",
  ],
};

export function isForecastable(f: ForecastObservation): boolean {
  return f.band !== "insufficient_evidence";
}

export function isElevated(band: ForecastBand): boolean {
  return band === "elevated" || band === "highly_elevated";
}
