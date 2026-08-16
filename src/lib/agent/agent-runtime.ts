/**
 * Phase 17 — Bounded Agent Runtime.
 *
 * A deterministic state machine around a reasoning function:
 *
 *   created -> running -> [awaiting_confirmation] -> completed | failed | blocked
 *
 * Guarantees (none of which the model can weaken):
 *   1. At most ONE capability invocation per reasoning cycle, so causality is
 *      inspectable cycle by cycle.
 *   2. Every invocation passes the Phase 16 authoritative gate
 *      (`assertInvocationAllowed`) — permissions, scope, confirmation, budget.
 *   3. Observations are normalized through the Reality Boundary before they
 *      re-enter model context; unsafe facts are withheld, never downgraded.
 *   4. Writes are never executed here: a prepare_action run ends at a
 *      proposal awaiting operator confirmation.
 *   5. Budgets, loop fingerprints and no-progress detection end the run with
 *      an explicit stop reason instead of spinning.
 */

import {
  assertInvocationAllowed,
  buildInvocation,
  InvocationLedger,
  newCorrelationId,
  type InvocationBudget,
} from "@/lib/capability/capability-invocation";
import type {
  CapabilityDefinition,
  CapabilityReasonCode,
  CapabilityResultStatus,
} from "@/lib/capability/capability-contract";
import type { OperatorPrincipal } from "@/lib/capability/capability-permissions";
import type { ResolveInput } from "@/lib/capability/capability-resolver";
import type { EvidenceConfidence, EvidenceFact, EvidenceOrigin } from "@/lib/core/evidence-contract";
import { isSafeForOperationalGuidance } from "@/lib/core/evidence-contract";
import { realityLabel } from "@/lib/core/reality-boundary";
import {
  BUDGET_BY_MODE,
  emptyScratch,
  emptyUsage,
  STOP_NOTES,
  type AgentBudget,
  type AgentCycleRecord,
  type AgentIntent,
  type AgentMode,
  type AgentObservation,
  type AgentRun,
  type AgentRunState,
  type AgentStopReason,
  type AgentTask,
} from "./agent-contract";
import { intentFingerprint, observationFingerprint } from "./agent-fingerprint";
import { emitAgentCycle, emitAgentFinished, emitAgentStarted } from "./agent-events";

/* ------------------------------------------------------------------ */
/* Ports                                                               */
/* ------------------------------------------------------------------ */

export interface AgentReasoningContext {
  task: AgentTask;
  cycle: number;
  observations: AgentObservation[];
  scratch: AgentRun["scratch"];
  remaining: { cycles: number; capabilityCalls: number; searches: number };
  /** Capability ids the runtime will accept this cycle. */
  allowedCapabilityIds: string[];
  /** Why the previous cycle was refused, so the model can change course. */
  lastBlock?: { reasonCodes: CapabilityReasonCode[]; message: string };
}

export type AgentReasoner = (ctx: AgentReasoningContext) => Promise<AgentIntent> | AgentIntent;

export interface AgentInvocationOutput {
  status: CapabilityResultStatus;
  /** Bounded, non-sensitive rendering of the result. */
  summary: string;
  facts?: EvidenceFact[];
  reasonCodes?: CapabilityReasonCode[];
}

export type AgentInvoker = (args: {
  definition: CapabilityDefinition;
  input: unknown;
  correlationId: string;
  cycle: number;
}) => Promise<AgentInvocationOutput> | AgentInvocationOutput;

export interface RunAgentInput {
  mode: AgentMode;
  objective: string;
  contextRef: string;
  operator: OperatorPrincipal;
  reason: AgentReasoner;
  invoke: AgentInvoker;
  /** Capability ids resolved as available for this context (Phase 16). */
  allowedCapabilityIds: string[];
  taskKind?: AgentTask["taskKind"];
  entityRefs?: AgentTask["entityRefs"];
  correlationId?: string;
  budget?: Partial<AgentBudget>;
  invocationBudget?: InvocationBudget;
  resolve?: Omit<ResolveInput, "operator" | "ids">;
  now?: () => number;
  runId?: string;
  /** Emit lifecycle events onto the Event Spine (off in tests). */
  emitEvents?: boolean;
}

/* ------------------------------------------------------------------ */
/* Reality Boundary normalization                                      */
/* ------------------------------------------------------------------ */

