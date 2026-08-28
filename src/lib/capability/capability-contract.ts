/**
 * Intelligence Core — Phase 16: Capability contract.
 *
 * This module DESCRIBES what the portal is capable of. It executes nothing,
 * grants nothing and stores nothing. Every field exists so the reasoning
 * plane (Copilot, NBA, Guarded Plans) can answer, deterministically:
 *
 *   does it exist · what does it read · what does it change ·
 *   who may use it · what must be true first · who must confirm ·
 *   how do we know it actually worked.
 *
 * AVAILABLE ≠ RELEVANT ≠ PERMITTED ≠ AUTHORIZED ≠ EXECUTED ≠ VERIFIED.
 * Nothing in Phase 16 may collapse those states into one another.
 */

import type { ActionType } from "@/lib/core/actions";
import type {
  EvidenceEntityType,
  EvidenceOrigin,
  EvidenceConfidence,
} from "@/lib/core/evidence-contract";
import type { TaskKind } from "@/lib/ai/router/task-types";

/* ------------------------------------------------------------------ */
/* Identity                                                            */
/* ------------------------------------------------------------------ */

export const CAPABILITY_DOMAINS = [
  "freshdesk",
  "accounts",
  "dispatch",
  "knowledge",
  "additional_work",
  "night_plan",
  "memory",
  "reporting",
  "system",
] as const;
export type CapabilityDomain = (typeof CAPABILITY_DOMAINS)[number];

/** Explicit behavioural class — there is no ambiguous "tool" category. */
export const CAPABILITY_OPERATIONS = [
  "read",
  "search",
  "analyze",
  "prepare",
  "create",
  "update",
  "delete",
  "execute",
] as const;
export type CapabilityOperation = (typeof CAPABILITY_OPERATIONS)[number];

export const READ_ONLY_OPERATIONS: readonly CapabilityOperation[] = ["read", "search", "analyze"];

export function isMutatingOperation(op: CapabilityOperation): boolean {
  return !READ_ONLY_OPERATIONS.includes(op) && op !== "prepare";
}

export type CapabilityRisk = "low" | "medium" | "high" | "blocked";

/** Declared, never inferred from the identifier. */
export type CapabilitySideEffects = "none" | "local" | "persistent" | "external";

export type CapabilityLifecycle = "active" | "deprecated" | "disabled" | "experimental";

export type CapabilityDataClass = "public" | "internal" | "sensitive" | "restricted";

/* ------------------------------------------------------------------ */
/* Autonomy (Phase 3, Part 12)                                         */
/* ------------------------------------------------------------------ */

/**
 * The autonomy progression, weakest → strongest. This CLASSIFIES how far a
 * capability may run without a human; it grants nothing (the confirmation +
 * permission policies remain authoritative). Phase 3 keeps AI at OBSERVE /
 * EXPLAIN / RECOMMEND / PREPARE — never broad autonomous production actions.
 */
export const CAPABILITY_AUTONOMY_LEVELS = [
  "observe",
  "explain",
  "recommend",
  "prepare",
  "execute_safe",
  "supervised",
  "narrow_autonomous",
] as const;
export type CapabilityAutonomyLevel = (typeof CAPABILITY_AUTONOMY_LEVELS)[number];

/** Highest autonomy AI may operate at in Phase 3. Nothing above PREPARE. */
export const MAX_AI_AUTONOMY_PHASE3: CapabilityAutonomyLevel = "prepare";

function autonomyRank(level: CapabilityAutonomyLevel): number {
  return CAPABILITY_AUTONOMY_LEVELS.indexOf(level);
}

/** True when a level is at or below the Phase 3 AI ceiling (prepare). */
export function isWithinPhase3AiAutonomy(level: CapabilityAutonomyLevel): boolean {
  return autonomyRank(level) <= autonomyRank(MAX_AI_AUTONOMY_PHASE3);
}

/* ------------------------------------------------------------------ */
/* Policies                                                            */
/* ------------------------------------------------------------------ */

export interface CapabilityResourceScope {
  entityTypes: EvidenceEntityType[];
  /** The capability only makes sense against the entity currently in context. */
  requiresActiveEntity?: boolean;
  /** May touch entities other than the active one (explicit opt-in). */
  crossEntity?: boolean;
  /** May reach beyond the active account (explicit opt-in). */
  crossAccount?: boolean;
  allowedFields?: string[];
  prohibitedFields?: string[];
}

