/**
 * Phase 9 — the Orchestrator.
 *
 * It is a governed coordinator, NOT a smarter worker and NOT an autonomous
 * agent. It decides who is asked, in what order, under what budget, and it
 * stops. Every run is bounded, deterministic in its routing, and terminates on
 * an explicit stop reason.
 */

import {
  DEFAULT_RUN_BUDGET,
  emptyOutput,
  emptyScratch,
  type CognitiveRun,
  type CriticResult,
  type RunBudget,
  type RunBudgetUsage,
  type RunStopReason,
  type SensitivityClass,
  type WorkerId,
  type WorkerInput,
  type WorkerOutput,
  type WorkerParticipation,
  type WorkerTaskKind,
} from "./worker-contract";
import { getWorker, isWorkerAvailable } from "./worker-registry";
import { parseDirectives, planRoute, type OperatorDirectives } from "./router";
import { scopeSnapshot, selectEvidence, refFor, type CanonicalSnapshot } from "./canonical-sources";
import { validateClaims } from "./claim-validation";
import { reviseContribution, runCritic } from "./critic";
import { runGuardian } from "./guardian";
import { assembleResponse } from "./assembler";
import { runInvestigator } from "./workers/investigator";
import { runSimulator } from "./workers/simulator";
import { runForecaster } from "./workers/forecaster";
import { runResearcher } from "./workers/researcher";
import type { HubRole } from "@/lib/auth/authorization.functions";

export interface OrchestrateRequest {
  taskId: string;
  correlationId: string;
  intent: string;
  operatorRef: string;
  operatorRole: HubRole | null;
  accountId?: string;
  asOf?: string;
  sensitivity?: SensitivityClass;
  requestedCapabilityId?: string;
  requestedAutonomousExecution?: boolean;
  snapshot: CanonicalSnapshot;
  budget?: Partial<RunBudget>;
  directives?: OperatorDirectives;
  now?: () => number;
}

type SpecialistRunner = (input: WorkerInput, snapshot: CanonicalSnapshot) => WorkerOutput;

const RUNNERS: Partial<Record<WorkerId, SpecialistRunner>> = {
  investigator: runInvestigator,
  simulator: runSimulator,
  forecaster: runForecaster,
  researcher: runResearcher,
};

