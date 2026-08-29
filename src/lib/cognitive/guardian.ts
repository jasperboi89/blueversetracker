/**
 * GUARDIAN — "is this reasoning/action allowed and sufficiently grounded?"
 *
 * Governance authority for a cognitive run. It reads the canonical Capability
 * Registry and authorization — never prompt-only policy — and no worker can
 * override it. It also never manufactures factual evidence: separation of
 * duties runs both ways.
 *
 * Guardian unavailable fails CLOSED (§61).
 */

import { getCapability } from "@/lib/capability/capability-registry";
import { capabilityAutonomy, isMutatingOperation } from "@/lib/capability/capability-contract";
import { missingPermissions } from "@/lib/capability/capability-permissions";
import type { HubRole } from "@/lib/auth/authorization.functions";
import { getWorker, isWorkerAvailable, GLOBALLY_FORBIDDEN_CAPABILITIES } from "./worker-registry";
import {
  MAX_WORKER_AUTONOMY,
  type GuardianDecision,
  type GuardianReasonCode,
  type GuardianResult,
  type SensitivityClass,
  type WorkerOutput,
} from "./worker-contract";

const SENSITIVITY_RANK: Record<SensitivityClass, number> = {
  public: 0,
  internal: 1,
  sensitive: 2,
  restricted: 3,
};

export interface GuardianRequest {
  taskId: string;
  correlationId: string;
  operatorRole: HubRole | null;
  operatorRef: string;
  accountId?: string;
  /** Capability the operator (or a worker) wants to move toward. */
  requestedCapabilityId?: string;
  /** Contributions being governed. */
  contributions: WorkerOutput[];
  /** True when the operator's phrasing asked for an automatic production change. */
  requestedAutonomousExecution?: boolean;
  sensitivity: SensitivityClass;
}

