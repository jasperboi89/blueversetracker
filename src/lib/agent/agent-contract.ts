/**
 * Intelligence Core — Phase 17: Bounded Agent Runtime contracts.
 *
 * The runtime is NOT an autonomous agent. It is a governed loop:
 *
 *   task -> [reasoning cycle -> at most ONE capability invocation ->
 *            normalized observation] -> answer / prepared proposal / stop
 *
 * The model proposes an intent; budgets, permissions, capability governance,
 * verification and operator authority all live OUTSIDE the model, here.
 * Nothing in this module executes anything or persists durable knowledge.
 */

import type { EvidenceConfidence, EvidenceEntityRef, EvidenceFact, EvidenceOrigin } from "@/lib/core/evidence-contract";
import type { CapabilityReasonCode, CapabilityResultStatus } from "@/lib/capability/capability-contract";
import type { TaskKind } from "@/lib/ai/router/task-types";

/* ------------------------------------------------------------------ */
/* Task                                                                */
/* ------------------------------------------------------------------ */

/**
 * Investigation gathers evidence, Answer explains what is already known,
 * Prepare-Action stops at a Safe Action proposal. A run never silently
 * changes mode: an escalation is a new run.
 */
export const AGENT_MODES = ["investigate", "answer", "prepare_action"] as const;
export type AgentMode = (typeof AGENT_MODES)[number];

export interface AgentTask {
  id: string;
  mode: AgentMode;
  /** Bounded, operator-facing statement of what this run is for. */
  objective: string;
  /** Stable reference to the Portal Context this run reasons over. */
  contextRef: string;
  /** Threads Copilot -> invocation -> Safe Action -> verification. */
  correlationId: string;
  taskKind?: TaskKind;
  entityRefs?: EvidenceEntityRef[];
  createdAt: string;
}

/* ------------------------------------------------------------------ */
/* Budgets                                                             */
/* ------------------------------------------------------------------ */

export interface AgentBudget {
  maxCycles: number;
  maxCapabilityCalls: number;
  maxSearches: number;
  maxReasoningCalls: number;
  /** Consecutive cycles that add no new information before the run halts. */
  maxNoProgressCycles: number;
  maxWallClockMs: number;
}

export const DEFAULT_AGENT_BUDGET: AgentBudget = {
  maxCycles: 6,
  maxCapabilityCalls: 8,
  maxSearches: 4,
  maxReasoningCalls: 8,
  maxNoProgressCycles: 2,
  maxWallClockMs: 45_000,
};

/** Prepare-Action runs are deliberately tighter than investigations. */
export const BUDGET_BY_MODE: Record<AgentMode, AgentBudget> = {
  investigate: DEFAULT_AGENT_BUDGET,
  answer: { ...DEFAULT_AGENT_BUDGET, maxCycles: 3, maxCapabilityCalls: 3, maxSearches: 2, maxReasoningCalls: 4 },
  prepare_action: {
    ...DEFAULT_AGENT_BUDGET,
    maxCycles: 4,
    maxCapabilityCalls: 4,
    maxSearches: 2,
    maxReasoningCalls: 5,
  },
};

export interface AgentBudgetUsage {
  cycles: number;
  capabilityCalls: number;
  searches: number;
  reasoningCalls: number;
  noProgressCycles: number;
  elapsedMs: number;
}

export function emptyUsage(): AgentBudgetUsage {
  return { cycles: 0, capabilityCalls: 0, searches: 0, reasoningCalls: 0, noProgressCycles: 0, elapsedMs: 0 };
}

/* ------------------------------------------------------------------ */
/* Intents (what the model may ask for)                                */
/* ------------------------------------------------------------------ */

export type AgentIntent =
  | { kind: "invoke_capability"; capabilityId: string; input: unknown; rationale?: string; entityRefs?: EvidenceEntityRef[] }
  | { kind: "answer"; answer: string; rationale?: string }
  | { kind: "propose_action"; actionType: string; payload: Record<string, unknown>; reason?: string }
  | { kind: "need_operator"; question: string }
  | { kind: "stop"; reason?: string };

/* ------------------------------------------------------------------ */
/* Observations                                                        */
/* ------------------------------------------------------------------ */

/**
 * Everything a capability returns is normalized through the Reality Boundary
 * BEFORE it re-enters model context: origin and confidence are attached, and
 * facts that are not safe for operational guidance are withheld rather than
 * quietly downgraded.
 */