export function orchestrate(req: OrchestrateRequest): CognitiveRun {
  const clock = req.now ?? (() => Date.now());
  const startedAtMs = clock();
  const budget: RunBudget = { ...DEFAULT_RUN_BUDGET, ...(req.budget ?? {}) };
  const sensitivity: SensitivityClass = req.sensitivity ?? "internal";
  const directives = req.directives ?? parseDirectives(req.intent);

  const snapshot = scopeSnapshot(req.snapshot, req.accountId, req.asOf);

  const plan = planRoute({
    intent: req.intent,
    ...(req.accountId ? { accountId: req.accountId } : {}),
    directives,
    ...(req.requestedCapabilityId ? { requestedCapabilityId: req.requestedCapabilityId } : {}),
    ...(req.requestedAutonomousExecution ? { requestedAutonomousExecution: true } : {}),
    hasScriptStructure: snapshot.scriptStructures.length > 0,
  });

  const usage: RunBudgetUsage = { workers: 0, invocations: 0, depth: 0, revisions: 0, elapsedMs: 0 };
  const participation: WorkerParticipation[] = [];
  const contributions: WorkerOutput[] = [];
  const critiques: CriticResult[] = [];
  const fingerprints = new Set<string>();
  let stopReason: RunStopReason | undefined;

  const run = (): void => {
    if (plan.direct) {
      stopReason = "direct_response";
      return;
    }

    const waves = Array.from(new Set(plan.steps.map((s) => s.wave))).sort((a, b) => a - b);

    for (const wave of waves) {
      if (stopReason) return;
      if (usage.depth >= budget.maxOrchestrationDepth) {
        stopReason = "depth_exceeded";
        return;
      }
      usage.depth += 1;

      for (const step of plan.steps.filter((s) => s.wave === wave)) {
        if (stopReason) return;
        if (clock() - startedAtMs > budget.maxElapsedMs) {
          stopReason = "wall_clock_exceeded";
          return;
        }
        if (usage.workers >= budget.maxWorkers) {
          stopReason = "worker_budget_exceeded";
          return;
        }
        if (usage.invocations >= budget.maxWorkerInvocations) {
          stopReason = "invocation_budget_exceeded";
          return;
        }

        const runner = RUNNERS[step.workerId];
        const def = getWorker(step.workerId);
        const input = buildInput(req, step.workerId, step.taskKind, sensitivity, snapshot);

        usage.workers += 1;
        usage.invocations += 1;

        let output: WorkerOutput;
        if (!runner || !isWorkerAvailable(step.workerId)) {
          output = emptyOutput(def, input, "unavailable", def.fallback);
        } else {
          const started = clock();
          try {
            output = runner(input, snapshot);
          } catch {
            output = emptyOutput(def, input, "failed", `${def.role} could not complete; the canonical record is unchanged.`);
          }
          output.elapsedMs = clock() - started;
        }

        const validated = validateClaims(output, snapshot, {
          ...(req.accountId ? { accountId: req.accountId } : {}),
          ...(req.asOf ? { asOf: req.asOf } : {}),
        });
        output = validated.output;

        const fp = fingerprint(output);
        if (fingerprints.has(fp)) {
          stopReason = "duplicate_task";
          return;
        }
        fingerprints.add(fp);

        let revision = 0;
        if (plan.criticRequired && output.status === "contributed") {
          if (usage.invocations < budget.maxWorkerInvocations) {
            usage.invocations += 1;
            const critique = runCritic(
              { ...input, workerId: "critic", reviewTarget: output },
              output,
              {
                ...(req.asOf ? { asOf: req.asOf } : {}),
                ...(req.accountId ? { accountId: req.accountId } : {}),
                peers: contributions,
              },
            );
            critiques.push(critique);
            if (critique.revisionRequested && usage.revisions < budget.maxRevisions) {
              usage.revisions += 1;
              revision = 1;
              output = reviseContribution(output, critique);
            }
          }
        }

        contributions.push(output);
        participation.push({
          workerId: output.workerId,
          workerVersion: output.workerVersion,
          status: output.status,
          routeReason: step.reason,
          fingerprint: fp,
          revision,
          elapsedMs: output.elapsedMs,
        });
      }
    }

    if (!contributions.length) {
      stopReason = "all_workers_unavailable";
      return;
    }
    if (contributions.every((c) => c.status === "unavailable" || c.status === "failed")) {
      stopReason = "all_workers_unavailable";
    }
  };

  run();

  const guardian = plan.guardianRequired
    ? runGuardian({
        taskId: req.taskId,
        correlationId: req.correlationId,
        operatorRole: req.operatorRole,
        operatorRef: req.operatorRef,
        ...(req.accountId ? { accountId: req.accountId } : {}),
        ...(req.requestedCapabilityId ? { requestedCapabilityId: req.requestedCapabilityId } : {}),
        contributions,
        ...(req.requestedAutonomousExecution ? { requestedAutonomousExecution: true } : {}),
        sensitivity,
      })
    : undefined;

  if (guardian && !guardian.available) stopReason = "guardian_unavailable";
  else if (guardian && (guardian.decision === "BLOCK" || guardian.decision === "INSUFFICIENT_AUTHORITY")) {
    stopReason = "guardian_blocked";
  }

  const unavailableNotes = snapshot.unavailableSources.length
    ? [`Some sources could not be read this run: ${snapshot.unavailableSources.join(", ")}.`]
    : [];

  const response = assembleResponse({
    intent: req.intent,
    contributions,
    critiques,
    ...(guardian ? { guardian } : {}),
    ...(directives.evidenceOnly ? { evidenceOnly: true } : {}),
    unavailableNotes,
    refusedDirectives: plan.refusedDirectives,
  });

  usage.elapsedMs = clock() - startedAtMs;

  const state: CognitiveRun["state"] =
    stopReason === "guardian_blocked" || stopReason === "guardian_unavailable"
      ? "blocked"
      : response.status === "partial"
        ? "partial"
        : response.status === "blocked"
          ? "blocked"
          : "completed";

  return {
    correlationId: req.correlationId,
    taskId: req.taskId,
    state,
    intent: req.intent,
    intentClass: plan.intentClass,
    operatorRef: req.operatorRef,
    ...(req.accountId ? { accountId: req.accountId } : {}),
    ...(req.asOf ? { asOf: req.asOf } : {}),
    cognitionTier: plan.cognitionTier,
    plan,
    participation,
    contributions,
    critiques,
    ...(guardian ? { guardian } : {}),
    disagreements: response.disagreements,
    response,
    budget,
    usage,
    stopReason: stopReason ?? "completed",
    startedAt: new Date(startedAtMs).toISOString(),
    endedAt: new Date(clock()).toISOString(),
  };
}

