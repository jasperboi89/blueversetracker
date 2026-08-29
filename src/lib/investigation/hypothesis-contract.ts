/**
 * ACCOUNT COMMAND CENTER — Phase 8: Causal Hypothesis Engine, canonical contract.
 *
 * This module defines the ONLY vocabulary Phase 8 is allowed to speak. It sits
 * beside — never on top of — the earlier layers, and it deliberately keeps six
 * things apart:
 *
 *   OBSERVATION        something canonical operational data directly supports
 *   PATTERN            repeated/related observations (Phase 3)
 *   ANOMALY            deviation from an established baseline (Phase 5)
 *   FORECAST           comparable-state future estimate (Phase 6)
 *   SIMULATION RESULT  deterministic structural outcome under stated inputs (Phase 7)
 *   HYPOTHESIS         a proposed explanation that MIGHT account for observations
 *   VERIFIED CAUSE     a causal relationship supported by discriminating evidence
 *
 * A hypothesis is never a verified cause merely because it ranks first. The
 * verification rule lives in `hypothesis-strength.ts` and is deterministic:
 * no AI, no ranking heuristic and no operator opinion can set VERIFIED alone.
 *
 * Storage carries STRUCTURE ONLY: mechanisms as short structured statements,
 * entity/evidence/test references, statuses and lifecycle. Never ticket bodies,
 * script source, PHI, credentials or chain-of-thought.
 */

import type { EvidenceEntityRef } from "@/lib/core/evidence-contract";
import type { AutonomyLevel } from "@/lib/core/anomaly-contract";

export const INVESTIGATION_SCHEMA_VERSION = 1;
export const HYPOTHESIS_CALC_VERSION = 1;

/** Phase 8 autonomy ceiling. The engine may prepare; it may never act. */
export const INVESTIGATION_AUTONOMY_CAP: AutonomyLevel = "prepare";

/* ------------------------------------------------------------------ */
/* Part 3 — hypothesis families                                        */
/* ------------------------------------------------------------------ */

export const HYPOTHESIS_TYPES = [
  "configuration_script_path",
  "data_state",
  "routing_business_rule",
  "timing_schedule",
  "integration_system",
  "workflow_process",
  "unknown",
] as const;
export type HypothesisType = (typeof HYPOTHESIS_TYPES)[number];

export const HYPOTHESIS_TYPE_LABEL: Record<HypothesisType, string> = {
  configuration_script_path: "Configuration / script path",
  data_state: "Data / state",
  routing_business_rule: "Routing / business rule",
  timing_schedule: "Timing / schedule",
  integration_system: "Integration / system",
  workflow_process: "Workflow / process",
  unknown: "Mechanism not yet supported by evidence",
};

/* ------------------------------------------------------------------ */
/* Part 2 — lifecycle                                                  */
/* ------------------------------------------------------------------ */

export const HYPOTHESIS_STATUSES = [
  "proposed",
  "supported",
  "weakened",
  "contradicted",
  "rejected",
  "verified",
  "insufficient_evidence",
  "expired",
] as const;
export type HypothesisStatus = (typeof HYPOTHESIS_STATUSES)[number];

export const HYPOTHESIS_STATUS_LABEL: Record<HypothesisStatus, string> = {
  proposed: "Proposed",
  supported: "Supported",
  weakened: "Weakened",
  contradicted: "Contradicted",
  rejected: "Rejected",
  verified: "Verified cause",
  insufficient_evidence: "Insufficient evidence",
  expired: "Expired",
};

/* ------------------------------------------------------------------ */
/* Parts 7 & 19 — interpretable strength classes                        */
/* ------------------------------------------------------------------ */

/** Part 7 — how strongly ONE piece of evidence bears on a hypothesis. */
export const EVIDENCE_STRENGTHS = ["direct", "strong", "supporting", "weak", "unknown"] as const;
export type EvidenceStrength = (typeof EVIDENCE_STRENGTHS)[number];

export const EVIDENCE_STRENGTH_WEIGHT: Record<EvidenceStrength, number> = {
  direct: 4,
  strong: 3,
  supporting: 2,
  weak: 1,
  unknown: 0,
};

/** Part 19 — overall interpretable strength of a hypothesis. No percentages. */
export const HYPOTHESIS_STRENGTHS = [
  "insufficient",
  "weak",
  "plausible",
  "supported",
  "strongly_supported",
  "verified",
] as const;
export type HypothesisStrengthClass = (typeof HYPOTHESIS_STRENGTHS)[number];

