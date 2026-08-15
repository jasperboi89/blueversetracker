/**
 * Intelligence Core — Phase 15: Guarded Plan contract.
 *
 * A plan is an EXPLANATION of a possible route through the current work, not
 * an autonomous agent script. Nothing in this module executes anything:
 *
 *   - every step carries its provenance and the evidence it rests on,
 *   - every mutating step must be preceded by a verification step,
 *   - a step only ever *prepares* a Safe Action proposal,
 *   - progress advances only when the operator (or authoritative evidence)
 *     verifies the previous step.
 *
 * It depends only on the canonical contracts (Evidence, Safe Actions, NBA) —
 * never on stores, React or the AI layer.
 */

import type { EvidenceEntityRef } from "@/lib/core/evidence-contract";
import type { SafeActionProposal, NbaRisk } from "@/lib/nba/nba-contract";

/* ------------------------------------------------------------------ */
/* Steps                                                               */
/* ------------------------------------------------------------------ */

export type PlanStepKind = "VERIFY" | "PREPARE_ACTION" | "DOCUMENT" | "CONTACT" | "REVIEW";

export type PlanStepStatus =
  /** Earlier steps are not verified yet. */
  | "pending"
  /** Prerequisites satisfied and the gate allows the operator to start. */
  | "ready"
  /** Operator started it; the outcome is not established yet. */
  | "in_progress"
  /** Work claimed done, still needs verification before the plan advances. */
  | "awaiting_verification"
  | "verified"
  | "failed"
  | "skipped"
  | "blocked";

export type PlanStepDerivation = "structured" | "parsed" | "inferred" | "engine";

/** How a step's outcome may be established. Never "assume it worked". */
export type VerificationMethod =
  | "evidence_fact"
  | "operator_confirmation"
  | "none_available";

export interface VerificationRequirement {
  id: string;
  label: string;
  method: VerificationMethod;
  /** Predicate an authoritative fact would have to carry to satisfy this. */
  predicate?: string;
  subject?: EvidenceEntityRef;
}

export interface PlanStepBlocker {
  id: string;
  type: string;
  label: string;
}

export interface GuardedPlanStep {
  id: string;
  index: number;
  /** Stable across re-derivation — operator decisions are keyed on this. */
  fingerprint: string;
  kind: PlanStepKind;
  label: string;
  rationale: string;
  mutating: boolean;
  risk: NbaRisk;
  derivation: PlanStepDerivation;
  sourceType?: string;
  sourceId?: string;
  evidenceRefs: string[];
  /** Fingerprints of steps that must be verified before this one is ready. */
  prerequisites: string[];
  verification: VerificationRequirement;
  status: PlanStepStatus;
  blockers: PlanStepBlocker[];
  /** Present only for mutating steps; still requires operator confirmation. */
  proposedSafeAction?: SafeActionProposal;
  /** Why the step is not startable right now, in operator language. */
  note?: string;
}

/* ------------------------------------------------------------------ */
/* Plan                                                                */
/* ------------------------------------------------------------------ */

export type GuardedPlanStatus =
  | "draft"
  | "active"
  | "awaiting_verification"
  | "halted"
  | "complete"
  | "abandoned";

export interface GuardedPlanWarning {
  code:
    | "no_grounded_steps"
    | "stale_guidance"
    | "superseded_guidance"
    | "unresolved_conflict"
    | "context_degraded"
    | "verification_failed"
    | "plan_stale";
  message: string;
}

export interface GuardedPlan {
  version: 1;
  /** Identity of the work this plan belongs to. Changing it expires the plan. */
  episodeKey: string;
  /** Identity of the context it was derived from (staleness detection). */
  contextKey: string;
  objective?: string;
  status: GuardedPlanStatus;
  steps: GuardedPlanStep[];
  /** The single step the operator should be looking at, if any. */
  currentStepFingerprint?: string;
  warnings: GuardedPlanWarning[];
  /** True when a source needed for this plan was unavailable. */
  degraded: boolean;
  generatedAt: string;
  /** Human-readable statement of why the plan can go no further. */
  haltReason?: string;
}

/* ------------------------------------------------------------------ */
/* Operator decisions (the only way a plan advances)                   */
/* ------------------------------------------------------------------ */

export type PlanDecisionKind =
  | "started"
  | "claimed_done"
  | "verified"
  | "failed"
  | "skipped";

export interface PlanStepDecision {
  fingerprint: string;
  kind: PlanDecisionKind;
  at: string;
  /** "operator" for a human confirmation, "evidence" for a fact-backed one. */
  by: "operator" | "evidence";
  /** Bounded, non-sensitive label — never note bodies or caller data. */
  note?: string;
}

export interface PlanEpisodeState {
  episodeKey: string;
  decisions: PlanStepDecision[];
  /** Operator explicitly stopped the plan. */
  halted?: boolean;
  haltReason?: string;
  abandoned?: boolean;
}

export function emptyPlanState(episodeKey: string): PlanEpisodeState {
  return { episodeKey, decisions: [] };
}

export function latestDecision(
  state: PlanEpisodeState,
  fingerprint: string,
): PlanStepDecision | undefined {
  return state.decisions
    .filter((d) => d.fingerprint === fingerprint)
    .sort((a, b) => Date.parse(a.at) - Date.parse(b.at))
    .at(-1);
}

export function emptyPlan(
  episodeKey: string,
  contextKey: string,
  generatedAt: string,
  warning?: GuardedPlanWarning,
): GuardedPlan {
  return {
    version: 1,
    episodeKey,
    contextKey,
    status: "draft",
    steps: [],
    warnings: warning ? [warning] : [],
    degraded: false,
    generatedAt,
  };
}

/** A stored/rendered plan is stale as soon as the context identity changes. */
export function isPlanStale(plan: GuardedPlan, episodeKey: string, contextKey: string): boolean {
  return plan.episodeKey !== episodeKey || plan.contextKey !== contextKey;
}

export const TERMINAL_STEP_STATUSES: readonly PlanStepStatus[] = ["verified", "skipped"];

export function isStepSettled(step: GuardedPlanStep): boolean {
  return TERMINAL_STEP_STATUSES.includes(step.status);
}