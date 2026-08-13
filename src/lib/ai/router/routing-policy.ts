import type {
  Capabilities,
  ContextBudget,
  ModelTier,
  RouteTier,
  RoutingConfidence,
  RoutingReasonCode,
  TaskKind,
} from "./task-types";

/**
 * Single place where "which tier does this kind of work need?" is decided.
 * Tune here — never inside feature components.
 */
export const ROUTING_POLICY: Record<
  TaskKind,
  {
    tier: RouteTier;
    reasonCode: RoutingReasonCode;
    confidence: RoutingConfidence;
    capabilities?: Partial<Capabilities>;
    fallbackTier?: ModelTier;
  }
> = {
  navigation: { tier: "deterministic", reasonCode: "RULE_BASED_OPERATION", confidence: "high" },
  lookup: { tier: "deterministic", reasonCode: "EXACT_LOOKUP", confidence: "high" },
  search: { tier: "deterministic", reasonCode: "RULE_BASED_OPERATION", confidence: "high" },

  classification: {
    tier: "fast",
    reasonCode: "SIMPLE_CLASSIFICATION",
    confidence: "high",
    capabilities: { structuredOutput: true },
    fallbackTier: "balanced",
  },
  extraction: {
    tier: "fast",
    reasonCode: "SIMPLE_CLASSIFICATION",
    confidence: "high",
    capabilities: { structuredOutput: true },
    fallbackTier: "balanced",
  },
  rewrite: { tier: "fast", reasonCode: "ROUTINE_GENERATION", confidence: "high", fallbackTier: "balanced" },

  summary: { tier: "balanced", reasonCode: "ROUTINE_GENERATION", confidence: "high" },
  operational_question: {
    tier: "balanced",
    reasonCode: "ROUTINE_GENERATION",
    confidence: "medium",
    capabilities: { tools: true, streaming: true },
  },
  knowledge_interpretation: {
    tier: "balanced",
    reasonCode: "ROUTINE_GENERATION",
    confidence: "medium",
  },
  handoff_generation: { tier: "balanced", reasonCode: "ROUTINE_GENERATION", confidence: "high" },
  structured_generation: {
    tier: "balanced",
    reasonCode: "ROUTINE_GENERATION",
    confidence: "high",
    capabilities: { structuredOutput: true },
  },

  account_investigation: {
    tier: "flagship",
    reasonCode: "MULTI_SOURCE_REASONING",
    confidence: "high",
    capabilities: { tools: true, streaming: true, longContext: true },
    fallbackTier: "balanced",
  },
  ticket_investigation: {
    tier: "flagship",
    reasonCode: "MULTI_SOURCE_REASONING",
    confidence: "high",
    capabilities: { tools: true, streaming: true },
    fallbackTier: "balanced",
  },
  pattern_analysis: {
    tier: "flagship",
    reasonCode: "MULTI_SOURCE_REASONING",
    confidence: "high",
    capabilities: { longContext: true },
    fallbackTier: "balanced",
  },
  vision_analysis: {
    tier: "balanced",
    reasonCode: "VISION_REQUIRED",
    confidence: "high",
    capabilities: { vision: true },
  },
};

/**
 * Context budgets per tier. Higher tiers get more room but never a blanket
 * data permission — allowed *fields* are identical across tiers.
 */
export const CONTEXT_BUDGETS: Record<ModelTier, ContextBudget> = {
  fast: {
    maxContextChars: 2_000,
    maxEvidenceItems: 0,
    allowAccountContext: false,
    allowShiftContext: false,
    maxOutputTokens: 600,
    timeoutMs: 30_000,
  },
  balanced: {
    maxContextChars: 12_000,
    maxEvidenceItems: 5,
    allowAccountContext: true,
    allowShiftContext: true,
    maxOutputTokens: 2_000,
    timeoutMs: 90_000,
  },
  flagship: {
    maxContextChars: 40_000,
    maxEvidenceItems: 12,
    allowAccountContext: true,
    allowShiftContext: true,
    maxOutputTokens: 6_000,
    timeoutMs: 240_000,
  },
};

export const DETERMINISTIC_BUDGET: ContextBudget = {
  maxContextChars: 0,
  maxEvidenceItems: 0,
  allowAccountContext: false,
  allowShiftContext: false,
  maxOutputTokens: 0,
  timeoutMs: 10_000,
};