/**
 * Phase 16 — invocation envelope, budgets and the authoritative gate.
 *
 * This module does NOT execute anything. It decides whether an invocation may
 * proceed, and it stamps the correlation id that threads:
 *
 *   Copilot -> resolution -> invocation -> Safe Action -> Action Ledger ->
 *   verification -> Evidence Fact -> Event Spine
 *
 * Writes still go to the Safe Action Executor; reads still go to the existing
 * domain services.
 */

import { z } from "zod";
import type {
  CapabilityDefinition,
  CapabilityInvocation,
  CapabilityReasonCode,
  CapabilityRequester,
  CapabilityResult,
  CapabilityResultStatus,
  CapabilityVerificationStatus,
} from "./capability-contract";
import { getCapability } from "./capability-registry";
import { missingPermissions, type OperatorPrincipal } from "./capability-permissions";
import { resolveCapabilities, type ResolveInput } from "./capability-resolver";

/* ------------------------------------------------------------------ */
/* Correlation                                                         */
/* ------------------------------------------------------------------ */

export function newCorrelationId(prefix = "cap"): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function buildInvocation(args: {
  capabilityId: string;
  input: unknown;
  contextRef: string;
  requestedBy: CapabilityRequester;
  entityRefs?: CapabilityInvocation["entityRefs"];
  correlationId?: string;
}): CapabilityInvocation | null {
  const def = getCapability(args.capabilityId);
  if (!def) return null;
  return {
    capabilityId: def.id,
    capabilityVersion: def.version,
    input: args.input,
    contextRef: args.contextRef,
    entityRefs: args.entityRefs ?? [],
    requestedBy: args.requestedBy,
    correlationId: args.correlationId ?? newCorrelationId(),
  };
}

/* ------------------------------------------------------------------ */
/* Budgets + loop detection                                            */
/* ------------------------------------------------------------------ */

export interface InvocationBudget {
  maxTotal: number;
  maxReads: number;
  maxSearches: number;
  /** Same capability + same input more than this many times => stop. */
  maxRepeats: number;
}

export const DEFAULT_INVOCATION_BUDGET: InvocationBudget = {
  maxTotal: 12,
  maxReads: 8,
  maxSearches: 6,
  maxRepeats: 2,
};

export function invocationFingerprint(capabilityId: string, input: unknown): string {
  let json = "";
  try {
    json = JSON.stringify(input ?? null);
  } catch {
    json = String(input);
  }
  return `${capabilityId}:${json.slice(0, 300)}`;
}

/**
 * Bounded tool loop tracker (§80-§82). One instance per reasoning turn; there
 * is deliberately no way to raise the ceiling from inside a model response.
 */
export class InvocationLedger {
  private total = 0;
  private reads = 0;
  private searches = 0;
  private readonly seen = new Map<string, number>();

  constructor(private readonly budget: InvocationBudget = DEFAULT_INVOCATION_BUDGET) {}

  check(def: CapabilityDefinition, input: unknown): { ok: true } | { ok: false; code: CapabilityReasonCode; message: string } {
    if (this.total >= this.budget.maxTotal) {
      return { ok: false, code: "BUDGET_EXCEEDED", message: "Capability invocation budget reached for this turn." };
    }
    if (def.operation === "read" && this.reads >= this.budget.maxReads) {
      return { ok: false, code: "BUDGET_EXCEEDED", message: "Read budget reached for this turn." };
    }
    if (def.operation === "search" && this.searches >= this.budget.maxSearches) {
      return { ok: false, code: "BUDGET_EXCEEDED", message: "Search budget reached for this turn." };
    }
    const fp = invocationFingerprint(def.id, input);
    if ((this.seen.get(fp) ?? 0) >= this.budget.maxRepeats) {
      return {
        ok: false,
        code: "REPEATED_INVOCATION",
        message: "This exact lookup has already been run; use what you have or ask the operator.",
      };
    }
    return { ok: true };
  }

  record(def: CapabilityDefinition, input: unknown): void {
    this.total += 1;
    if (def.operation === "read") this.reads += 1;
    if (def.operation === "search") this.searches += 1;
    const fp = invocationFingerprint(def.id, input);
    this.seen.set(fp, (this.seen.get(fp) ?? 0) + 1);
  }

  get usage(): { total: number; reads: number; searches: number } {
    return { total: this.total, reads: this.reads, searches: this.searches };
  }
}

/* ------------------------------------------------------------------ */
/* Authoritative invocation gate                                       */
/* ------------------------------------------------------------------ */

export interface InvocationGuardInput {
  invocation: CapabilityInvocation;
  operator: OperatorPrincipal;
  /** Human confirmed this specific invocation in the UI. */
  confirmed?: boolean;
  /** Reuse the same resolver the discovery step used. */
  resolve?: Omit<ResolveInput, "operator" | "ids">;
  ledger?: InvocationLedger;
  /** Zod schema for the capability input, supplied by the adapter. */
  inputSchema?: z.ZodTypeAny;
}

export type InvocationVerdict =
  | { allowed: true; definition: CapabilityDefinition; input: unknown }
  | { allowed: false; status: Exclude<CapabilityResultStatus, "success">; reasonCodes: CapabilityReasonCode[]; message: string };

/**
 * The AUTHORITATIVE check (§11). Discovery verdicts and plan-time decisions
 * are informational; this runs at execution and wins over both.
 */
