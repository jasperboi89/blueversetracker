/**
 * Phase 14 — deterministic ranking.
 *
 * All weights live here. A high score means "best available candidate", never
 * "this will fix the problem". No magic numbers in components or generators.
 */

import type {
  ConfidenceBand,
  NbaReasonCode,
  NbaRisk,
  NbaSource,
  NextBestAction,
  ScoreContribution,
} from "./nba-contract";
import { isInformationGathering } from "./nba-contract";

export const SOURCE_BASE: Record<NbaSource, number> = {
  deterministic: 0.5,
  knowledge: 0.45,
  memory: 0.28,
  pattern: 0.24,
  ai_assisted: 0.2,
};

/** Positive weights reward grounding; negatives punish weak or unsafe reasons. */
export const REASON_WEIGHTS: Record<NbaReasonCode, number> = {
  MISSING_REQUIRED_CHECK: 0.24,
  VERIFIED_PROCEDURE_STEP: 0.2,
  CONFLICT_REQUIRES_VERIFICATION: 0.26,
  UNRESOLVED_BLOCKER: 0.22,
  RESUMED_UNRESOLVED_EPISODE: 0.12,
  CURRENT_ACCOUNT_MATCH: 0.1,
  LOW_RISK_INFORMATION_GAIN: 0.08,
  RELATED_RESOLUTION: 0.07,
  AWARENESS_CONDITION: 0.06,
  UNSAVED_WORK: 0.05,
  PROCEDURE_DIVERGENCE: 0.05,
  PENDING_EXTERNAL_DEPENDENCY: 0.0,
  OPERATIONAL_MEMORY_PATTERN: -0.04,
  SIMILAR_PRIOR_WORK: -0.06,
  STALE_GUIDANCE: -0.1,
  PRIOR_FAILED_ACTION: -0.35,
  ALREADY_ATTEMPTED: -0.2,
  ALREADY_COMPLETED: -0.5,
  DISMISSED_BY_OPERATOR: -0.5,
  INSUFFICIENT_EVIDENCE: -0.2,
  PERMISSION_REQUIRED: -0.3,
  MUTATION_BEFORE_VERIFICATION: -0.3,
};

export const RISK_WEIGHTS: Record<NbaRisk, number> = {
  LOW: 0.08,
  MEDIUM: -0.04,
  HIGH: -0.18,
  BLOCKED: -0.6,
};

export const EVIDENCE_CONFIDENCE_WEIGHTS = {
  verified: 0.12,
  probable: 0.04,
  unknown: -0.08,
} as const;

/** Uncertainty tips the scale toward gathering information first (§43). */
export const UNCERTAINTY_INFORMATION_BONUS = 0.12;

export const CONFIDENCE_BANDS = { high: 0.7, medium: 0.45 } as const;

export function bandForScore(score: number, evidenceVerified: boolean): ConfidenceBand {
  if (score >= CONFIDENCE_BANDS.high && evidenceVerified) return "high";
  if (score >= CONFIDENCE_BANDS.medium) return "medium";
  return "low";
}

export interface ScoreInput {
  source: NbaSource;
  reasonCodes: readonly NbaReasonCode[];
  risk: NbaRisk;
  evidenceConfidence: "verified" | "probable" | "unknown";
  kind: NextBestAction["kind"];
  /** True when the current picture is weakly established. */
  highUncertainty: boolean;
}

export function scoreCandidate(input: ScoreInput): {
  score: number;
  contributions: ScoreContribution[];
} {
  const contributions: ScoreContribution[] = [{ code: "BASE", weight: SOURCE_BASE[input.source] }];
  for (const code of input.reasonCodes) {
    contributions.push({ code, weight: REASON_WEIGHTS[code] ?? 0 });
  }
  contributions.push({ code: "BASE", weight: RISK_WEIGHTS[input.risk] });
  contributions.push({ code: "BASE", weight: EVIDENCE_CONFIDENCE_WEIGHTS[input.evidenceConfidence] });
  if (input.highUncertainty && isInformationGathering(input.kind)) {
    contributions.push({ code: "LOW_RISK_INFORMATION_GAIN", weight: UNCERTAINTY_INFORMATION_BONUS });
  }
  const raw = contributions.reduce((sum, c) => sum + c.weight, 0);
  const score = Math.max(0, Math.min(1, Number(raw.toFixed(4))));
  return { score, contributions };
}