export function runGuardian(req: GuardianRequest): GuardianResult {
  const def = getWorker("guardian");
  const started = Date.now();
  const base = {
    workerId: "guardian" as const,
    workerVersion: def.version,
    taskId: req.taskId,
    correlationId: req.correlationId,
    elapsedMs: 0,
  };

  if (!isWorkerAvailable("guardian")) {
    return {
      ...base,
      decision: "BLOCK",
      reasonCodes: ["GUARDIAN_UNAVAILABLE"],
      explanation:
        "Governance review is unavailable, so no capability progression is permitted. This fails closed by design.",
      limits: ["Read-only explanation only until governance review is restored."],
      available: false,
      elapsedMs: Date.now() - started,
    };
  }

  const reasons: GuardianReasonCode[] = [];
  const limits: string[] = [];

  // Cross-account evidence is a governance failure regardless of capability.
  if (req.accountId) {
    const leaked = req.contributions.some((c) => c.evidence.some((e) => e.accountId && e.accountId !== req.accountId));
    if (leaked) {
      reasons.push("CROSS_ACCOUNT_EVIDENCE");
      limits.push("Evidence outside the account in scope must be excluded from the answer.");
    }
  }

  for (const c of req.contributions) {
    const worker = getWorker(c.workerId);
    if (SENSITIVITY_RANK[c.sensitivity] > SENSITIVITY_RANK[worker.maxSensitivity]) {
      reasons.push("SENSITIVITY_EXCEEDED");
      limits.push(`${c.workerId} was handed data above its declared sensitivity ceiling.`);
    }
    if (c.operationClass === "execute" || c.operationClass === "propose") {
      reasons.push("AUTONOMY_CEILING");
      limits.push(`${c.workerId} may not exceed the ${MAX_WORKER_AUTONOMY} autonomy ceiling.`);
    }
  }

  const capabilityId = req.requestedCapabilityId;

  if (req.requestedAutonomousExecution) {
    reasons.push("PRODUCTION_SIDE_EFFECT");
    return finish({
      ...base,
      decision: "REQUIRE_HUMAN_CONFIRMATION",
      reasonCodes: unique([...reasons, "CONFIRMATION_REQUIRED"]),
      explanation:
        "Automatic production changes are not available at the current autonomy level. The most this system will do is prepare the change for you to review and apply.",
      limits: unique([...limits, "Preparation only — no production change is executed."]),
      ...(capabilityId ? { capabilityId } : {}),
      available: true,
    }, started);
  }

  if (!capabilityId) {
    return finish({
      ...base,
      decision: reasons.length ? "ALLOW_WITH_LIMITS" : "ALLOW",
      reasonCodes: unique([...reasons, "READ_ONLY_CONTRIBUTION"]),
      explanation: reasons.length
        ? "The analysis may be shown with the limits noted."
        : "Read-only analysis: no capability progression is requested.",
      limits,
      available: true,
    }, started);
  }

  if (GLOBALLY_FORBIDDEN_CAPABILITIES.includes(capabilityId)) {
    return finish({
      ...base,
      decision: "BLOCK",
      reasonCodes: unique([...reasons, "PRODUCTION_SIDE_EFFECT"]),
      explanation: `"${capabilityId}" is not a capability any intelligence worker may reach in this phase.`,
      limits: unique([...limits, "No worker may deploy, execute, close or mark anything verified."]),
      capabilityId,
      available: true,
    }, started);
  }

  const cap = getCapability(capabilityId);
  if (!cap) {
    return finish({
      ...base,
      decision: "BLOCK",
      reasonCodes: unique([...reasons, "CAPABILITY_UNKNOWN"]),
      explanation: `No capability named "${capabilityId}" exists in the registry, so it cannot be authorised.`,
      limits,
      capabilityId,
      available: true,
    }, started);
  }

  if (cap.lifecycle === "disabled") {
    return finish({
      ...base,
      decision: "BLOCK",
      reasonCodes: unique([...reasons, "CAPABILITY_UNAVAILABLE"]),
      explanation: `"${cap.name}" is currently disabled.`,
      limits,
      capabilityId,
      available: true,
    }, started);
  }

  const missing = missingPermissions(cap, { role: req.operatorRole, ...(req.operatorRef ? { userId: req.operatorRef } : {}) });
  if (missing.length) {
    return finish({
      ...base,
      decision: "INSUFFICIENT_AUTHORITY",
      reasonCodes: unique([...reasons, "PERMISSION_MISSING"]),
      explanation: `Your role does not hold the permission(s) required for "${cap.name}": ${missing.join(", ")}.`,
      limits,
      capabilityId,
      available: true,
    }, started);
  }

  const autonomy = capabilityAutonomy(cap);
  const mutating = isMutatingOperation(cap.operation);
  if (mutating || autonomy === "supervised" || autonomy === "execute_safe") {
    return finish({
      ...base,
      decision: "REQUIRE_HUMAN_CONFIRMATION",
      reasonCodes: unique([...reasons, "CONFIRMATION_REQUIRED", "AUTONOMY_CEILING"]),
      explanation: `"${cap.name}" changes state, so it can only be prepared for your confirmation — never applied by the analysis itself.`,
      limits: unique([...limits, "Prepared proposal only; you apply it."]),
      capabilityId,
      available: true,
    }, started);
  }

  const grounded = req.contributions.some((c) => c.evidence.length > 0);
  if (!grounded) {
    return finish({
      ...base,
      decision: "ALLOW_WITH_LIMITS",
      reasonCodes: unique([...reasons, "EVIDENCE_INSUFFICIENT"]),
      explanation: `"${cap.name}" is permitted, but the analysis behind it carries no canonical evidence.`,
      limits: unique([...limits, "Treat the result as unverified until evidence exists."]),
      capabilityId,
      available: true,
    }, started);
  }

  return finish({
    ...base,
    decision: reasons.length ? "ALLOW_WITH_LIMITS" : "ALLOW",
    reasonCodes: unique([...reasons, "READ_ONLY_CONTRIBUTION"]),
    explanation: `"${cap.name}" is a read-level capability permitted for your role.`,
    limits,
    capabilityId,
    available: true,
  }, started);
}

function finish(result: Omit<GuardianResult, "elapsedMs"> & { elapsedMs?: number }, started: number): GuardianResult {
  return { ...result, elapsedMs: Date.now() - started };
}

function unique<T>(list: T[]): T[] {
  return Array.from(new Set(list));
}

/** Guardian decisions that stop capability progression. */
export function blocksProgress(decision: GuardianDecision): boolean {
  return decision === "BLOCK" || decision === "INSUFFICIENT_AUTHORITY";
}