export function assertInvocationAllowed(args: InvocationGuardInput): InvocationVerdict {
  const def = getCapability(args.invocation.capabilityId);
  if (!def) {
    return {
      allowed: false,
      status: "unavailable",
      reasonCodes: ["UNSUPPORTED_OPERATION"],
      message: "No such capability is registered in this portal.",
    };
  }
  if (def.version !== args.invocation.capabilityVersion) {
    return {
      allowed: false,
      status: "blocked",
      reasonCodes: ["UNSUPPORTED_OPERATION"],
      message: "Capability version mismatch; re-resolve before invoking.",
    };
  }
  if (def.lifecycle === "disabled" || def.risk === "blocked") {
    return {
      allowed: false,
      status: "blocked",
      reasonCodes: ["CAPABILITY_DISABLED"],
      message: "This portal does not expose a governed capability for that action.",
    };
  }

  // Permission — re-derived now, never inherited from earlier reasoning.
  if (missingPermissions(def, args.operator).length) {
    return {
      allowed: false,
      status: "blocked",
      reasonCodes: ["PERMISSION_MISSING"],
      message: "This session is not permitted to run that capability.",
    };
  }

  // Context/scope/health — re-derived now as well.
  if (args.resolve) {
    const verdict = resolveCapabilities({ ...args.resolve, operator: args.operator, ids: [def.id] }).byId[def.id];
    if (verdict && verdict.availability !== "available") {
      return {
        allowed: false,
        status: verdict.availability === "blocked" ? "blocked" : "unavailable",
        reasonCodes: verdict.reasonCodes,
        message: verdict.note ?? "The capability is not available in the current context.",
      };
    }
  }

  // Entity scope: a capability may only touch entities it declares, and may
  // not cross to another entity/account unless it explicitly opted in.
  const refs = args.invocation.entityRefs;
  const offScope = refs.filter((r) => !def.resourceScope.entityTypes.includes(r.type));
  if (offScope.length) {
    return {
      allowed: false,
      status: "blocked",
      reasonCodes: ["RESOURCE_SCOPE_MISMATCH"],
      message: "The capability may not touch that entity type.",
    };
  }
  if (!def.resourceScope.crossEntity && refs.length > 1) {
    return {
      allowed: false,
      status: "blocked",
      reasonCodes: ["RESOURCE_SCOPE_MISMATCH"],
      message: "This capability may only act on a single entity.",
    };
  }

  // Confirmation — never weakened, and the model can never self-confirm.
  const needsConfirmation =
    def.confirmation.mode === "explicit" || def.confirmation.mode === "explicit_high_risk";
  if (needsConfirmation && !args.confirmed) {
    return {
      allowed: false,
      status: "blocked",
      reasonCodes: ["CONFIRMATION_REQUIRED"],
      message: def.confirmation.prompt ?? "This needs the operator's explicit confirmation.",
    };
  }

  // Budget + loop detection.
  if (args.ledger) {
    const check = args.ledger.check(def, args.invocation.input);
    if (!check.ok) {
      return { allowed: false, status: "blocked", reasonCodes: [check.code], message: check.message };
    }
  }

  // Schema validation — model-generated arguments are never trusted.
  let input = args.invocation.input;
  if (args.inputSchema) {
    const parsed = args.inputSchema.safeParse(input);
    if (!parsed.success) {
      return {
        allowed: false,
        status: "failed",
        reasonCodes: ["UNSUPPORTED_OPERATION"],
        message: "The capability arguments did not match its input schema.",
      };
    }
    input = parsed.data;
  }

  args.ledger?.record(def, args.invocation.input);
  return { allowed: true, definition: def, input };
}

/* ------------------------------------------------------------------ */
/* Results                                                             */
/* ------------------------------------------------------------------ */

/**
 * Execution success is NOT verification (§48/§71): a governed write starts at
 * "pending" and only an authoritative check may move it to "verified".
 */
export function initialVerificationStatus(def: CapabilityDefinition): CapabilityVerificationStatus {
  return def.verification.required ? "pending" : "not_required";
}

export function capabilityResult<T>(args: {
  definition: CapabilityDefinition;
  status: CapabilityResultStatus;
  correlationId: string;
  data?: T;
  evidenceRefs?: string[];
  actionLedgerId?: string;
  verificationStatus?: CapabilityVerificationStatus;
  reasonCodes?: CapabilityReasonCode[];
  now?: string;
}): CapabilityResult<T> {
  return {
    capabilityId: args.definition.id,
    version: args.definition.version,
    status: args.status,
    ...(args.data !== undefined ? { data: args.data } : {}),
    ...(args.evidenceRefs ? { evidenceRefs: args.evidenceRefs } : {}),
    ...(args.actionLedgerId ? { actionLedgerId: args.actionLedgerId } : {}),
    verificationStatus:
      args.verificationStatus ??
      (args.status === "success" ? initialVerificationStatus(args.definition) : "unknown"),
    reasonCodes: args.reasonCodes ?? [],
    correlationId: args.correlationId,
    timestamp: args.now ?? new Date().toISOString(),
  };
}

export function blockedResult(args: {
  capabilityId: string;
  version: number;
  status: Exclude<CapabilityResultStatus, "success">;
  reasonCodes: CapabilityReasonCode[];
  correlationId: string;
  now?: string;
}): CapabilityResult<never> {
  return {
    capabilityId: args.capabilityId,
    version: args.version,
    status: args.status,
    verificationStatus: "unknown",
    reasonCodes: args.reasonCodes,
    correlationId: args.correlationId,
    timestamp: args.now ?? new Date().toISOString(),
  };
}

/**
 * Provenance stamp for anything a capability hands to the Evidence Graph
 * (§32): no anonymous blobs may enter the truth plane.
 */
export function capabilityProvenance(def: CapabilityDefinition, correlationId: string) {
  return {
    capabilityId: def.id,
    capabilityVersion: def.version,
    origin: def.evidence.origin ?? "retrieved",
    confidence: def.evidence.confidence ?? "unknown",
    correlationId,
  } as const;
}
