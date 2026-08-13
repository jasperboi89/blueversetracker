/**
 * Task / Model Router — shared vocabulary.
 *
 * Everything here is pure types + constants so both the browser and the
 * server can reason about routing without importing any provider code.
 */

export type ModelTier = "fast" | "balanced" | "flagship";
export type RouteTier = "deterministic" | ModelTier;

export type TaskKind =
  | "navigation"
  | "lookup"
  | "search"
  | "classification"
  | "extraction"
  | "summary"
  | "rewrite"
  | "operational_question"
  | "account_investigation"
  | "ticket_investigation"
  | "knowledge_interpretation"
  | "pattern_analysis"
  | "handoff_generation"
  | "structured_generation"
  | "vision_analysis";

export interface Capabilities {
  tools: boolean;
  vision: boolean;
  structuredOutput: boolean;
  streaming: boolean;
  longContext: boolean;
}

export const NO_CAPABILITIES: Capabilities = {
  tools: false,
  vision: false,
  structuredOutput: false,
  streaming: false,
  longContext: false,
};

export interface TaskRequirements {
  tier?: RouteTier;
  capabilities?: Partial<Capabilities>;
}

export type RoutingReasonCode =
  | "EXACT_LOOKUP"
  | "RULE_BASED_OPERATION"
  | "SIMPLE_CLASSIFICATION"
  | "ROUTINE_GENERATION"
  | "MULTI_SOURCE_REASONING"
  | "VISION_REQUIRED"
  | "LONG_CONTEXT_REQUIRED"
  | "TOOLS_REQUIRED"
  | "LOW_CONFIDENCE_SAFE_DEFAULT"
  | "MANUAL_OVERRIDE"
  | "ESCALATED"
  | "FALLBACK_TIER"
  | "NO_MODEL_AVAILABLE";

export type RoutingConfidence = "high" | "medium" | "low";

export interface RoutingDecision {
  route: "deterministic" | "model";
  taskKind: TaskKind;
  tier: RouteTier;
  modelId?: string;
  capabilities: Capabilities;
  reasonCode: RoutingReasonCode;
  routingConfidence: RoutingConfidence;
  /** Tier that would be tried next if the selected one fails. */
  fallbackTier?: ModelTier;
  /** True when the requested tier was unavailable and a different one was used. */
  degradedFrom?: ModelTier;
  /** Per-tier context budget the caller must respect. */
  contextBudget: ContextBudget;
  /** Present only when no model could satisfy the requirements. */
  error?: string;
}

export interface ContextBudget {
  /** Max characters of assembled evidence/context for the task. */
  maxContextChars: number;
  /** Max retrieval evidence records to include. */
  maxEvidenceItems: number;
  /** Whether the account context projection may be attached. */
  allowAccountContext: boolean;
  /** Whether shift working context may be attached. */
  allowShiftContext: boolean;
  /** Soft cap on model output. */
  maxOutputTokens: number;
  /** Wall-clock budget hint for this tier, in ms. */
  timeoutMs: number;
}

export const TIER_ORDER: ModelTier[] = ["fast", "balanced", "flagship"];

export function isModelTier(tier: RouteTier): tier is ModelTier {
  return tier !== "deterministic";
}