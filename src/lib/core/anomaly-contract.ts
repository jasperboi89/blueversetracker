/**
 * Phase 5 — Anomaly Detection & Early Warning: canonical contract.
 *
 * An ANOMALY is a statement that recent operational behavior deviates from an
 * ESTABLISHED baseline for the same account. It is not a prediction, not a
 * diagnosis, and never a causal claim.
 *
 * Two hard rules encoded here:
 *
 *  1. INSUFFICIENT BASELINE IS A FIRST-CLASS STATE. When there is not enough
 *     history to establish a baseline, the detector emits a signal whose
 *     `state` is "insufficient_baseline" — never an anomaly, never a silent
 *     drop. The operator can see that the system is still learning.
 *
 *  2. AUTONOMY IS CAPPED. Every signal declares the highest action level the
 *     system may take for it: OBSERVE, EXPLAIN, RECOMMEND, PREPARE. Nothing in
 *     Phase 5 may execute a change; preparation still routes through the Safe
 *     Action Executor with operator confirmation.
 *
 * Language contract (enforced by tests): anomalies describe DEVIATION and
 * TEMPORAL ASSOCIATION. They never say "caused by", "because of the change",
 * "will happen again", "root cause", or "guaranteed".
 */

import type { ConfidenceClass, PatternEvidenceRef } from "./pattern-intelligence";

export const ANOMALY_SCHEMA_VERSION = 1;

export const ANOMALY_TYPES = [
  "activity_spike",
  "issue_concentration",
  "quiet_to_active",
  "duration_anomaly",
  "reopen_escalation_drift",
  "recurrence_acceleration",
  "post_change_activity",
  "script_structure_drift",
] as const;
export type AnomalyType = (typeof ANOMALY_TYPES)[number];

/** A signal is either a real deviation or an explicit "still learning" state. */
export type AnomalySignalState = "anomaly" | "insufficient_baseline";

export type AnomalySeverity = "info" | "notice" | "elevated";

/**
 * Autonomy ceiling. Phase 5 never exceeds "prepare", and "prepare" means
 * assembling a proposal the operator must confirm — not applying it.
 */
export const AUTONOMY_LEVELS = ["observe", "explain", "recommend", "prepare"] as const;
export type AutonomyLevel = (typeof AUTONOMY_LEVELS)[number];

/** Which robust dispersion measure carried the comparison. */
export type BaselineMethod = "mad" | "iqr" | "none";

/** Why a baseline could not be established. */
export type InsufficientReason =
  | "too_few_samples"
  | "too_few_active_periods"
  | "no_dispersion"
  | "no_prior_history"
  | "coverage_below_threshold";

export interface BaselineSummary {
  /** What was measured, e.g. "events/day". */
  metric: string;
  windowDays: number;
  /** Periods (usually days) contributing to the baseline. */
  sampleCount: number;
  /** Periods with non-zero activity — guards against an all-zero "baseline". */
  nonZeroCount: number;
  median: number;
  /** Median absolute deviation (robust spread). */
  mad: number;
  /** Interquartile range (robust spread fallback). */
  iqr: number;
  /** Normalised scale actually used for the deviation score. */
  scale: number;
  method: BaselineMethod;
}

export interface AnomalyDeviation {
  observed: number;
  /** Robust (median/MAD or median/IQR) z-score. Null when not computable. */
  robustZ: number | null;
  /** observed / median, when the median is > 0. */
  ratio: number | null;
}

export interface AnomalySignal {
  id: string;
  schemaVersion: number;
  anomalyType: AnomalyType;
  accountId: string;
  state: AnomalySignalState;
  title: string;
  /** Careful, non-causal description of the deviation (or of the gap). */
  description: string;
  /** Present for both states; for "insufficient_baseline" it shows the gap. */
  baseline: BaselineSummary;
  deviation: AnomalyDeviation;
  /** Set only when state is "insufficient_baseline". */
  insufficientReason?: InsufficientReason;
  severity: AnomalySeverity;
  confidence: ConfidenceClass;
  windowDays: number;
  sourceCount: number;
  evidenceRefs: PatternEvidenceRef[];
  autonomy: AutonomyLevel;
  firstObservedAt: string;
  lastObservedAt: string;
  generatedAt: string;
  recalcAfterMs: number;
}