function buildInput(
  req: OrchestrateRequest,
  workerId: WorkerId,
  taskKind: WorkerTaskKind,
  sensitivity: SensitivityClass,
  snapshot: CanonicalSnapshot,
): WorkerInput {
  const def = getWorker(workerId);
  const evidence = def.requiredEvidence.flatMap((kind) =>
    selectEvidence(recordsFor(snapshot, kind), 4).map((r) => refFor(kind, r)),
  );
  return {
    taskId: req.taskId,
    correlationId: req.correlationId,
    workerId,
    taskKind,
    operatorRef: req.operatorRef,
    operatorRole: req.operatorRole,
    ...(req.accountId ? { accountId: req.accountId } : {}),
    intent: req.intent,
    evidence: evidence.slice(0, def.budget.maxEvidenceItems),
    allowedCapabilities: def.allowedCapabilities,
    autonomy: def.maxAutonomy,
    sensitivity: minSensitivity(sensitivity, def.maxSensitivity),
    ...(req.asOf ? { asOf: req.asOf } : {}),
    budget: def.budget,
    scratch: emptyScratch(),
  };
}

const SENSITIVITY_ORDER: SensitivityClass[] = ["public", "internal", "sensitive", "restricted"];
function minSensitivity(a: SensitivityClass, b: SensitivityClass): SensitivityClass {
  return SENSITIVITY_ORDER.indexOf(a) <= SENSITIVITY_ORDER.indexOf(b) ? a : b;
}

function recordsFor(snapshot: CanonicalSnapshot, kind: string) {
  switch (kind) {
    case "investigation":
      return snapshot.investigations;
    case "hypothesis":
      return snapshot.investigations.flatMap((i) => i.hypotheses);
    case "discriminating_test":
      return snapshot.investigations.flatMap((i) => i.preparedTests);
    case "anomaly":
      return snapshot.anomalies;
    case "forecast":
      return snapshot.forecasts;
    case "comparable_state":
      return snapshot.comparableStates;
    case "simulation":
      return snapshot.simulations;
    case "script_structure":
      return snapshot.scriptStructures;
    case "pattern":
      return snapshot.patterns;
    case "resolution":
      return snapshot.resolutions;
    case "knowledge_note":
      return snapshot.knowledgeNotes;
    case "completed_work":
      return snapshot.completedWork;
    case "change_record":
      return snapshot.changeRecords;
    case "ledger_event":
      return snapshot.ledgerEvents;
    default:
      return [];
  }
}

/** Deterministic contribution fingerprint for duplicate / no-progress detection. */
export function fingerprint(output: WorkerOutput): string {
  const parts = [
    output.workerId,
    output.status,
    ...output.claims.map((c) => `${c.type}:${c.statement}`),
    ...output.evidence.map((e) => `${e.kind}:${e.id}`),
  ];
  let hash = 0;
  const s = parts.join("|");
  for (let i = 0; i < s.length; i += 1) {
    hash = (hash * 31 + s.charCodeAt(i)) | 0;
  }
  return `${output.workerId}-${(hash >>> 0).toString(36)}`;
}
