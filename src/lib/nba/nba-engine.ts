/**
 * Phase 14 — Next-Best-Action Engine.
 *
 * Composes Phase 10-13 (Portal Context, Reality Boundary/Evidence Graph,
 * Operational Memory, Curated Knowledge) into ONE deterministic answer to:
 * "given the current verified state, what is the most useful thing to consider
 * next?" — while preserving uncertainty and operator control.
 *
 * The engine has NO mutation authority. Writable suggestions only ever prepare
 * a Safe Action proposal.
 */

import type { PortalContextEnvelope } from "@/lib/core/portal-context";
import {
  emptyEpisode,
  emptyResult,
  isInformationGathering,
  type NbaResult,
  type NextBestAction,
  type Prediction,
  type WorkEpisodeSignals,
} from "./nba-contract";
import { buildWorkProgress, contextKeyFor, episodeKeyFor, type WorkProgressState } from "./work-progress";
import { generateCandidates } from "./candidates";
import { evaluateGate } from "./gate";
import { bandForScore, scoreCandidate } from "./ranking";
import { capabilityForActionType } from "@/lib/capability/capability-registry";
import type { CapabilityAvailability } from "@/lib/capability/capability-contract";

export interface NbaInput {
  envelope: PortalContextEnvelope;
  episode?: WorkEpisodeSignals;
  now?: number;
  permissions?: { canPrepareWrites?: boolean };
  /** Phase 16 — resolved capability availability for this context. */
  capabilities?: Record<string, { availability: CapabilityAvailability; note?: string }>;
}

/** Score threshold below which the engine prefers honesty over a card. */
export const MIN_RECOMMENDATION_SCORE = 0.3;

function highUncertainty(progress: WorkProgressState, env: PortalContextEnvelope): boolean {
  if ((env.evidenceConflicts ?? []).some((c) => c.status === "unresolved")) return true;
  if (progress.verifiedFacts.length === 0) return true;
  return progress.remainingChecks.length > progress.completedChecks.length;
}

function predictionsFrom(progress: WorkProgressState): Prediction[] {
  return progress.currentHypotheses.map((h) => ({
    id: `p:${h.id}`,
    hypothesis: h.statement,
    probabilityBand:
      h.status === "supported" ? "likely" : h.conflictingEvidence.length ? "unlikely" : "possible",
    basis: h.stillNeeded,
    evidenceRefs: h.supportingEvidence,
    conflicts: h.conflictingEvidence,
    status: h.status === "confirmed" ? "confirmed" : h.status === "rejected" ? "rejected" : h.status === "supported" ? "supported" : "unverified",
  }));
}

/**
 * Deterministic end-to-end computation. Pure: no stores, no clock beyond
 * `now`, no network, no AI. AI may only enrich the explanation afterwards.
 */
export function computeNextBestAction(input: NbaInput): NbaResult {
  const env = input.envelope;
  const now = input.now ?? Date.now();
  const generatedAt = new Date(now).toISOString();
  const episode = input.episode ?? emptyEpisode(episodeKeyFor(env));
  const contextKey = contextKeyFor(env);
  const permissions = { canPrepareWrites: input.permissions?.canPrepareWrites ?? true };

  const progress = buildWorkProgress(env, episode, now);
  const base = emptyResult(contextKey, episode.episodeKey, generatedAt);
  base.missingEvidence = progress.missingEvidence;
  base.hypotheses = progress.currentHypotheses;
  base.predictions = predictionsFrom(progress);
  base.degraded = env.warnings.some((w) => w.code === "context_degraded" || w.code === "source_unavailable");

  const uncertain = highUncertainty(progress, env);
  const raw = generateCandidates({ envelope: env, progress, episode, generatedAt });

  const scored: NextBestAction[] = raw.map((rawCandidate) => {
    // Every prepared mutation is described by exactly one governed capability.
    const capabilityId = rawCandidate.proposedSafeAction
      ? capabilityForActionType(rawCandidate.proposedSafeAction.type)?.id
      : rawCandidate.capabilityId;
    const candidate: NextBestAction = capabilityId
      ? { ...rawCandidate, capabilityId }
      : rawCandidate;
    const verdict = evaluateGate(candidate, {
      envelope: env,
      progress,
      episode,
      permissions,
      now,
      ...(input.capabilities ? { capabilities: input.capabilities } : {}),
    });
    const reasonCodes = Array.from(new Set([...candidate.reasonCodes, ...verdict.reasonCodes]));
    const risk = verdict.state === "blocked" ? "BLOCKED" : candidate.risk;
    const { score, contributions } = scoreCandidate({
      source: candidate.source,
      reasonCodes,
      risk,
      evidenceConfidence: candidate.evidenceConfidence,
      kind: candidate.kind,
      highUncertainty: uncertain,
    });
    return {
      ...candidate,
      state: verdict.state,
      blockers: verdict.blockers,
      reasonCodes,
      risk,
      score,
      contributions,
      confidence: bandForScore(score, candidate.evidenceConfidence === "verified"),
      explanation: verdict.note ? `${candidate.explanation} ${verdict.note}` : candidate.explanation,
      expiresAt: undefined,
    };
  });

  const sorted = [...scored].sort(
    (a, b) => b.score - a.score || a.fingerprint.localeCompare(b.fingerprint),
  );
  base.candidates = sorted;
  base.blocked = sorted.filter((c) => c.state === "blocked");

  const eligible = sorted.filter((c) => c.state === "recommended" && c.score >= MIN_RECOMMENDATION_SCORE);

  // Verification always outranks mutation while uncertainty is high (§43).
  const ranked = uncertain
    ? [
        ...eligible.filter((c) => isInformationGathering(c.kind)),
        ...eligible.filter((c) => !isInformationGathering(c.kind)),
      ]
    : eligible;

  if (!ranked.length) {
    // Pending external dependency and nothing useful to do => WAIT (§26).
    if (progress.pending.length) {
      return {
        ...base,
        outcome: "wait",
        waitReason: `Waiting on ${progress.pending[0].label}. No additional operational action is recommended right now.`,
        noRecommendationReason: undefined,
      };
    }
    return {
      ...base,
      outcome: "no_recommendation",
      noRecommendationReason: progress.evidenceStarved
        ? "There is not enough evidence yet to recommend a next action."
        : base.blocked.length
          ? "Every candidate next step is currently blocked."
          : "No sufficiently grounded next step is available right now.",
    };
  }

  const [primary, ...rest] = ranked;
  return {
    ...base,
    outcome: "recommended",
    primary: { ...primary, expiresAt: undefined },
    alternatives: rest.slice(0, 2),
    noRecommendationReason: undefined,
  };
}

/** A stored result is stale as soon as the context identity changes (§47). */
export function isResultStale(result: NbaResult, env: PortalContextEnvelope): boolean {
  return result.contextKey !== contextKeyFor(env) || result.episodeKey !== episodeKeyFor(env);
}

export { contextKeyFor, episodeKeyFor };