export const HYPOTHESIS_STRENGTH_RANK: Record<HypothesisStrengthClass, number> = {
  insufficient: 0,
  weak: 1,
  plausible: 2,
  supported: 3,
  strongly_supported: 4,
  verified: 5,
};

export const HYPOTHESIS_STRENGTH_LABEL: Record<HypothesisStrengthClass, string> = {
  insufficient: "Insufficient evidence",
  weak: "Weak",
  plausible: "Plausible",
  supported: "Supported",
  strongly_supported: "Strongly supported",
  verified: "Verified",
};

/** Confidence in the reading itself, reusing the portal's shared vocabulary. */
export type HypothesisConfidence = "high" | "medium" | "low";

/* ------------------------------------------------------------------ */
/* Part 32 — necessity / sufficiency language                           */
/* ------------------------------------------------------------------ */

export const RELATION_CLAIMS = [
  "associated",
  "possibly_contributing",
  "necessary_under_tested_conditions",
  "sufficient_under_tested_conditions",
] as const;
export type RelationClaim = (typeof RELATION_CLAIMS)[number];

export const RELATION_CLAIM_LABEL: Record<RelationClaim, string> = {
  associated: "Associated",
  possibly_contributing: "Possibly contributing",
  necessary_under_tested_conditions: "Necessary under tested conditions",
  sufficient_under_tested_conditions: "Sufficient under tested conditions",
};

/**
 * Phrases Phase 8 must never emit outside an explicit negation. Enforced by
 * tests over generated titles, mechanisms, rationales and UI copy constants.
 */
export const FORBIDDEN_CAUSAL_PHRASES = [
  "root cause is",
  "this proves",
  "definitely caused",
  "caused by",
  "because of the change",
  "guaranteed",
  "certainly",
] as const;

/* ------------------------------------------------------------------ */
/* Parts 6 & 21 — evidence links                                        */
/* ------------------------------------------------------------------ */

export type EvidenceStance = "supports" | "contradicts" | "unresolved";

/** Where an item of investigation evidence came from. Reference only. */
export const INVESTIGATION_EVIDENCE_SOURCES = [
  "event_ledger",
  "pattern_intelligence",
  "anomaly",
  "forecast",
  "script_structure",
  "dependency_graph",
  "simulation",
  "counterfactual_simulation",
  "resolution_memory",
  "test_result",
  "operator_input",
  "counterexample",
  "natural_comparison",
] as const;
export type InvestigationEvidenceSource = (typeof INVESTIGATION_EVIDENCE_SOURCES)[number];

export interface HypothesisEvidenceLink {
  id: string;
  hypothesisId: string;
  stance: EvidenceStance;
  strength: EvidenceStrength;
  source: InvestigationEvidenceSource;
  /** Short structured statement. Never a body, never model prose. */
  statement: string;
  /** Canonical references back to the systems that own the data. */
  refs: EvidenceEntityRef[];
  /** Evidence Graph fact ids where one exists. */
  factIds?: string[];
  observedAt?: string;
  recordedAt: string;
  /** True when this link records a case where the symptom or mechanism
   *  occurred WITHOUT the other (Part 33). Counterexamples are first-class. */
  counterexample?: boolean;
}

/* ------------------------------------------------------------------ */
/* Part 9 — predictions                                                 */
/* ------------------------------------------------------------------ */

export type PredictionOutcome = "unobserved" | "confirmed" | "refuted" | "indeterminate";

export interface HypothesisPrediction {
  id: string;
  /** What we would expect to observe IF the hypothesis were true. */
  statement: string;
  /** How the expectation can be checked. */
  observable: string;
  outcome: PredictionOutcome;
  /** Test that produced the outcome, when one did. */
  testId?: string;
  recordedAt?: string;
}

/* ------------------------------------------------------------------ */
/* Parts 10 & 11 — discriminating tests                                 */
/* ------------------------------------------------------------------ */

export const TEST_UTILITY_CLASSES = ["high_value", "useful", "low_discrimination", "blocked"] as const;
export type TestUtilityClass = (typeof TEST_UTILITY_CLASSES)[number];

export const TEST_UTILITY_LABEL: Record<TestUtilityClass, string> = {
  high_value: "High value",
  useful: "Useful",
  low_discrimination: "Low discrimination",
  blocked: "Blocked",
};