export interface AgentObservation {
  id: string;
  cycle: number;
  capabilityId: string;
  capabilityVersion: number;
  status: CapabilityResultStatus;
  /** Bounded, non-sensitive rendering — never a raw payload dump. */
  summary: string;
  origin: EvidenceOrigin;
  confidence: EvidenceConfidence;
  reasonCodes: CapabilityReasonCode[];
  /** Facts that passed the Reality Boundary gate. */
  facts: EvidenceFact[];
  /** Facts held back, with the label explaining why. */
  withheldFacts: Array<{ id: string; label: string }>;
  fingerprint: string;
  at: string;
}

/* ------------------------------------------------------------------ */
/* Scratch state (ephemeral, never durable memory)                     */
/* ------------------------------------------------------------------ */

export interface AgentScratchState {
  /** Working hypotheses for this run only. Discarded when the run ends. */
  hypotheses: string[];
  /** Questions the run still needs answered. */
  openQuestions: string[];
  /** Notes the reasoner produced; never promoted to Operational Memory here. */
  notes: string[];
}

export function emptyScratch(): AgentScratchState {
  return { hypotheses: [], openQuestions: [], notes: [] };
}

/* ------------------------------------------------------------------ */
/* Run                                                                 */
/* ------------------------------------------------------------------ */

export const AGENT_RUN_STATES = [
  "created",
  "running",
  "awaiting_confirmation",
  "completed",
  "failed",
  "blocked",
] as const;
export type AgentRunState = (typeof AGENT_RUN_STATES)[number];

export const AGENT_STOP_REASONS = [
  "answered",
  "proposal_prepared",
  "operator_input_required",
  "model_stopped",
  "cycle_budget_exceeded",
  "capability_budget_exceeded",
  "search_budget_exceeded",
  "reasoning_budget_exceeded",
  "wall_clock_exceeded",
  "no_progress",
  "loop_detected",
  "capability_blocked",
  "invalid_intent",
  "runtime_error",
] as const;
export type AgentStopReason = (typeof AGENT_STOP_REASONS)[number];

export interface AgentCycleRecord {
  cycle: number;
  intentKind: AgentIntent["kind"];
  capabilityId?: string;
  /** Deterministic fingerprint of the intent — powers loop detection. */
  fingerprint: string;
  observationId?: string;
  blocked?: { reasonCodes: CapabilityReasonCode[]; message: string };
  progressed: boolean;
  at: string;
}

export interface AgentPreparedProposal {
  actionType: string;
  payload: Record<string, unknown>;
  reason?: string;
  /** Always true: the runtime never executes a write itself. */
  requiresOperatorConfirmation: true;
}

export interface AgentRun {
  task: AgentTask;
  state: AgentRunState;
  budget: AgentBudget;
  usage: AgentBudgetUsage;
  cycles: AgentCycleRecord[];
  observations: AgentObservation[];
  scratch: AgentScratchState;
  /** Present only for a completed answer/investigation run. */
  answer?: string;
  /** Present only for prepare_action runs that reached a proposal. */
  proposal?: AgentPreparedProposal;
  /** Present when the run needs the operator before it can continue. */
  question?: string;
  stopReason?: AgentStopReason;
  /** Operator-facing explanation of why the run ended where it did. */
  stopNote?: string;
  startedAt: string;
  endedAt?: string;
}

export const STOP_NOTES: Record<AgentStopReason, string> = {
  answered: "The run answered from the evidence it gathered.",
  proposal_prepared: "A change was prepared and is waiting for your confirmation.",
  operator_input_required: "The run needs something only you can answer.",
  model_stopped: "Reasoning stopped without a further step.",
  cycle_budget_exceeded: "Reached the maximum number of reasoning cycles for this run.",
  capability_budget_exceeded: "Reached the maximum number of lookups for this run.",
  search_budget_exceeded: "Reached the maximum number of searches for this run.",
  reasoning_budget_exceeded: "Reached the maximum number of reasoning calls for this run.",
  wall_clock_exceeded: "The run took too long and was stopped.",
  no_progress: "The last cycles added no new information, so the run stopped.",
  loop_detected: "The run repeated the same step and was stopped.",
  capability_blocked: "A required capability was not permitted in this context.",
  invalid_intent: "The reasoning step was not a recognised, governed step.",
  runtime_error: "The run failed before it could finish.",
};

export function isTerminal(state: AgentRunState): boolean {
  return state === "completed" || state === "failed" || state === "blocked";
}