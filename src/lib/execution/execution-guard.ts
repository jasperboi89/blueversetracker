/**
 * Phase 10 — the execution authorization gate.
 *
 * Guardian is re-consulted at EXECUTION time, not just at planning time. A
 * plan authorised ten minutes ago proves nothing about now: role, capability
 * lifecycle, kill switch and the allowlist are all re-evaluated immediately
 * before the reservation.
 *
 * Fails CLOSED: any unknown, any missing capability, any Guardian failure ⇒
 * denied.
 */

import { getCapability } from "@/lib/capability/capability-registry";
import { missingPermissions } from "@/lib/capability/capability-permissions";
import type { HubRole } from "@/lib/auth/authorization.functions";
import { getExecutableCapability, isExecutable } from "./executable-registry";
import { checkExecutionControl } from "./kill-switch";
import type { ExecFailureClass, ExecutionPlan } from "./execution-contract";
import { verifyPlanIntegrity } from "./execution-plan";

export interface GuardContext {
  operatorRef: string;
  role: HubRole | null;
}

export type GuardVerdict =
  | { allowed: true }
  | { allowed: false; failureClass: ExecFailureClass; message: string };

export function authorizeExecution(plan: ExecutionPlan, ctx: GuardContext): GuardVerdict {
  if (!verifyPlanIntegrity(plan)) {
    return {
      allowed: false,
      failureClass: "plan_mismatch",
      message: "This plan no longer matches what was reviewed, so it will not be applied.",
    };
  }

  const contract = getExecutableCapability(plan.capabilityId);
  if (!contract || !isExecutable(plan.capabilityId)) {
    return {
      allowed: false,
      failureClass: "authorization_denied",
      message: `“${plan.capabilityId}” is not executable from this system.`,
    };
  }
  if (contract.version !== plan.capabilityVersion) {
    return {
      allowed: false,
      failureClass: "plan_mismatch",
      message: "The capability changed version since this plan was prepared. Re-plan it.",
    };
  }

  const control = checkExecutionControl({
    operationClass: contract.operationClass,
    riskClass: contract.riskClass,
    reversibility: contract.reversibility,
  });
  if (!control.allowed) {
    return { allowed: false, failureClass: "execution_disabled", message: control.message };
  }

  if (!ctx.operatorRef) {
    return {
      allowed: false,
      failureClass: "authorization_denied",
      message: "A signed-in operator is required to apply changes.",
    };
  }

  const canonical = getCapability(plan.capabilityId);
  if (canonical) {
    if (canonical.lifecycle === "disabled" || canonical.lifecycle === "deprecated") {
      return {
        allowed: false,
        failureClass: "authorization_denied",
        message: `“${canonical.name}” is ${canonical.lifecycle} and can no longer be applied.`,
      };
    }
    const missing = missingPermissions(canonical, { role: ctx.role, userId: ctx.operatorRef });
    if (missing.length) {
      return {
        allowed: false,
        failureClass: "authorization_denied",
        message: `Your role does not hold: ${missing.join(", ")}.`,
      };
    }
  } else if (!contract.fixtureOnly) {
    // No canonical definition for a non-fixture capability ⇒ fail closed.
    return {
      allowed: false,
      failureClass: "authorization_denied",
      message: "This capability has no governed definition, so it cannot be applied.",
    };
  }

  if (plan.unmetPreconditions.length) {
    return {
      allowed: false,
      failureClass: "precondition_failed",
      message: `Not ready yet: ${plan.unmetPreconditions.join(", ")}.`,
    };
  }

  return { allowed: true };
}
