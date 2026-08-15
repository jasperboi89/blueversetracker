/**
 * Phase 15 — Plan Safety Gate.
 *
 * Deterministic answer to "may the operator start this step right now?".
 * Nothing may bypass it — not the Copilot, not the plan builder, not the UI.
 * The gate never executes; it only classifies.
 */

import type { PortalContextEnvelope } from "@/lib/core/portal-context";
import type { WorkProgressState } from "@/lib/nba/work-progress";
import type { GuardedPlanStep, PlanStepBlocker, PlanStepStatus } from "./plan-contract";

export interface PlanGateContext {
  envelope: PortalContextEnvelope;
  progress: WorkProgressState;
  permissions: { canPrepareWrites: boolean };
  /** Every prerequisite step is verified. */
  prerequisitesSatisfied: boolean;
  /** The plan itself is halted or abandoned. */
  planStopped: boolean;
}

export interface PlanGateVerdict {
  status: Extract<PlanStepStatus, "ready" | "pending" | "blocked">;
  blockers: PlanStepBlocker[];
  note?: string;
}

export function evaluatePlanGate(
  step: Pick<GuardedPlanStep, "mutating" | "kind" | "label" | "sourceId">,
  ctx: PlanGateContext,
): PlanGateVerdict {
  const blockers: PlanStepBlocker[] = [];

  if (ctx.planStopped) {
    return {
      status: "blocked",
      blockers: [{ id: "plan_stopped", type: "plan_stopped", label: "The plan is stopped." }],
      note: "Resume the plan before continuing.",
    };
  }

  if (!ctx.prerequisitesSatisfied) {
    return {
      status: "pending",
      blockers,
      note: "Waiting on the previous step to be verified.",
    };
  }

  // Operational blockers recorded against the current work stop everything
  // except reading/reviewing.
  const blocker = ctx.progress.activeBlockers[0];
  if (blocker && step.kind !== "REVIEW") {
    return {
      status: "blocked",
      blockers: [{ id: blocker.id, type: blocker.type, label: blocker.label }],
      note: `Resolve the blocker first: ${blocker.label}`,
    };
  }

  if (!step.mutating) return { status: "ready", blockers };

  /* ---- mutating steps carry the strict guards ---- */

  if (!ctx.permissions.canPrepareWrites) {
    return {
      status: "blocked",
      blockers: [
        { id: "permission", type: "permission", label: "Write actions are not available to this session." },
      ],
      note: "This session can plan the change but not prepare it.",
    };
  }

  if ((ctx.envelope.evidenceConflicts ?? []).some((c) => c.status === "unresolved")) {
    return {
      status: "blocked",
      blockers: [
        {
          id: "conflict",
          type: "evidence_conflict",
          label: "Sources disagree; the authoritative value must be confirmed first.",
        },
      ],
      note: "Resolve the conflicting evidence before changing anything.",
    };
  }

  if (ctx.progress.verifiedFacts.length === 0) {
    return {
      status: "blocked",
      blockers: [
        { id: "unverified", type: "unverified_state", label: "Relevant state is not verified yet." },
      ],
      note: "Verify the current state before this change can be prepared.",
    };
  }

  return { status: "ready", blockers };
}