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
  /**
   * Phase 16 — resolved capability availability. The gate reads risk,
   * permission and confirmation metadata from the registry instead of each
   * plan step restating those rules.
   */
  capabilities?: Record<string, { availability: "available" | "unavailable" | "blocked"; note?: string }>;
}

export interface PlanGateVerdict {
  status: Extract<PlanStepStatus, "ready" | "pending" | "blocked">;
  blockers: PlanStepBlocker[];
  note?: string;
}

export function evaluatePlanGate(
  step: Pick<GuardedPlanStep, "mutating" | "kind" | "label" | "sourceId"> & { capabilityId?: string },
  ctx: PlanGateContext,
): PlanGateVerdict {
  const blockers: PlanStepBlocker[] = [];

  // Phase 16 — a step bound to a capability that is not currently available
  // can never be "ready", regardless of everything else.
  if (step.capabilityId && ctx.capabilities) {
    const cap = ctx.capabilities[step.capabilityId];
    if (cap && cap.availability !== "available") {
      return {
        status: "blocked",
        blockers: [
          {
            id: `capability:${step.capabilityId}`,
            type: "capability_unavailable",
            label: cap.note ?? "The capability this step needs is not available.",
          },
        ],
        note: cap.note ?? "The capability this step needs is not available right now.",
      };
    }
  }

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