import {
  MODEL_REGISTRY,
  selectModel,
  type ModelProfile,
} from "./model-registry";
import { CONTEXT_BUDGETS, DETERMINISTIC_BUDGET, ROUTING_POLICY } from "./routing-policy";
import {
  NO_CAPABILITIES,
  TIER_ORDER,
  isModelTier,
  type Capabilities,
  type ModelTier,
  type RouteTier,
  type RoutingDecision,
  type TaskKind,
  type TaskRequirements,
} from "./task-types";

export interface RouteTaskInput {
  kind: TaskKind;
  requirements?: TaskRequirements;
  /** Operator/system tier preference. Capability constraints still win. */
  override?: ModelTier;
  /** Escalation signal from a previous attempt. */
  escalatedFrom?: ModelTier;
  registry?: ModelProfile[];
  now?: number;
}

function mergeCaps(...parts: Array<Partial<Capabilities> | undefined>): Capabilities {
  return parts.reduce<Capabilities>(
    (acc, part) => ({ ...acc, ...(part ?? {}) }) as Capabilities,
    { ...NO_CAPABILITIES },
  );
}

function requiredOnly(caps: Capabilities): Partial<Capabilities> {
  const out: Partial<Capabilities> = {};
  (Object.keys(caps) as Array<keyof Capabilities>).forEach((k) => {
    if (caps[k]) out[k] = true;
  });
  return out;
}

/** Tiers to try, in order, starting at `tier`. */
function tierChain(tier: ModelTier, preferredFallback?: ModelTier): ModelTier[] {
  const chain = [tier];
  if (preferredFallback && preferredFallback !== tier) chain.push(preferredFallback);
  for (const t of TIER_ORDER) if (!chain.includes(t)) chain.push(t);
  return chain;
}

/**
 * Pure, synchronous routing decision. No network, no model call — typed rules
 * plus capability matching only.
 */
export function routeTask(input: RouteTaskInput): RoutingDecision {
  const policy = ROUTING_POLICY[input.kind];
  const registry = input.registry ?? MODEL_REGISTRY;
  const caps = mergeCaps(policy.capabilities, input.requirements?.capabilities);
  const required = requiredOnly(caps);

  let tier: RouteTier = input.requirements?.tier ?? policy.tier;
  let reasonCode = policy.reasonCode;
  let confidence = policy.confidence;

  // Deterministic tier: never selects a model.
  if (tier === "deterministic" && !input.escalatedFrom && !input.override) {
    return {
      route: "deterministic",
      taskKind: input.kind,
      tier: "deterministic",
      capabilities: caps,
      reasonCode,
      routingConfidence: confidence,
      contextBudget: DETERMINISTIC_BUDGET,
    };
  }

  if (!isModelTier(tier)) tier = "balanced";

  if (input.override && input.override !== tier) {
    tier = input.override;
    reasonCode = "MANUAL_OVERRIDE";
  }
  if (input.escalatedFrom) {
    const next = TIER_ORDER[Math.min(TIER_ORDER.indexOf(input.escalatedFrom) + 1, TIER_ORDER.length - 1)]!;
    tier = next;
    reasonCode = "ESCALATED";
  }
  // Low-confidence routing prefers the safe general-purpose tier.
  if (confidence === "low" && tier === "flagship" && !input.override) {
    tier = "balanced";
    reasonCode = "LOW_CONFIDENCE_SAFE_DEFAULT";
  }
  if (caps.vision) reasonCode = "VISION_REQUIRED";
  else if (caps.longContext && tier === "flagship") reasonCode = "LONG_CONTEXT_REQUIRED";

  const requestedTier = tier as ModelTier;
  const chain = tierChain(requestedTier, policy.fallbackTier);

  for (const candidateTier of chain) {
    const model = selectModel(candidateTier, required, registry, input.now);
    if (!model) continue;
    const degraded = candidateTier !== requestedTier;
    return {
      route: "model",
      taskKind: input.kind,
      tier: candidateTier,
      modelId: model.id,
      capabilities: caps,
      reasonCode: degraded ? "FALLBACK_TIER" : reasonCode,
      routingConfidence: degraded ? "medium" : confidence,
      fallbackTier: chain.find((t) => t !== candidateTier && selectModel(t, required, registry, input.now)),
      ...(degraded ? { degradedFrom: requestedTier } : {}),
      contextBudget: CONTEXT_BUDGETS[candidateTier],
    };
  }

  return {
    route: "model",
    taskKind: input.kind,
    tier: requestedTier,
    capabilities: caps,
    reasonCode: "NO_MODEL_AVAILABLE",
    routingConfidence: "low",
    contextBudget: CONTEXT_BUDGETS[requestedTier],
    error: "No model available with the required capabilities.",
  };
}

/** Escalate a decision one tier up (explicit failure/complexity signal only). */
export function escalateRoute(decision: RoutingDecision, reason: "invalid_output" | "conflicting_evidence") {
  if (decision.route !== "model" || !isModelTier(decision.tier)) return decision;
  if (decision.tier === "flagship") return decision;
  void reason;
  return routeTask({ kind: decision.taskKind, escalatedFrom: decision.tier });
}

/** Human-readable statement when a task ran below its intended tier. */
export function degradationNotice(decision: RoutingDecision): string | undefined {
  if (!decision.degradedFrom) return undefined;
  if (decision.degradedFrom === "flagship") {
    return "Deep analysis was unavailable, so I used the standard reasoning path.";
  }
  return "The preferred reasoning path was unavailable, so I used an alternate one.";
}