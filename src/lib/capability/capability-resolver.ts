/**
 * Phase 16 — Capability Resolver.
 *
 * Deterministic, runs BEFORE any model reasoning:
 *
 *   Portal Context -> task classification -> resolver -> permission filter ->
 *   AI-safe projection -> Copilot / NBA / Guarded Plan
 *
 * It answers "available / unavailable / blocked, and why" with machine
 * reason codes. Discovery is informational: being listed here never means the
 * caller is authorized to execute anything.
 */

import type { PortalContextEnvelope } from "@/lib/core/portal-context";
import type { TaskKind } from "@/lib/ai/router/task-types";
import {
  type CapabilityAvailability,
  type CapabilityDefinition,
  type CapabilityHealth,
  type CapabilityReasonCode,
  type ResolvedCapability,
} from "./capability-contract";
import { allCapabilities, discoverableCapabilities } from "./capability-registry";
import { healthMapFor, type SourceHealthMap } from "./capability-health";
import { missingPermissions, type OperatorPrincipal } from "./capability-permissions";

/* ------------------------------------------------------------------ */
/* Task -> capability mapping (bounded initial toolbelt, §21/§56)      */
/* ------------------------------------------------------------------ */

export const TASK_CAPABILITY_MAP: Partial<Record<TaskKind, string[]>> = {
  lookup: ["freshdesk.ticket.read", "freshdesk.ticket.search", "account.list.read", "night_plan.read"],
  search: ["knowledge.search", "resolution.search", "freshdesk.ticket.search"],
  summary: ["freshdesk.ticket.read", "account.context.read"],
  ticket_investigation: [
    "freshdesk.ticket.read",
    "freshdesk.ticket.search",
    "account.context.read",
    "knowledge.search",
    "resolution.search",
  ],
  account_investigation: [
    "account.context.read",
    "account.history.read",
    "account.list.read",
    "resolution.search",
    "knowledge.search",
  ],
  knowledge_interpretation: ["knowledge.search", "resolution.search"],
  operational_question: [
    "night_plan.read",
    "freshdesk.ticket.search",
    "work.time.read",
    "dispatch.list.read",
  ],
  handoff_generation: [
    "night_plan.read",
    "freshdesk.ticket.search",
    "work.time.read",
    "dispatch.list.read",
    "night_plan.item.create",
  ],
  pattern_analysis: ["freshdesk.ticket.search", "account.history.read", "resolution.search"],
};

/** Area of the portal -> capabilities that are contextually relevant. */
const AREA_CAPABILITIES: Record<string, string[]> = {
  tickets: ["freshdesk.ticket.read", "freshdesk.ticket.search", "freshdesk.ticket.classify", "work.timer.start"],
  dispatch: ["dispatch.list.read", "dispatch.status.verify", "manual.customer_confirmation"],
  knowledge: ["knowledge.search", "knowledge.draft.create", "knowledge.note.update"],
  accounts: ["account.context.read", "account.history.read", "account.list.read"],
};

/* ------------------------------------------------------------------ */
/* Resolution                                                          */
/* ------------------------------------------------------------------ */

export interface ResolveInput {
  envelope?: PortalContextEnvelope | null;
  taskKind?: TaskKind;
  operator: OperatorPrincipal;
  sourceHealth?: SourceHealthMap;
  /** Include deprecated/disabled definitions (admin inspector only). */
  includeRetired?: boolean;
  /** Restrict to these ids (plan/NBA lookups). */
  ids?: string[];
  featureFlags?: Record<string, boolean>;
}

export interface ResolveResult {
  available: ResolvedCapability[];
  unavailable: ResolvedCapability[];
  blocked: ResolvedCapability[];
  all: ResolvedCapability[];
  byId: Record<string, ResolvedCapability>;
}

function prerequisiteVerdict(
  def: CapabilityDefinition,
  env: PortalContextEnvelope | null | undefined,
): { codes: CapabilityReasonCode[]; note?: string } {
  const codes: CapabilityReasonCode[] = [];
  if (!env) {
    // No context assembled: entity-scoped capabilities cannot be proven safe.
    if (def.resourceScope.requiresActiveEntity) codes.push("ENTITY_REQUIRED");
    return { codes };
  }

  for (const pre of def.prerequisites) {
    switch (pre.kind) {
      case "active_ticket":
        if (!env.active.ticket) codes.push("ENTITY_REQUIRED");
        break;
      case "active_account":
        if (!env.active.account) codes.push("ENTITY_REQUIRED");
        break;
      case "account_context_available":
        if (!env.accountContext) codes.push("SOURCE_UNAVAILABLE");
        break;
      case "no_unresolved_conflict":
        if ((env.evidenceConflicts ?? []).some((c) => c.status === "unresolved")) {
          codes.push("CONFLICT_BLOCK");
        }
        break;
      case "verified_state":
        if (!(env.facts ?? []).length) codes.push("UNVERIFIED_PREREQUISITE");
        break;
      case "existing_work_record":
        if (!env.active.dispatch && !env.active.workItem && !env.active.ticket) {
          codes.push("ENTITY_REQUIRED");
        }
        break;
      case "source_system_available":
        if (env.warnings.some((w) => w.code === "source_unavailable")) codes.push("SOURCE_UNAVAILABLE");
        break;
      case "authenticated_operator":
      default:
        break;
    }
  }

  // Scope check: an entity-scoped capability needs an entity in scope.
  if (
    def.resourceScope.requiresActiveEntity &&
    !def.resourceScope.entityTypes.some((t) =>
      t === "ticket"
        ? Boolean(env.active.ticket)
        : t === "account"
          ? Boolean(env.active.account)
          : t === "dispatch"
            ? Boolean(env.active.dispatch)
            : t === "knowledge_note"
              ? Boolean(env.active.knowledgeNote)
              : false,
    )
  ) {
    codes.push("RESOURCE_SCOPE_MISMATCH");
  }

  return { codes: Array.from(new Set(codes)) };
}

