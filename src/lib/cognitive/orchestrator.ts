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
  isSpecialist,
  emptyScratch,
  type CognitiveRun,
  type CriticResult,
  type RunBudget,
  type InjectionMarker,
  type RunBudgetUsage,
  type RunClaimValidationIssue,
  type RouteStep,
  type RunEvent,
  type RunStopReason,
  type SkippedWorker,
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
import { sanitizeRetrievedText } from "./sanitize";
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
  const claimValidation: RunClaimValidationIssue[] = [];
  const injectionMarkers: InjectionMarker[] = [];
  const events: RunEvent[] = [];
  const fingerprints = new Set<string>();
  let stopReason: RunStopReason | undefined;

  const note = (label: string): void => {
    events.push({ at: new Date(clock()).toISOString(), label });
  };

  note("Run started");
  const intentScan = sanitizeRetrievedText(req.intent);
  if (intentScan.flagged) {
    injectionMarkers.push({ source: "operator intent", codes: intentScan.codes });
    note("Instruction-like content in the request treated as data");
  }
  note(
    plan.direct
      ? "Routed → direct response (no specialist required)"
      : `Routed → ${plan.steps.map((s) => s.workerId).join(", ") || "governance only"}`,
  );


  // Claims/evidence seen so far — powers no-progress detection (§8), which is
  // deliberately distinct from the identical-output loop fingerprint (§7).
  const seenFacts = new Set<string>();
  let noProgressStreak = 0;
  let criticUnavailable = false;
  /** Specialist requests a worker raised; the ORCHESTRATOR decides (§9). */
  const specialistRequests: Array<{ from: WorkerId; to: WorkerId; granted: boolean; reason: string }> = [];

  const run = (): void => {
    if (plan.direct) {
      stopReason = plan.unavailableWorkers?.length ? "all_workers_unavailable" : "direct_response";
      return;
    }

    const queue: RouteStep[] = plan.steps.slice();
    const waves = () => Array.from(new Set(queue.map((s) => s.wave))).sort((a, b) => a - b);
    const done = new Set<WorkerId>();

    for (let w = 0; w < waves().length; w += 1) {
      const wave = waves()[w];
      if (stopReason) return;
      if (usage.depth >= budget.maxOrchestrationDepth) {
        stopReason = "depth_exceeded";
        return;
      }
      usage.depth += 1;

      for (const step of queue.filter((s) => s.wave === wave)) {
        if (stopReason) return;
        if (done.has(step.workerId)) continue;
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
        done.add(step.workerId);

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
        for (const issue of validated.issues) {
          claimValidation.push({
            claimId: issue.claimId,
            kind: issue.ref.kind,
            id: issue.ref.id,
            code: issue.code,
          });
        }
        if (validated.issues.length) {
          note(`${validated.issues.length} unverifiable canonical reference(s) rejected`);
        }
        for (const ref of output.evidence) {
          if (!ref.label) continue;
          const scan = sanitizeRetrievedText(ref.label);
          if (scan.flagged) {
            injectionMarkers.push({ source: `${ref.kind}:${ref.id}`, codes: scan.codes });
          }
        }

        const fp = fingerprint(output);
        if (fingerprints.has(fp)) {
          stopReason = "duplicate_task";
          note("Loop detected: an identical contribution was produced again");
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
            if (critique.status === "unavailable") {
              criticUnavailable = true;
              note("Critic unavailable for a review that policy requires");
            }
            const material = critique.issues.filter((i) => i.material).map((i) => i.code);
            note(
              material.length
                ? `Critic reviewed ${output.workerId}: ${material.join(", ")}`
                : `Critic reviewed ${output.workerId}: no material issue`,
            );
            if (critique.revisionRequested && usage.revisions < budget.maxRevisions) {
              usage.revisions += 1;
              revision = 1;
              output = reviseContribution(output, critique);
              note(`Revision completed for ${output.workerId} (1 / ${budget.maxRevisions})`);
            }
          } else {
            criticUnavailable = true;
            note("Required critique could not run within the invocation budget");
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
        note(`${output.workerId} ${output.status}`);

        // No-progress: a contribution that adds no new validated claim and no
        // new evidence reference. Two in a row and the run stops rather than
        // spending the remaining budget on identical cognition.
        const before = seenFacts.size;
        for (const c of output.claims) seenFacts.add(`claim:${c.statement}`);
        for (const e of output.evidence) seenFacts.add(`ev:${e.kind}:${e.id}`);
        if (seenFacts.size === before && output.status === "contributed") {
          noProgressStreak += 1;
          if (noProgressStreak >= 2) {
            stopReason = "no_progress";
            note("Stopped: repeated cognition produced no new validated claims or evidence");
            return;
          }
        } else if (seenFacts.size > before) {
          noProgressStreak = 0;
        }

        // A worker may REQUEST another specialist; it may never invoke one.
        if (output.needsSpecialist) {
          const to = output.needsSpecialist;
          const decision = grantSpecialist(to, done, queue, snapshot, usage, budget);
          specialistRequests.push({ from: output.workerId, to, granted: decision.granted, reason: decision.reason });
          note(
            `${output.workerId} requested ${to}: orchestrator ${decision.granted ? "granted" : "declined"} — ${decision.reason}`,
          );
          if (decision.granted) {
            queue.push({
              workerId: to,
              taskKind: getWorker(to).supportedTasks[0],
              reason: `Requested by the ${getWorker(output.workerId).role}; granted by the orchestrator.`,
              wave: wave + 1,
            });
          }
        }
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

  if (guardian) note(`Guardian ${guardian.decision}`);
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

  if (criticUnavailable) {
    // Required critique is not optional: the run degrades rather than
    // presenting unchallenged findings as a complete answer (§42).
    response.uncertainties = Array.from(
      new Set([
        ...response.uncertainties,
        "A required independent critique did not run, so these findings were not challenged.",
      ]),
    );
    if (response.status === "answered") response.status = "partial";
  }

  note("Assembler completed");
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
    sensitivity,
    claimValidation,
    skippedWorkers: skippedWorkers(plan, directives, snapshot),
    specialistRequests,
    injectionMarkers,
    events,
    startedAt: new Date(startedAtMs).toISOString(),
    endedAt: new Date(clock()).toISOString(),
  };
}

/**
 * Materially relevant specialists the deterministic route chose NOT to invoke.
 * Only reasons that prove minimal sufficient cognition — never a full roster.
 */
function skippedWorkers(
  plan: CognitiveRun["plan"],
  directives: OperatorDirectives,
  snapshot: CanonicalSnapshot,
): SkippedWorker[] {
  const invoked = new Set(plan.steps.map((s) => s.workerId));
  const out: SkippedWorker[] = [];
  const add = (workerId: SkippedWorker["workerId"], reason: string) => {
    if (!invoked.has(workerId)) out.push({ workerId, reason });
  };
  if (plan.direct) return out;
  if (directives.noForecast) add("forecaster", "Forecasting excluded at your request.");
  else add("forecaster", "No future-state question was detected in the request.");
  if (!snapshot.scriptStructures.length) {
    add("simulator", "No canonical script structure is available to simulate against.");
  } else {
    add("simulator", "No structural what-if was requested.");
  }
  if (directives.noHistoricalResolutions) {
    add("researcher", "Historical resolutions excluded at your request.");
  } else {
    add("researcher", "No historical retrieval was required for this intent.");
  }
  add("investigator", "No causal question was detected in the request.");
  return out;
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

/**
 * Deterministic policy for a worker-raised specialist request (§9). The worker
 * never invokes anything itself; this decides, once, with a stated reason.
 */
function grantSpecialist(
  to: WorkerId,
  done: Set<WorkerId>,
  queue: RouteStep[],
  snapshot: CanonicalSnapshot,
  usage: RunBudgetUsage,
  budget: RunBudget,
): { granted: boolean; reason: string } {
  if (!isSpecialist(to)) return { granted: false, reason: "only specialists may be requested." };
  if (done.has(to) || queue.some((s) => s.workerId === to)) {
    return { granted: false, reason: "that specialist is already part of this run." };
  }
  if (!isWorkerAvailable(to)) return { granted: false, reason: "that specialist is unavailable." };
  if (usage.workers >= budget.maxWorkers || usage.invocations >= budget.maxWorkerInvocations) {
    return { granted: false, reason: "the run budget does not allow another specialist." };
  }
  if (to === "simulator" && !snapshot.scriptStructures.length) {
    return { granted: false, reason: "no canonical script structure is available to simulate against." };
  }
  if (to === "forecaster" && !snapshot.forecasts.length) {
    return { granted: false, reason: "no canonical forecast exists to read." };
  }
  return { granted: true, reason: "the request is within budget and canonically supported." };
}
