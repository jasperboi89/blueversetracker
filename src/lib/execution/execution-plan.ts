/**
 * Phase 10 — structured, immutable execution plans.
 *
 * A plan is the ONLY thing the engine will execute. It is built once, frozen,
 * and fingerprinted over exactly the fields that determine the effect. An
 * operator confirmation is bound to that fingerprint, so a plan cannot be
 * edited after confirmation and re-used: the fingerprint changes and the
 * confirmation stops matching.
 *
 * Building a plan performs NO writes and requires no confirmation. Planning is
 * always safe — that is what keeps the autonomy ceiling at PREPARE.
 */

import { fingerprint } from "./fingerprint";
import { getExecutableCapability } from "./executable-registry";
import type {
  ExecTargetRef,
  ExecTargetState,
  ExecutionPlan,
  ExecutableCapability,
} from "./execution-contract";

export interface PlanRequest {
  capabilityId: string;
  input: Record<string, unknown>;
  target: ExecTargetRef;
  requestedBy: ExecutionPlan["requestedBy"];
  correlationId: string;
  contextRef: string;
  /** State observed at plan time; `null` when the provider can't read it. */
  preState?: ExecTargetState | null;
  /** Precondition ids that are NOT satisfied right now. */
  unmetPreconditions?: string[];
  now?: () => number;
  /** Deterministic id seam for tests. */
  planId?: string;
}

export type PlanResult =
  | { ok: true; plan: ExecutionPlan; capability: ExecutableCapability }
  | { ok: false; reason: "not_executable" | "blocked"; message: string };

export function buildExecutionPlan(req: PlanRequest): PlanResult {
  const capability = getExecutableCapability(req.capabilityId);
  if (!capability) {
    return {
      ok: false,
      reason: "not_executable",
      message: `“${req.capabilityId}” is not on the executable allowlist, so it can only be prepared for you to do manually.`,
    };
  }
  if (capability.confirmation === "blocked") {
    return {
      ok: false,
      reason: "blocked",
      message: `“${capability.name}” is blocked from execution in this portal.`,
    };
  }

  const now = req.now ?? Date.now;
  const createdAt = new Date(now()).toISOString();

  // Fingerprint covers ONLY effect-determining fields. Timestamps, ids and
  // correlation metadata are deliberately excluded so a re-plan of the same
  // change is recognised as the same change.
  const effect = {
    capabilityId: capability.capabilityId,
    capabilityVersion: capability.version,
    target: req.target,
    input: req.input,
    operationClass: capability.operationClass,
    riskClass: capability.riskClass,
    preState: req.preState?.fingerprint ?? null,
  };
  const fp = fingerprint(effect);

  const plan: ExecutionPlan = Object.freeze({
    id: req.planId ?? `plan_${fp}`,
    fingerprint: fp,
    capabilityId: capability.capabilityId,
    capabilityVersion: capability.version,
    operationClass: capability.operationClass,
    riskClass: capability.riskClass,
    confirmation: capability.confirmation,
    effectSummary: capability.effectSummary,
    target: Object.freeze({ ...req.target }),
    input: Object.freeze({ ...req.input }),
    preState: req.preState ? Object.freeze({ ...req.preState }) : null,
    unmetPreconditions: Object.freeze([...(req.unmetPreconditions ?? [])]),
    requestedBy: req.requestedBy,
    correlationId: req.correlationId,
    contextRef: req.contextRef,
    createdAt,
    // Idempotency is keyed on the EFFECT, not on the attempt.
    idempotencyKey: `exec:${capability.capabilityId}:${fp}`,
  });

  return { ok: true, plan, capability };
}

/** Recompute the fingerprint from the plan itself — detects tampering. */
export function verifyPlanIntegrity(plan: ExecutionPlan): boolean {
  const recomputed = fingerprint({
    capabilityId: plan.capabilityId,
    capabilityVersion: plan.capabilityVersion,
    target: { ...plan.target },
    input: { ...plan.input },
    operationClass: plan.operationClass,
    riskClass: plan.riskClass,
    preState: plan.preState?.fingerprint ?? null,
  });
  return recomputed === plan.fingerprint;
}

/**
 * Operator-facing preview. Deterministic, non-causal, and never invented: it
 * restates the declared effect and the plan's own fields.
 */
export function describePlan(plan: ExecutionPlan): string[] {
  const lines = [
    `${plan.effectSummary}`,
    `Target: ${plan.target.type} ${plan.target.id}`,
    `Operation: ${plan.operationClass.replace(/_/g, " ")} · risk ${plan.riskClass}`,
  ];
  if (plan.unmetPreconditions.length) {
    lines.push(`Not ready: ${plan.unmetPreconditions.join(", ")}`);
  }
  return lines;
}