const NOTE_FOR: Partial<Record<CapabilityReasonCode, string>> = {
  PERMISSION_MISSING: "This session does not hold the required permission.",
  ENTITY_REQUIRED: "Requires the relevant ticket, account or session to be open.",
  RESOURCE_SCOPE_MISMATCH: "Nothing in the current scope matches what this capability may touch.",
  CONFLICT_BLOCK: "Sources disagree; the authoritative value must be confirmed first.",
  UNVERIFIED_PREREQUISITE: "Current state must be verified before this can be prepared.",
  SOURCE_UNAVAILABLE: "The source system for this capability is not reachable right now.",
  DEPENDENCY_UNAVAILABLE: "A system this capability depends on is unavailable.",
  CAPABILITY_DISABLED: "This portal does not expose a governed capability for that action.",
  CAPABILITY_DEPRECATED: "Deprecated — use the replacement capability.",
  UNSUPPORTED_OPERATION: "This operation is not supported by the portal.",
  NOT_RELEVANT_TO_CONTEXT: "Not relevant to the current work.",
};

function project(
  def: CapabilityDefinition,
  availability: CapabilityAvailability,
  health: CapabilityHealth,
  codes: CapabilityReasonCode[],
): ResolvedCapability {
  const primary = codes.find((c) => c !== "CAPABILITY_AVAILABLE");
  return {
    id: def.id,
    version: def.version,
    name: def.name,
    description: def.description,
    domain: def.domain,
    operation: def.operation,
    risk: def.risk,
    sideEffects: def.sideEffects,
    availability,
    health,
    reasonCodes: codes,
    ...(primary && NOTE_FOR[primary] ? { note: NOTE_FOR[primary] } : {}),
    confirmation: def.confirmation.mode,
    verification: def.verification,
    ai: def.ai,
    callableNow: availability === "available" && def.ai.callable,
  };
}

/**
 * Deterministic capability resolution. Pure: no stores, no clock, no network.
 */
export function resolveCapabilities(input: ResolveInput): ResolveResult {
  const pool = input.includeRetired ? allCapabilities() : discoverableCapabilities();
  const defs = input.ids ? pool.filter((d) => input.ids?.includes(d.id)) : pool;
  const health = healthMapFor(allCapabilities(), input.sourceHealth ?? {});

  const resolved = defs.map((def) => {
    const codes: CapabilityReasonCode[] = [];
    let availability: CapabilityAvailability = "available";
    const h = health[def.id] ?? "healthy";

    if (def.lifecycle === "disabled") {
      codes.push("CAPABILITY_DISABLED");
      availability = "blocked";
    } else if (def.lifecycle === "deprecated") {
      codes.push("CAPABILITY_DEPRECATED");
      availability = "unavailable";
    }

    if (def.risk === "blocked" && availability === "available") {
      codes.push("UNSUPPORTED_OPERATION");
      availability = "blocked";
    }

    if (def.featureFlag && input.featureFlags && input.featureFlags[def.featureFlag] === false) {
      codes.push("CAPABILITY_DISABLED");
      availability = "blocked";
    }

    // Permission is declared here and re-checked authoritatively at invocation.
    if (missingPermissions(def, input.operator).length) {
      codes.push("PERMISSION_MISSING");
      if (availability === "available") availability = "blocked";
    }

    if (h === "unavailable" || h === "disabled") {
      codes.push("SOURCE_UNAVAILABLE");
      if (availability === "available") availability = "unavailable";
    } else if (h === "degraded") {
      codes.push("DEPENDENCY_UNAVAILABLE");
    }

    const pre = prerequisiteVerdict(def, input.envelope);
    if (pre.codes.length) {
      codes.push(...pre.codes);
      if (availability === "available") {
        availability = pre.codes.includes("CONFLICT_BLOCK") ? "blocked" : "unavailable";
      }
    }

    if (!codes.length) codes.push("CAPABILITY_AVAILABLE");
    return project(def, availability, h, Array.from(new Set(codes)));
  });

  const byId: Record<string, ResolvedCapability> = {};
  for (const r of resolved) byId[r.id] = r;

  return {
    all: resolved,
    available: resolved.filter((r) => r.availability === "available"),
    unavailable: resolved.filter((r) => r.availability === "unavailable"),
    blocked: resolved.filter((r) => r.availability === "blocked"),
    byId,
  };
}

/**
 * The bounded toolbelt for one reasoning turn (§20/§21): task mapping first,
 * then the active workspace, then permission/health/scope filtering. The whole
 * registry is never handed to a model.
 */
export function getCapabilitiesForContext(input: ResolveInput & { maxCapabilities?: number }): {
  relevant: ResolvedCapability[];
  withheld: ResolvedCapability[];
  resolution: ResolveResult;
} {
  const resolution = resolveCapabilities(input);
  const area = input.envelope?.location.area;
  const wanted = new Set<string>([
    ...(input.taskKind ? (TASK_CAPABILITY_MAP[input.taskKind] ?? []) : []),
    ...(area ? (AREA_CAPABILITIES[area] ?? []) : []),
  ]);

  const scored = resolution.all.filter((c) => c.ai.discoverable);
  const relevantPool = wanted.size ? scored.filter((c) => wanted.has(c.id)) : scored;

  const limit = input.maxCapabilities ?? 8;
  const relevant = relevantPool
    .filter((c) => c.availability === "available")
    .slice(0, limit);

  const withheld = relevantPool.filter((c) => c.availability !== "available");
  return { relevant, withheld, resolution };
}