export type TestCost = "low" | "moderate" | "high";
export type TestSafety = "safe" | "caution" | "unsafe";

export interface TestUtility {
  klass: TestUtilityClass;
  /** How many hypotheses this test separates. */
  hypothesesDistinguished: number;
  informationGain: "high" | "moderate" | "low" | "none";
  cost: TestCost;
  safety: TestSafety;
  reversible: boolean;
  productionRisk: "none" | "low" | "elevated";
  /** Prerequisites that are not currently available. Non-empty ⇒ blocked. */
  missingPrerequisites: string[];
  /** Plain reasons the class was assigned. No invented numbers. */
  rationale: string[];
}

export type TestResultOutcome = "not_run" | "match" | "mismatch" | "inconclusive";

/** One branch of a discriminating test and what it would mean. */
export interface DiscriminatingOutcome {
  key: string;
  /** Observable branch, e.g. "forward flow good, back navigation bad". */
  description: string;
  /** Deterministic mapping — never an AI reading. */
  strengthens: string[];
  weakens: string[];
}

export interface DiscriminatingTest {
  id: string;
  investigationId: string;
  title: string;
  /** Hypotheses this test is designed to separate. */
  hypothesisIds: string[];
  /** Predictions the test checks, by prediction id. */
  predictionIds: string[];
  /** Exact steps an operator would run. Preparation only. */
  steps: string[];
  requiredInputs: string[];
  safetyBoundary: string;
  utility: TestUtility;
  outcomes: DiscriminatingOutcome[];
  /** Simulation scenario id when the test has a structural counterpart. */
  simulationScenarioId?: string;
  /** Prepared Test Intelligence case id (Phase 4 reuse — no second framework). */
  regressionCaseId?: string;
  status: "prepared" | "recorded" | "superseded";
  result?: {
    outcomeKey: string;
    outcome: TestResultOutcome;
    notes?: string;
    recordedAt: string;
    recordedBy: "operator";
  };
  preparedAt: string;
}

/* ------------------------------------------------------------------ */
/* Part 1 — the hypothesis                                              */
/* ------------------------------------------------------------------ */

export const HYPOTHESIS_ORIGINS = [
  "deterministic_rule",
  "script_intelligence",
  "pattern_intelligence",
  "anomaly",
  "forecast",
  "resolution_memory",
  "historical_incident",
  "simulation",
  "operator",
  "ai_proposed",
] as const;
export type HypothesisOrigin = (typeof HYPOTHESIS_ORIGINS)[number];

export interface HypothesisAssumption {
  id: string;
  statement: string;
  verified: boolean;
}

export interface Hypothesis {
  id: string;
  investigationId: string;
  accountId: string;
  hypothesisType: HypothesisType;
  title: string;
  /** One-sentence statement of the explanation. */
  statement: string;
  /** What it is trying to explain — observation ids from the investigation. */
  explains: string[];
  /** Structured mechanism: how it would produce the observations. */
  mechanism: string;
  /** Precision about what the evidence supports (Part 32). */
  relationClaim: RelationClaim;
  assumptions: HypothesisAssumption[];
  predictions: HypothesisPrediction[];
  status: HypothesisStatus;
  strength: HypothesisStrengthClass;
  confidence: HypothesisConfidence;
  origin: HypothesisOrigin;
  /** Why the strength lands where it does. Deterministic, inspectable. */
  strengthRationale: string[];
  autonomy: AutonomyLevel;
  createdAt: string;
  updatedAt: string;
  hypothesisVersion: number;
  calcVersion: number;
  schemaVersion: number;
  /** How reading changes if a key assumption fails. */
  sensitivity?: string;
  /**
   * Part 35 — when the canonical rule was satisfied. A verified conclusion is
   * still challengeable: this timestamp is never cleared, so a later
   * contradiction reopens the hypothesis WITHOUT erasing that it was verified.
   */
  verifiedAt?: string;
  /** Set when new contradictory evidence reopened a previously verified reading. */
  verificationReopenedAt?: string;
}


/* ------------------------------------------------------------------ */
/* Parts 22 / 30 / 37 — the investigation                               */
/* ------------------------------------------------------------------ */

export interface InvestigationObservation {
  id: string;
  /** What happened, in canonical operational terms. */
  statement: string;
  source: InvestigationEvidenceSource;
  refs: EvidenceEntityRef[];
  observedAt?: string;
  recordedAt: string;
}