/** Declared requirement only — the auth system stays authoritative. */
export type CapabilityPermission =
  | "portal.read"
  | "night_plan.write"
  | "ticket.write"
  | "timer.write"
  | "knowledge.write"
  | "memory.write"
  | "admin";

export interface CapabilityPermissionPolicy {
  required: CapabilityPermission[];
  /** Coarse role floor, re-checked against the live session at invocation. */
  minimumRole: "viewer" | "programmer" | "admin";
}

export type CapabilityPrerequisiteKind =
  | "active_ticket"
  | "active_account"
  | "authenticated_operator"
  | "account_context_available"
  | "no_unresolved_conflict"
  | "verified_state"
  | "existing_work_record"
  | "source_system_available";

export interface CapabilityPrerequisite {
  kind: CapabilityPrerequisiteKind;
  label: string;
}

/** Mirrors Safe Action semantics; never weaker than the executor requires. */
export type CapabilityConfirmation =
  | "none"
  | "prepare_only"
  | "explicit"
  | "explicit_high_risk"
  | "blocked";

export interface CapabilityConfirmationPolicy {
  mode: CapabilityConfirmation;
  /** Operator-facing sentence shown before the write is applied. */
  prompt?: string;
}

export type CapabilityVerificationAuthority =
  | "freshdesk"
  | "database"
  | "account_context"
  | "dispatch_state"
  | "knowledge_store"
  | "operator_observation";

export interface CapabilityVerificationPolicy {
  required: boolean;
  authority: CapabilityVerificationAuthority;
  /** Machine-readable description of how success is established. */
  method: string;
  /** Predicate an authoritative Evidence Fact would carry. */
  predicate?: string;
}

/** Operator attestation is only legitimate where the human IS the observer. */
export const OPERATOR_OBSERVABLE_AUTHORITIES: readonly CapabilityVerificationAuthority[] = [
  "operator_observation",
];

export interface CapabilityExecutionBinding {
  type: "service" | "safe_action" | "copilot_tool" | "manual";
  /** Existing implementation identity: tool name, ActionType, service id. */
  handlerId: string;
  /** Present when the binding is a governed Safe Action. */
  actionType?: ActionType;
}

export type CapabilityAiExposure = "none" | "local_only" | "sanitized" | "allowed";

export interface CapabilityAIPolicy {
  /** The model may learn the capability exists. */
  discoverable: boolean;
  /** The model may invoke it directly (reads only, in practice). */
  callable: boolean;
  /** The model may only produce a Safe Action proposal for it. */
  requiresProposal?: boolean;
  allowedTaskKinds?: TaskKind[];
  /** How the capability's OUTPUT may reach a model provider. */
  exposure: CapabilityAiExposure;
}

export interface CapabilityIdempotency {
  supported: boolean;
  fingerprintStrategy?: string;
}

export interface CapabilityEvidencePolicy {
  /** The capability's result becomes Evidence with this provenance. */
  produces: boolean;
  origin?: EvidenceOrigin;
  confidence?: EvidenceConfidence;
}

/* ------------------------------------------------------------------ */
/* Definition                                                          */
/* ------------------------------------------------------------------ */

export interface CapabilityDefinition {
  id: string;
  version: number;
  name: string;
  description: string;
  domain: CapabilityDomain;
  operation: CapabilityOperation;
  risk: CapabilityRisk;
  sideEffects: CapabilitySideEffects;
  lifecycle: CapabilityLifecycle;
  dataClass: CapabilityDataClass;
  /**
   * Declared autonomy ceiling (Phase 3). Optional and non-breaking: when
   * omitted, `capabilityAutonomy()` derives a conservative default from the
   * operation + confirmation policy. Never weaker than the confirmation policy
   * implies.
   */
  autonomy?: CapabilityAutonomyLevel;
  /** Shape descriptors; validated by the adapter's Zod schema at invocation. */
  inputSchema: Record<string, string>;
  outputSchema: Record<string, string>;
  resourceScope: CapabilityResourceScope;
  permissions: CapabilityPermissionPolicy;
  prerequisites: CapabilityPrerequisite[];
  confirmation: CapabilityConfirmationPolicy;
  verification: CapabilityVerificationPolicy;
  execution: CapabilityExecutionBinding;
  ai: CapabilityAIPolicy;
  idempotency: CapabilityIdempotency;
  evidence: CapabilityEvidencePolicy;
  /** Other capability ids this one needs. Must stay acyclic. */
  dependsOn?: string[];
  /** Only for lifecycle === "deprecated". */
  replacedBy?: string;
  featureFlag?: string;
}

