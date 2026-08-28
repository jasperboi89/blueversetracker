/**
 * Phase 8 — hypothesis strength + the canonical VERIFICATION RULE.
 *
 * Deterministic and inspectable. No probabilities are invented: strength is an
 * interpretable class derived from counted, weighted evidence classes,
 * prediction outcomes, discriminating-test results and assumption load.
 *
 * CALCULATION RULES (documented in docs/CAUSAL_HYPOTHESIS_ENGINE.md):
 *
 *   support   = Σ weight(strength) over SUPPORTS links
 *   against   = Σ weight(strength) over CONTRADICTS links, ×2 for counterexamples
 *   unresolved= count of UNRESOLVED links (never counted as support)
 *   net       = support − against
 *   + 2 per CONFIRMED prediction, − 3 per REFUTED prediction
 *   + 2 when a discriminating test result deterministically strengthens it
 *   − 3 when a discriminating test result deterministically weakens it
 *   − 1 per unverified assumption beyond the first two
 *
 * Bands (before caps):
 *   net ≤ 0 and no support        → insufficient
 *   net ≤ 1                       → weak
 *   net ≤ 3                       → plausible
 *   net ≤ 6                       → supported
 *   net  > 6                      → strongly_supported
 *
 * HARD CAPS, applied after banding:
 *   any REFUTED prediction or DIRECT contradiction → at most "weak"
 *   any open contradiction                          → at most "supported"
 *   no evidence at all                              → "insufficient"
 *   "verified" is NEVER produced here — only `evaluateVerification` can.
 */

import {
  EVIDENCE_STRENGTH_WEIGHT,
  HYPOTHESIS_STRENGTH_RANK,
  type DiscriminatingTest,
  type Hypothesis,
  type HypothesisConfidence,
  type HypothesisEvidenceLink,
  type HypothesisStatus,
  type HypothesisStrengthClass,
} from "./hypothesis-contract";

export interface StrengthAssessment {
  strength: HypothesisStrengthClass;
  confidence: HypothesisConfidence;
  status: HypothesisStatus;
  rationale: string[];
  counts: {
    supports: number;
    contradicts: number;
    unresolved: number;
    counterexamples: number;
    confirmedPredictions: number;
    refutedPredictions: number;
    testsStrengthening: number;
    testsWeakening: number;
    unverifiedAssumptions: number;
  };
}

function cap(
  s: HypothesisStrengthClass,
  ceiling: HypothesisStrengthClass,
): HypothesisStrengthClass {
  return HYPOTHESIS_STRENGTH_RANK[s] > HYPOTHESIS_STRENGTH_RANK[ceiling] ? ceiling : s;
}

export function assessStrength(
  hypothesis: Hypothesis,
  links: readonly HypothesisEvidenceLink[],
  tests: readonly DiscriminatingTest[],
): StrengthAssessment {
  const mine = links.filter((l) => l.hypothesisId === hypothesis.id);
  const supports = mine.filter((l) => l.stance === "supports");
  const contradicts = mine.filter((l) => l.stance === "contradicts");
  const unresolved = mine.filter((l) => l.stance === "unresolved");
  const counterexamples = contradicts.filter((l) => l.counterexample);

  let support = 0;
  for (const l of supports) support += EVIDENCE_STRENGTH_WEIGHT[l.strength];
  let against = 0;
  for (const l of contradicts) {
    against += EVIDENCE_STRENGTH_WEIGHT[l.strength] * (l.counterexample ? 2 : 1);
  }

  const confirmed = hypothesis.predictions.filter((p) => p.outcome === "confirmed").length;
  const refuted = hypothesis.predictions.filter((p) => p.outcome === "refuted").length;

  let testsStrengthening = 0;
  let testsWeakening = 0;
  for (const t of tests) {
    if (!t.result || t.status !== "recorded") continue;
    const branch = t.outcomes.find((o) => o.key === t.result?.outcomeKey);
    if (!branch) continue;
    if (branch.strengthens.includes(hypothesis.id)) testsStrengthening += 1;
    if (branch.weakens.includes(hypothesis.id)) testsWeakening += 1;
  }

  const unverifiedAssumptions = hypothesis.assumptions.filter((a) => !a.verified).length;
  const assumptionPenalty = Math.max(0, unverifiedAssumptions - 2);

  const net =
    support -
    against +
    confirmed * 2 -
    refuted * 3 +
    testsStrengthening * 2 -
    testsWeakening * 3 -
    assumptionPenalty;

  let strength: HypothesisStrengthClass;
  if (mine.length === 0 && confirmed === 0 && refuted === 0) strength = "insufficient";
  else if (support === 0 && net <= 0) strength = "insufficient";
  else if (net <= 1) strength = "weak";
  else if (net <= 3) strength = "plausible";
  else if (net <= 6) strength = "supported";
  else strength = "strongly_supported";

  const rationale: string[] = [];
  rationale.push(
    `${supports.length} supporting, ${contradicts.length} contradicting, ${unresolved.length} unresolved evidence link(s).`,
  );
  if (counterexamples.length > 0) {
    rationale.push(
      `${counterexamples.length} counterexample(s) recorded — cases where the expected pairing did not hold. Counterexamples count double against this explanation.`,
    );
  }
  if (confirmed > 0) rationale.push(`${confirmed} prediction(s) confirmed by observation.`);
  if (refuted > 0) {
    rationale.push(
      `${refuted} prediction(s) refuted — a failed prediction weakens this explanation and is not explained away.`,
    );
  }
  if (testsStrengthening > 0)
    rationale.push(`${testsStrengthening} discriminating test result(s) point toward it.`);
  if (testsWeakening > 0)
    rationale.push(`${testsWeakening} discriminating test result(s) point away from it.`);
  if (assumptionPenalty > 0)
    rationale.push(`${unverifiedAssumptions} unverified assumption(s) reduce the reading.`);

  const hasDirectContradiction = contradicts.some(
    (l) => l.strength === "direct" || l.strength === "strong",
  );
  if (refuted > 0 || hasDirectContradiction) {
    strength = cap(strength, "weak");
    rationale.push("Capped at weak: a refuted prediction or direct contradiction is outstanding.");
  } else if (contradicts.length > 0) {
    strength = cap(strength, "supported");
    rationale.push("Capped at supported: contradictory evidence is still unresolved.");
  }
  if (mine.length === 0) rationale.push("No evidence has been linked yet.");

  let status: HypothesisStatus;
  if (hypothesis.status === "rejected" || hypothesis.status === "expired") status = hypothesis.status;
  else if (hypothesis.status === "verified") status = "verified";
  else if (strength === "insufficient") status = contradicts.length > 0 ? "contradicted" : "insufficient_evidence";
  else if (hasDirectContradiction || refuted > 0) status = "contradicted";
  else if (contradicts.length > 0) status = "weakened";
  else if (strength === "supported" || strength === "strongly_supported") status = "supported";
  else status = "proposed";

  const confidence: HypothesisConfidence =
    strength === "strongly_supported" && unresolved.length === 0
      ? "high"
      : strength === "insufficient" || strength === "weak"
        ? "low"
        : "medium";

  return {
    strength,
    confidence,
    status,
    rationale,
    counts: {
      supports: supports.length,
      contradicts: contradicts.length,
      unresolved: unresolved.length,
      counterexamples: counterexamples.length,
      confirmedPredictions: confirmed,
      refutedPredictions: refuted,
      testsStrengthening,
      testsWeakening,
      unverifiedAssumptions,
    },
  };
}