/**
 * Tunable thresholds. Conservative on purpose: an anomaly surface that cries
 * wolf is worse than one that stays quiet.
 */
export const ANOMALY_CONFIG = {
  /** Daily buckets considered when establishing a baseline. */
  baselineWindowDays: 56,
  /** Below this many buckets, no baseline exists. */
  minBaselineDays: 14,
  /** Below this many ACTIVE buckets, an "average of nothing" is not a baseline. */
  minActivePeriods: 5,
  /** Modified z-score at which a deviation is reportable (Iglewicz–Hoaglin). */
  robustZThreshold: 3.5,
  /** Modified z-score at which a deviation is elevated. */
  robustZElevated: 5,
  /** A spike must also clear this absolute floor, so 0→2 is not "a spike". */
  minSpikeCount: 3,

  concentrationWindowDays: 7,
  concentrationPriorDays: 90,
  concentrationMinTickets: 4,
  concentrationMinPriorTickets: 8,
  /** Share of recent tickets held by one classification. */
  concentrationDominance: 0.6,
  /** Recent share must exceed the historical share by this factor. */
  concentrationLift: 1.5,

  quietDays: 14,
  quietReactivationMin: 3,

  durationMinSamples: 8,

  driftWindowDays: 30,
  driftPriorDays: 90,
  driftMinRecent: 3,
  driftRateRatio: 2,

  recurrenceMinIntervals: 4,
  /** Latest gap at or below this fraction of the median gap = acceleration. */
  recurrenceAccelerationRatio: 0.5,

  postChangeWindowDays: 3,
  postChangeLookbackDays: 21,
  postChangeMultiplier: 2,
  postChangeMinCount: 3,

  /** Structural anomalies stay dormant below this extractor coverage. */
  scriptMinCoverage: 0.6,
  scriptMinVersions: 3,

  recalcAfterMs: 6 * 60 * 60 * 1000,
} as const;

const DAY_MS = 24 * 60 * 60 * 1000;
export const ANOMALY_DAY_MS = DAY_MS;

/**
 * Forbidden phrasing — the ASSERTION forms of causation and prediction.
 * Mirrors the Phase 3 pattern contract so both engines speak the same way.
 */
export const FORBIDDEN_ANOMALY_PHRASES = [
  "caused by",
  "because of the change",
  "will happen again",
  "root cause",
  "guaranteed",
  "predicts",
] as const;

export const ANOMALY_TYPE_LABEL: Record<AnomalyType, string> = {
  activity_spike: "Activity spike",
  issue_concentration: "Issue concentration",
  quiet_to_active: "Quiet → active",
  duration_anomaly: "Duration deviation",
  reopen_escalation_drift: "Reopen / escalation drift",
  recurrence_acceleration: "Recurrence acceleration",
  post_change_activity: "Post-change activity",
  script_structure_drift: "Script structure drift",
};

export const INSUFFICIENT_REASON_LABEL: Record<InsufficientReason, string> = {
  too_few_samples: "not enough recorded history yet",
  too_few_active_periods: "too few days with any activity to compare against",
  no_dispersion: "history is too uniform to measure deviation reliably",
  no_prior_history: "no earlier period to compare this one against",
  coverage_below_threshold: "structural reading of the script is too partial to trust",
};

export function isAnomaly(s: AnomalySignal): boolean {
  return s.state === "anomaly";
}

export function isInsufficientBaseline(s: AnomalySignal): boolean {
  return s.state === "insufficient_baseline";
}