export function capabilityRef(def: Pick<CapabilityDefinition, "id" | "version">): string {
  return `${def.id}@${def.version}`;
}

/**
 * The capability's autonomy level — declared if present, otherwise derived
 * conservatively from operation + confirmation. Pure and deterministic. A
 * blocked confirmation caps at "observe"; read/search stay observe/explain;
 * prepare stays prepare; mutating operations require confirmation, so they land
 * at execute_safe (none) or supervised (explicit) — above the Phase 3 AI ceiling
 * so AI may only propose them.
 */
export function capabilityAutonomy(
  def: Pick<CapabilityDefinition, "autonomy" | "operation" | "confirmation">,
): CapabilityAutonomyLevel {
  if (def.autonomy) return def.autonomy;
  if (def.confirmation.mode === "blocked") return "observe";
  switch (def.operation) {
    case "read":
    case "search":
      return "observe";
    case "analyze":
      return "explain";
    case "prepare":
      return "prepare";
    default: {
      // create | update | delete | execute — never AI-autonomous in Phase 3.
      const explicit =
        def.confirmation.mode === "explicit" || def.confirmation.mode === "explicit_high_risk";
      return explicit ? "supervised" : "execute_safe";
    }
  }
}

/* ------------------------------------------------------------------ */
/* Reason codes                                                        */
/* ------------------------------------------------------------------ */

export const CAPABILITY_REASON_CODES = [
  "CAPABILITY_AVAILABLE",
  "PERMISSION_MISSING",
  "ENTITY_REQUIRED",
  "RESOURCE_SCOPE_MISMATCH",
  "CONFLICT_BLOCK",
  "UNVERIFIED_PREREQUISITE",
  "CONFIRMATION_REQUIRED",
  "UNSUPPORTED_OPERATION",
  "CAPABILITY_DISABLED",
  "CAPABILITY_DEPRECATED",
  "DEPENDENCY_UNAVAILABLE",
  "SOURCE_UNAVAILABLE",
  "NOT_RELEVANT_TO_CONTEXT",
  "BUDGET_EXCEEDED",
  "REPEATED_INVOCATION",
  "SENSITIVE_ROUTE_INCOMPATIBLE",
] as const;
export type CapabilityReasonCode = (typeof CAPABILITY_REASON_CODES)[number];

export type CapabilityAvailability = "available" | "unavailable" | "blocked";

/** Technical availability of the underlying system — NOT permission. */
export type CapabilityHealth = "healthy" | "degraded" | "unavailable" | "disabled";

export interface ResolvedCapability {
  id: string;
  version: number;
  name: string;
  description: string;
  domain: CapabilityDomain;
  operation: CapabilityOperation;
  risk: CapabilityRisk;
  sideEffects: CapabilitySideEffects;
  availability: CapabilityAvailability;
  health: CapabilityHealth;
  reasonCodes: CapabilityReasonCode[];
  /** Bounded operator/model-facing explanation. Never invented at runtime. */
  note?: string;
  confirmation: CapabilityConfirmation;
  verification: CapabilityVerificationPolicy;
  ai: CapabilityAIPolicy;
  /** True when the model may call it now; false when it may only propose. */
  callableNow: boolean;
}

/* ------------------------------------------------------------------ */
/* Invocation + result                                                 */
/* ------------------------------------------------------------------ */

export type CapabilityRequester = "operator" | "copilot" | "nba" | "guarded_plan" | "system";

export interface CapabilityInvocation {
  capabilityId: string;
  capabilityVersion: number;
  input: unknown;
  /** Identity of the Portal Context the invocation was reasoned from. */
  contextRef: string;
  entityRefs: { type: EvidenceEntityType; id: string }[];
  requestedBy: CapabilityRequester;
  correlationId: string;
}

export type CapabilityResultStatus = "success" | "failed" | "blocked" | "unavailable";

export type CapabilityVerificationStatus =
  | "not_required"
  | "pending"
  | "verified"
  | "failed"
  | "unknown";

export interface CapabilityResult<T = unknown> {
  capabilityId: string;
  version: number;
  status: CapabilityResultStatus;
  data?: T;
  evidenceRefs?: string[];
  actionLedgerId?: string;
  verificationStatus: CapabilityVerificationStatus;
  reasonCodes: CapabilityReasonCode[];
  correlationId: string;
  timestamp: string;
}