export const INVESTIGATION_CONCLUSIONS = [
  "cause_verified",
  "most_supported_explanation",
  "multiple_plausible_explanations",
  "hypotheses_rejected",
  "insufficient_evidence",
] as const;
export type InvestigationConclusionKind = (typeof INVESTIGATION_CONCLUSIONS)[number];

export const INVESTIGATION_CONCLUSION_LABEL: Record<InvestigationConclusionKind, string> = {
  cause_verified: "Cause verified",
  most_supported_explanation: "Most supported explanation",
  multiple_plausible_explanations: "Multiple plausible explanations",
  hypotheses_rejected: "Hypotheses rejected",
  insufficient_evidence: "No supported causal explanation yet",
};

export interface InvestigationConclusion {
  kind: InvestigationConclusionKind;
  /** Leading hypothesis id — leading is NOT verified. */
  leadingHypothesisId?: string;
  summary: string;
  /** What would move the investigation forward. */
  nextStep?: string;
  evaluatedAt: string;
}

export const INVESTIGATION_TIMELINE_KINDS = [
  "investigation_created",
  "observation_added",
  "hypothesis_proposed",
  "hypothesis_updated",
  "evidence_linked",
  "test_prepared",
  "test_result_recorded",
  "hypothesis_strengthened",
  "hypothesis_weakened",
  "hypothesis_rejected",
  "hypothesis_verified",
  "conclusion_updated",
] as const;
export type InvestigationTimelineKind = (typeof INVESTIGATION_TIMELINE_KINDS)[number];

/** Append-only. History is never rewritten (Parts 25 & 48). */
export interface InvestigationTimelineEntry {
  id: string;
  kind: InvestigationTimelineKind;
  at: string;
  summary: string;
  hypothesisId?: string;
  testId?: string;
  evidenceId?: string;
  /** Structural context frozen at the time of the entry (Part 48). */
  context?: { scriptFingerprint?: string; scriptVersionId?: string };
}

export type InvestigationStatus = "open" | "concluded" | "archived";

export interface Investigation {
  id: string;
  accountId: string;
  /** Ticket / dispatch / work record the investigation hangs off, if any. */
  contextRef?: EvidenceEntityRef;
  title: string;
  status: InvestigationStatus;
  observations: InvestigationObservation[];
  hypotheses: Hypothesis[];
  evidence: HypothesisEvidenceLink[];
  tests: DiscriminatingTest[];
  timeline: InvestigationTimelineEntry[];
  conclusion: InvestigationConclusion;
  /** Structural context captured when the investigation opened (Part 48). */
  scriptContext?: { versionId?: string; fingerprint?: string; recognition?: number };
  openedBy: "operator" | "system";
  createdAt: string;
  updatedAt: string;
  autonomy: AutonomyLevel;
  calcVersion: number;
  schemaVersion: number;
}

/* ------------------------------------------------------------------ */
/* Helpers                                                              */
/* ------------------------------------------------------------------ */

export function evidenceFor(
  inv: Pick<Investigation, "evidence">,
  hypothesisId: string,
  stance: EvidenceStance,
): HypothesisEvidenceLink[] {
  return inv.evidence.filter((e) => e.hypothesisId === hypothesisId && e.stance === stance);
}

/** True when the hypothesis carries at least one unresolved contradiction. */
export function hasOpenContradiction(
  inv: Pick<Investigation, "evidence">,
  hypothesisId: string,
): boolean {
  return evidenceFor(inv, hypothesisId, "contradicts").length > 0;
}

/**
 * Guard used by tests and by the AI boundary: reject text that asserts a cause
 * outside the canonical verification rule. Negations ("this does not prove")
 * are allowed, since the engine's own copy explains what it is NOT claiming.
 */
export function containsForbiddenCausalClaim(text: string): boolean {
  const lower = text.toLowerCase();
  return FORBIDDEN_CAUSAL_PHRASES.some((p) => {
    let from = 0;
    for (;;) {
      const at = lower.indexOf(p, from);
      if (at < 0) return false;
      const before = lower.slice(Math.max(0, at - 40), at);
      const negated = /\b(not|never|no|cannot|isn't|does not|doesn't|without)\b[^.]*$/.test(before);
      if (!negated) return true;
      from = at + p.length;
    }
  });
}