function normalizeObservation(args: {
  definition: CapabilityDefinition;
  output: AgentInvocationOutput;
  cycle: number;
  at: string;
}): AgentObservation {
  const { definition, output } = args;
  const origin: EvidenceOrigin = definition.evidence.origin ?? "retrieved";
  const confidence: EvidenceConfidence = definition.evidence.confidence ?? "unknown";

  const facts: EvidenceFact[] = [];
  const withheldFacts: Array<{ id: string; label: string }> = [];
  for (const fact of output.facts ?? []) {
    if (isSafeForOperationalGuidance(fact)) facts.push(fact);
    else withheldFacts.push({ id: fact.id, label: realityLabel(fact) });
  }

  return {
    id: `${args.cycle}:${definition.id}`,
    cycle: args.cycle,
    capabilityId: definition.id,
    capabilityVersion: definition.version,
    status: output.status,
    summary: output.summary.slice(0, 1200),
    origin,
    confidence,
    reasonCodes: output.reasonCodes ?? [],
    facts,
    withheldFacts,
    fingerprint: observationFingerprint({
      capabilityId: definition.id,
      status: output.status,
      summary: output.summary,
      factIds: facts.map((f) => f.id),
    }),
    at: args.at,
  };
}

/* ------------------------------------------------------------------ */
/* Runtime                                                             */
/* ------------------------------------------------------------------ */

