/**
 * Intelligence Core — Phase 14: Next-Best-Action contract.
 *
 * A recommendation is NOT truth, NOT permission and NOT a diagnosis. Every
 * type here carries provenance, uncertainty and the reason it exists, so the
 * operator (and the tests) can always answer "why did this appear?".
 *
 * This module deliberately depends only on the canonical Evidence contract and
 * the Safe Action Executor contract — never on stores, React or the AI layer.
 */

import type { ActionType, ActionPayloadMap } from "@/lib/core/actions";
import type { EvidenceConfidence, EvidenceEntityRef } from "@/lib/core/evidence-contract";

/* ------------------------------------------------------------------ */
/* Kinds, risk, reason codes                                           */
/* ------------------------------------------------------------------ */

export const NBA_KINDS = [
  "VERIFY",
  "CHECK",
  "COMPARE",
  "LOOK_UP",
  "REVIEW",
  "CONTACT",
  "DOCUMENT",
  "FOLLOW_UP",
  "RESUME",
  "ESCALATE",
  "PREPARE_ACTION",
  "WAIT",
  "NO_ACTION",
] as const;
export type NextBestActionKind = (typeof NBA_KINDS)[number];

/** Information-gathering kinds are always preferred while uncertainty is high. */
export const INFORMATION_KINDS: readonly NextBestActionKind[] = [
  "VERIFY",
  "CHECK",
  "COMPARE",
  "LOOK_UP",
  "REVIEW",
];

export function isInformationGathering(kind: NextBestActionKind): boolean {
  return INFORMATION_KINDS.includes(kind);
}

/** Deterministic risk tiers for a *suggestion* (the executor keeps its own). */
export type NbaRisk = "LOW" | "MEDIUM" | "HIGH" | "BLOCKED";

export type ConfidenceBand = "high" | "medium" | "low";

export const NBA_REASON_CODES = [
  "MISSING_REQUIRED_CHECK",
  "VERIFIED_PROCEDURE_STEP",
  "RELATED_RESOLUTION",
  "UNRESOLVED_BLOCKER",
  "PRIOR_FAILED_ACTION",
  "CONFLICT_REQUIRES_VERIFICATION",
  "RESUMED_UNRESOLVED_EPISODE",
  "CURRENT_ACCOUNT_MATCH",
  "LOW_RISK_INFORMATION_GAIN",
  "STALE_GUIDANCE",
  "OPERATIONAL_MEMORY_PATTERN",
  "SIMILAR_PRIOR_WORK",
  "UNSAVED_WORK",
  "AWARENESS_CONDITION",
  "PENDING_EXTERNAL_DEPENDENCY",
  "PROCEDURE_DIVERGENCE",
  "ALREADY_ATTEMPTED",
  "ALREADY_COMPLETED",
  "DISMISSED_BY_OPERATOR",
  "INSUFFICIENT_EVIDENCE",
  "PERMISSION_REQUIRED",
  "MUTATION_BEFORE_VERIFICATION",
] as const;
export type NbaReasonCode = (typeof NBA_REASON_CODES)[number];

/* ------------------------------------------------------------------ */
/* Supporting structures                                               */
/* ------------------------------------------------------------------ */

export interface ActionPrerequisite {
  id: string;
  label: string;
  satisfied: boolean;
}

export interface ActionBlocker {
  id: string;
  /** Blocker type from the portal, or an engine-level code. */
  type: string;
  label: string;
}

export interface MissingEvidence {
  id: string;
  label: string;
  predicate?: string;
  subject?: EvidenceEntityRef;
}

/** A mutation is only ever *prepared*; the executor remains the write path. */
export interface SafeActionProposal<T extends ActionType = ActionType> {
  type: T;
  payload: ActionPayloadMap[T];
  reason: string;
  requiresConfirmation: true;
}

export type NextBestActionState =
  | "candidate"
  | "recommended"
  | "blocked"
  | "completed"
  | "dismissed"
  | "expired";

export type NbaSource =
  | "deterministic"
  | "knowledge"
  | "memory"
  | "pattern"
  | "ai_assisted";

export interface ScoreContribution {
  code: NbaReasonCode | "BASE";
  weight: number;
}

export interface NextBestAction {
  id: string;
  /** Stable idempotency fingerprint: same next step -> same string. */
  fingerprint: string;
  kind: NextBestActionKind;
  title: string;
  explanation: string;
  target?: EvidenceEntityRef;
  state: NextBestActionState;
  confidence: ConfidenceBand;
  evidenceConfidence: EvidenceConfidence;
  evidenceRefs: string[];
  memoryRefs?: string[];
  knowledgeRefs?: string[];
  prerequisiteChecks: ActionPrerequisite[];
  blockers: ActionBlocker[];
  missingEvidence: MissingEvidence[];
  risk: NbaRisk;
  source: NbaSource;
  reasonCodes: NbaReasonCode[];
  /** Deterministic 0..1 score. Best available candidate — never proof. */
  score: number;
  contributions: ScoreContribution[];
  /** Conditions that would invalidate or change this recommendation. */
  whatWouldChangeThis: string[];
  generatedAt: string;
  expiresAt?: string;
  proposedSafeAction?: SafeActionProposal;
}