/* ------------------------------------------------------------------ */
/* Part 20 — the verification rule                                      */
/* ------------------------------------------------------------------ */

export interface VerificationEvaluation {
  verified: boolean;
  /** Every requirement and whether it is met — always shown, never summarised away. */
  requirements: Array<{ id: string; label: string; met: boolean }>;
  unmet: string[];
}

/**
 * The ONLY path to VERIFIED. Deterministic; no AI, no ranking, no operator
 * override. Ranking first is explicitly not a requirement here, because being
 * the best available explanation is not evidence of being the correct one.
 */
export function evaluateVerification(
  hypothesis: Hypothesis,
  all: readonly Hypothesis[],
  links: readonly HypothesisEvidenceLink[],
  tests: readonly DiscriminatingTest[],
  options: { operatorConfirmed?: boolean; structuralCoverage?: number } = {},
): VerificationEvaluation {
  const mine = links.filter((l) => l.hypothesisId === hypothesis.id);
  const supports = mine.filter((l) => l.stance === "supports");
  const contradicts = mine.filter((l) => l.stance === "contradicts");

  const discriminating = tests.filter(
    (t) =>
      t.status === "recorded" &&
      t.result &&
      t.hypothesisIds.includes(hypothesis.id) &&
      t.outcomes.find((o) => o.key === t.result?.outcomeKey)?.strengthens.includes(hypothesis.id),
  );

  const competitors = all.filter((h) => h.id !== hypothesis.id);
  const competitorsClosed = competitors.every(
    (h) => h.status === "rejected" || h.status === "contradicted",
  );

  const requirements = [
    {
      id: "mechanism",
      label: "An explicit mechanism is represented (not 'unknown')",
      met: hypothesis.hypothesisType !== "unknown" && hypothesis.mechanism.trim().length >= 20,
    },
    {
      id: "direct_evidence",
      label: "At least one DIRECT or STRONG supporting evidence link",
      met: supports.some((l) => l.strength === "direct" || l.strength === "strong"),
    },
    {
      id: "discriminating_test",
      label: "A recorded discriminating test result points to this hypothesis",
      met: discriminating.length > 0,
    },
    {
      id: "predictions",
      label: "Its predictions were checked and none were refuted",
      met:
        hypothesis.predictions.some((p) => p.outcome === "confirmed") &&
        hypothesis.predictions.every((p) => p.outcome !== "refuted"),
    },
    {
      id: "competitors",
      label: "Every competing hypothesis is contradicted or rejected",
      met: competitors.length > 0 && competitorsClosed,
    },
    {
      id: "no_contradiction",
      label: "No unresolved contradictory evidence",
      met: contradicts.length === 0,
    },
    {
      id: "coverage",
      label: "Sufficient structural/data coverage (≥ 0.6 when a script is involved)",
      met:
        hypothesis.hypothesisType !== "configuration_script_path" ||
        (options.structuralCoverage ?? 0) >= 0.6,
    },
    {
      id: "operator",
      label: "Operator confirmation recorded",
      met: options.operatorConfirmed === true,
    },
  ];

  const unmet = requirements.filter((r) => !r.met).map((r) => r.label);
  return { verified: unmet.length === 0, requirements, unmet };
}

/** Rank for display. Leading ≠ verified; the UI must keep saying so. */
export function rankHypotheses(hypotheses: readonly Hypothesis[]): Hypothesis[] {
  return [...hypotheses].sort(
    (a, b) =>
      HYPOTHESIS_STRENGTH_RANK[b.strength] - HYPOTHESIS_STRENGTH_RANK[a.strength] ||
      a.title.localeCompare(b.title),
  );
}