export async function runAgent(input: RunAgentInput): Promise<AgentRun> {
  const now = input.now ?? Date.now;
  const startedMs = now();
  const budget: AgentBudget = { ...BUDGET_BY_MODE[input.mode], ...(input.budget ?? {}) };
  const correlationId = input.correlationId ?? newCorrelationId("agent");

  const task: AgentTask = {
    id: input.runId ?? `run_${startedMs.toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    mode: input.mode,
    objective: input.objective.slice(0, 400),
    contextRef: input.contextRef,
    correlationId,
    ...(input.taskKind ? { taskKind: input.taskKind } : {}),
    ...(input.entityRefs ? { entityRefs: input.entityRefs } : {}),
    createdAt: new Date(startedMs).toISOString(),
  };

  const run: AgentRun = {
    task,
    state: "created",
    budget,
    usage: emptyUsage(),
    cycles: [],
    observations: [],
    scratch: emptyScratch(),
    startedAt: task.createdAt,
  };

  const ledger = new InvocationLedger(input.invocationBudget);
  const allowed = new Set(input.allowedCapabilityIds);
  const intentFingerprints: string[] = [];
  let lastBlock: AgentReasoningContext["lastBlock"];

  const finish = (state: AgentRunState, stopReason: AgentStopReason): AgentRun => {
    run.state = state;
    run.stopReason = stopReason;
    run.stopNote = STOP_NOTES[stopReason];
    run.usage.elapsedMs = now() - startedMs;
    run.endedAt = new Date(now()).toISOString();
    if (input.emitEvents !== false) emitAgentFinished(run);
    return run;
  };

  run.state = "running";
  if (input.emitEvents !== false) emitAgentStarted(run);

  try {
    while (true) {
      if (run.usage.cycles >= budget.maxCycles) return finish("blocked", "cycle_budget_exceeded");
      if (now() - startedMs >= budget.maxWallClockMs) return finish("blocked", "wall_clock_exceeded");
      if (run.usage.reasoningCalls >= budget.maxReasoningCalls) {
        return finish("blocked", "reasoning_budget_exceeded");
      }

      const cycle = run.usage.cycles + 1;
      run.usage.reasoningCalls += 1;
      const intent = await input.reason({
        task,
        cycle,
        observations: run.observations,
        scratch: run.scratch,
        remaining: {
          cycles: budget.maxCycles - run.usage.cycles,
          capabilityCalls: budget.maxCapabilityCalls - run.usage.capabilityCalls,
          searches: budget.maxSearches - run.usage.searches,
        },
        allowedCapabilityIds: [...allowed],
        ...(lastBlock ? { lastBlock } : {}),
      });

      run.usage.cycles = cycle;
      const fingerprint = intentFingerprint(intent);
      const at = new Date(now()).toISOString();
      const record: AgentCycleRecord = {
        cycle,
        intentKind: intent.kind,
        fingerprint,
        progressed: false,
        at,
      };

      // Loop detection: the same governed step twice in a row is not reasoning.
      if (intentFingerprints.includes(fingerprint) && intent.kind === "invoke_capability") {
        run.cycles.push(record);
        return finish("blocked", "loop_detected");
      }
      intentFingerprints.push(fingerprint);
      lastBlock = undefined;

      if (intent.kind === "answer") {
        record.progressed = true;
        run.cycles.push(record);
        run.answer = intent.answer;
        return finish("completed", "answered");
      }

      if (intent.kind === "need_operator") {
        record.progressed = true;
        run.cycles.push(record);
        run.question = intent.question;
        return finish("blocked", "operator_input_required");
      }

      if (intent.kind === "stop") {
        run.cycles.push(record);
        return finish("completed", "model_stopped");
      }

      if (intent.kind === "propose_action") {
        record.progressed = true;
        run.cycles.push(record);
        if (input.mode !== "prepare_action") {
          return finish("blocked", "invalid_intent");
        }
        run.proposal = {
          actionType: intent.actionType,
          payload: intent.payload,
          ...(intent.reason ? { reason: intent.reason } : {}),
          requiresOperatorConfirmation: true,
        };
        run.state = "awaiting_confirmation";
        run.usage.elapsedMs = now() - startedMs;
        run.endedAt = new Date(now()).toISOString();
        run.stopReason = "proposal_prepared";
        run.stopNote = STOP_NOTES.proposal_prepared;
        if (input.emitEvents !== false) emitAgentFinished(run);
        return run;
      }

      /* ---- invoke_capability: exactly one per cycle ---------------- */
      record.capabilityId = intent.capabilityId;

      if (run.usage.capabilityCalls >= budget.maxCapabilityCalls) {
        run.cycles.push(record);
        return finish("blocked", "capability_budget_exceeded");
      }
      if (allowed.size && !allowed.has(intent.capabilityId)) {
        record.blocked = {
          reasonCodes: ["NOT_RELEVANT_TO_CONTEXT"],
          message: "That capability was not resolved as available for this context.",
        };
        lastBlock = record.blocked;
        run.cycles.push(record);
        run.usage.noProgressCycles += 1;
        if (run.usage.noProgressCycles >= budget.maxNoProgressCycles) {
          return finish("blocked", "capability_blocked");
        }
        continue;
      }

      const invocation = buildInvocation({
        capabilityId: intent.capabilityId,
        input: intent.input,
        contextRef: task.contextRef,
        requestedBy: "copilot",
        correlationId,
        ...(intent.entityRefs
          ? { entityRefs: intent.entityRefs.map((r) => ({ type: r.type, id: r.id })) }
          : {}),
      });
      if (!invocation) {
        record.blocked = {
          reasonCodes: ["UNSUPPORTED_OPERATION"],
          message: "No such capability is registered in this portal.",
        };
        lastBlock = record.blocked;
        run.cycles.push(record);
        run.usage.noProgressCycles += 1;
        if (run.usage.noProgressCycles >= budget.maxNoProgressCycles) {
          return finish("blocked", "capability_blocked");
        }
        continue;
      }

      const verdict = assertInvocationAllowed({
        invocation,
        operator: input.operator,
        ledger,
        ...(input.resolve ? { resolve: input.resolve } : {}),
      });

      if (!verdict.allowed) {
        record.blocked = { reasonCodes: verdict.reasonCodes, message: verdict.message };
        lastBlock = record.blocked;
        run.cycles.push(record);
        run.usage.noProgressCycles += 1;
        if (input.emitEvents !== false) emitAgentCycle(run, intent.capabilityId);
        if (run.usage.noProgressCycles >= budget.maxNoProgressCycles) {
          return finish("blocked", "capability_blocked");
        }
        continue;
      }

      if (verdict.definition.operation === "search") {
        if (run.usage.searches >= budget.maxSearches) {
          run.cycles.push(record);
          return finish("blocked", "search_budget_exceeded");
        }
        run.usage.searches += 1;
      }
      run.usage.capabilityCalls += 1;

      const output = await input.invoke({
        definition: verdict.definition,
        input: verdict.input,
        correlationId,
        cycle,
      });
      const observation = normalizeObservation({
        definition: verdict.definition,
        output,
        cycle,
        at: new Date(now()).toISOString(),
      });

      const known = new Set(run.observations.map((o) => o.fingerprint));
      record.progressed = !known.has(observation.fingerprint);
      record.observationId = observation.id;
      run.observations.push(observation);
      run.cycles.push(record);
      if (input.emitEvents !== false) emitAgentCycle(run, verdict.definition.id);

      if (record.progressed) run.usage.noProgressCycles = 0;
      else {
        run.usage.noProgressCycles += 1;
        if (run.usage.noProgressCycles >= budget.maxNoProgressCycles) {
          return finish("blocked", "no_progress");
        }
      }
    }
  } catch {
    return finish("failed", "runtime_error");
  }
}