/* ------------------------------------------------------------------ */
/* Prediction + hypotheses                                             */
/* ------------------------------------------------------------------ */

export type ProbabilityBand = "unlikely" | "possible" | "likely";

export interface Prediction {
  id: string;
  hypothesis: string;
  probabilityBand: ProbabilityBand;
  basis: string[];
  evidenceRefs: string[];
  conflicts: string[];
  status: "unverified" | "supported" | "rejected" | "confirmed";
}

export type HypothesisStatus =
  | "proposed"
  | "supported"
  | "weakened"
  | "rejected"
  | "confirmed"
  | "expired";

export interface WorkHypothesis {
  id: string;
  statement: string;
  status: HypothesisStatus;
  supportingEvidence: string[];
  conflictingEvidence: string[];
  stillNeeded: string[];
  /** Working-state reasoning only — never written to Operational Memory here. */
  transient: true;
}

/* ------------------------------------------------------------------ */
/* Episode signals (what has already been tried in THIS work episode)  */
/* ------------------------------------------------------------------ */

export type AttemptOutcome = "attempted" | "succeeded" | "failed" | "no_effect";

export interface EpisodeAttempt {
  /** Candidate fingerprint this attempt corresponds to. */
  fingerprint: string;
  outcome: AttemptOutcome;
  at: string;
  /** Bounded, non-sensitive label. */
  label?: string;
  /** Increments when a state change since the attempt could justify a retry. */
  conditionsChangedAt?: string;
}

export interface EpisodeDismissal {
  fingerprint: string;
  at: string;
  reason?: "already_checked" | "not_relevant" | "not_applicable" | "wrong_context" | "other";
}

/**
 * Bounded projection of the current work episode. Contains fingerprints,
 * outcomes and timestamps only — never note bodies, values or caller data.
 */
export interface WorkEpisodeSignals {
  /** Identity of the work episode; changing it expires all recommendations. */
  episodeKey: string;
  startedAt?: string;
  /** Fingerprints of checks the operator has established this episode. */
  completedChecks: string[];
  attempts: EpisodeAttempt[];
  dismissed: EpisodeDismissal[];
  /** Last meaningful work-state transition, for conservative stuck detection. */
  lastTransitionAt?: string;
  /** Set when the operator explicitly asked "what next?". */
  explicitRequest?: boolean;
  /** True when resuming work carried over from an unresolved prior episode. */
  resumed?: boolean;
}

export function emptyEpisode(episodeKey: string): WorkEpisodeSignals {
  return { episodeKey, completedChecks: [], attempts: [], dismissed: [] };
}

/* ------------------------------------------------------------------ */
/* Engine output                                                       */
/* ------------------------------------------------------------------ */

export type NbaOutcome = "recommended" | "wait" | "no_recommendation";

export interface NbaResult {
  outcome: NbaOutcome;
  /** At most one. A flood of options is a failure mode, not a feature. */
  primary?: NextBestAction;
  alternatives: NextBestAction[];
  blocked: NextBestAction[];
  /** Everything generated, with scores — inspector/tests only. */
  candidates: NextBestAction[];
  hypotheses: WorkHypothesis[];
  predictions: Prediction[];
  missingEvidence: MissingEvidence[];
  /** Why the engine produced nothing, when it produced nothing. */
  noRecommendationReason?: string;
  waitReason?: string;
  /** Identity of the context this result belongs to; changes => expired. */
  contextKey: string;
  episodeKey: string;
  generatedAt: string;
  degraded: boolean;
}

export function emptyResult(contextKey: string, episodeKey: string, generatedAt: string): NbaResult {
  return {
    outcome: "no_recommendation",
    alternatives: [],
    blocked: [],
    candidates: [],
    hypotheses: [],
    predictions: [],
    missingEvidence: [],
    noRecommendationReason: "Not enough current evidence to recommend a next action.",
    contextKey,
    episodeKey,
    generatedAt,
    degraded: false,
  };
}

/** Stable fingerprint so the same next step is never worded five ways. */
export function actionFingerprint(kind: NextBestActionKind, subject: string, qualifier = ""): string {
  const slug = (s: string) =>
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 60);
  return [kind.toLowerCase(), slug(subject), qualifier ? slug(qualifier) : ""]
    .filter(Boolean)
    .join(":");
}