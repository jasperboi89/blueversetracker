/**
 * Phase 9 — canonical Worker Registry.
 *
 * Worker policy lives HERE, never scattered across prompts. A prompt may
 * describe tone; it may not grant a capability, raise autonomy, widen
 * sensitivity, or extend a budget.
 */

import {
  MAX_WORKER_AUTONOMY,
  WORKER_IDS,
  isWithinWorkerAutonomy,
  type WorkerBudget,
  type WorkerDefinition,
  type WorkerHealth,
  type WorkerId,
  type WorkerTaskKind,
} from "./worker-contract";

const READ_BUDGET: WorkerBudget = {
  maxToolCalls: 4,
  maxEvidenceItems: 12,
  maxContextChars: 8_000,
  maxIterations: 1,
  maxElapsedMs: 12_000,
};

const DEEP_BUDGET: WorkerBudget = {
  maxToolCalls: 6,
  maxEvidenceItems: 20,
  maxContextChars: 14_000,
  maxIterations: 2,
  maxElapsedMs: 20_000,
};

const REVIEW_BUDGET: WorkerBudget = {
  maxToolCalls: 0,
  maxEvidenceItems: 24,
  maxContextChars: 6_000,
  maxIterations: 1,
  maxElapsedMs: 8_000,
};

/** Never allowed to any Phase 9 worker, regardless of role or prompt. */
export const GLOBALLY_FORBIDDEN_CAPABILITIES = [
  "script.deploy",
  "script.edit",
  "dispatch.execute",
  "ticket.close",
  "routing.change",
  "config.write",
  "test.mark_passed",
  "investigation.verify_cause",
];

const DEFINITIONS: WorkerDefinition[] = [
  {
    id: "investigator",
    version: 1,
    role: "Causal investigation specialist",
    mission:
      "Explain why an operational problem may be occurring, contradiction-first, without turning correlation into causation.",
    supportedTasks: ["explain_cause", "challenge_conclusion"],
    requiredEvidence: ["investigation", "hypothesis", "anomaly", "pattern", "ledger_event", "resolution", "discriminating_test"],
    allowedCapabilities: [
      "investigation.read",
      "evidence.read",
      "anomaly.read",
      "pattern.read",
      "resolution.read",
      "investigation.prepare_test",
    ],
    forbiddenCapabilities: [...GLOBALLY_FORBIDDEN_CAPABILITIES],
    maxAutonomy: "prepare",
    maxOperationClass: "prepare",
    budget: DEEP_BUDGET,
    cognitionTier: "deep",
    model: {
      reasoningDepth: "deep",
      latencyProfile: "interactive",
      contextRequirement: "medium",
      privacy: "restricted",
      toolSupport: true,
    },
    maxSensitivity: "sensitive",
    outputSchema: ["claims", "contradictions", "uncertainties", "recommendations", "preparedArtifacts"],
    fallback:
      "Fall back to the canonical investigation record rendered without narrative explanation.",
    sideEffects: "prepared_artifacts",
    confirmationRequirement: "operator_confirms_prepared",
    verificationRequirement:
      "A cause is verified only by the investigation engine's canonical verification rule, never by this worker.",
  },
  {
    id: "simulator",
    version: 1,
    role: "Structural simulation specialist",
    mission:
      "Explain what the current or proposed script structure would do under a scenario, using the deterministic simulator as the only source of simulated truth.",
    supportedTasks: ["structural_what_if"],
    requiredEvidence: ["script_structure", "simulation"],
    allowedCapabilities: ["script.structure.read", "simulation.run", "simulation.compare", "simulation.prepare_test_plan"],
    forbiddenCapabilities: [...GLOBALLY_FORBIDDEN_CAPABILITIES],
    maxAutonomy: "prepare",
    maxOperationClass: "prepare",
    budget: DEEP_BUDGET,
    cognitionTier: "standard",
    model: {
      reasoningDepth: "moderate",
      latencyProfile: "interactive",
      contextRequirement: "medium",
      privacy: "restricted",
      toolSupport: true,
    },
    maxSensitivity: "sensitive",
    outputSchema: ["claims", "evidence", "uncertainties", "recommendations", "preparedArtifacts"],
    fallback:
      "Fall back to the deterministic simulator output rendered directly, with no narrative layer.",
    sideEffects: "prepared_artifacts",
    confirmationRequirement: "operator_confirms_prepared",
    verificationRequirement: "A simulated path always requires a live test before production reliance.",
  },
  {
    id: "forecaster",
    version: 1,
    role: "Comparable-state outlook specialist",
    mission:
      "Explain what tended to happen after comparable historical states, preserving band, horizon and evidence quality exactly as the forecasting engine produced them.",
    supportedTasks: ["future_outlook"],
    requiredEvidence: ["forecast", "comparable_state", "anomaly"],
    allowedCapabilities: ["forecast.read", "anomaly.read", "comparable_state.read"],
    forbiddenCapabilities: [...GLOBALLY_FORBIDDEN_CAPABILITIES],
    maxAutonomy: "recommend",
    maxOperationClass: "analyze",
    budget: READ_BUDGET,
    cognitionTier: "standard",
    model: {
      reasoningDepth: "moderate",
      latencyProfile: "interactive",
      contextRequirement: "small",
      privacy: "restricted",
      toolSupport: true,
    },
    maxSensitivity: "sensitive",
    outputSchema: ["claims", "evidence", "uncertainties", "recommendations"],
    fallback: "Fall back to the canonical forecast record, including INSUFFICIENT FORECAST EVIDENCE.",
    sideEffects: "none",
    confirmationRequirement: "not_applicable",
    verificationRequirement: "Forecast accuracy is graded only by the canonical outcome-grading seam.",
  },
  {
    id: "researcher",
    version: 1,
    role: "Institutional knowledge specialist",
    mission:
      "Surface what we already know — prior resolutions, completed work, curated knowledge — with provenance, and name the gaps instead of filling them.",
    supportedTasks: ["prior_knowledge"],
    requiredEvidence: ["resolution", "knowledge_note", "completed_work", "change_record", "ledger_event"],
    allowedCapabilities: ["knowledge.read", "resolution.read", "work.read", "change.read"],
    forbiddenCapabilities: [...GLOBALLY_FORBIDDEN_CAPABILITIES, "knowledge.write"],
    maxAutonomy: "explain",
    maxOperationClass: "read",
    budget: READ_BUDGET,
    cognitionTier: "fast",
    model: {
      reasoningDepth: "shallow",
      latencyProfile: "interactive",
      contextRequirement: "medium",
      privacy: "restricted",
      toolSupport: true,
    },
    maxSensitivity: "internal",
    outputSchema: ["claims", "evidence", "uncertainties", "recommendations"],
    fallback: "Fall back to a plain Knowledge Vault / Resolution Memory list with no synthesis.",
    sideEffects: "none",
    confirmationRequirement: "not_applicable",
    verificationRequirement: "Historical resolutions are authoritative only for what happened, not for current structure.",
  },
  {
    id: "critic",
    version: 1,
    role: "Adversarial reviewer",
    mission:
      "Find what a contribution is missing or overclaiming: unsupported inference, causal overreach, forecast certainty, simulation-to-live confusion, temporal leakage, sensitivity leaks.",
    supportedTasks: ["challenge_conclusion", "synthesis"],
    requiredEvidence: [],
    allowedCapabilities: [],
    forbiddenCapabilities: [...GLOBALLY_FORBIDDEN_CAPABILITIES],
    maxAutonomy: "explain",
    maxOperationClass: "analyze",
    budget: REVIEW_BUDGET,
    cognitionTier: "fast",
    model: {
      reasoningDepth: "moderate",
      latencyProfile: "interactive",
      contextRequirement: "small",
      privacy: "restricted",
      toolSupport: false,
    },
    maxSensitivity: "internal",
    outputSchema: ["issues", "revisionRequested", "summary"],
    fallback: "Run continues with an explicit 'critique unavailable' uncertainty attached.",
    sideEffects: "none",
    confirmationRequirement: "not_applicable",
    verificationRequirement: "Critic findings never verify or reject canonical state; they annotate the response.",
  },
  {
    id: "guardian",
    version: 1,
    role: "Governance authority",
    mission:
      "Decide whether a requested action or contribution is permitted and sufficiently grounded, using the Capability Registry and authorization — never prompt-only policy.",
    supportedTasks: ["governance_check"],
    requiredEvidence: [],
    allowedCapabilities: [],
    forbiddenCapabilities: [...GLOBALLY_FORBIDDEN_CAPABILITIES],
    maxAutonomy: "observe",
    maxOperationClass: "read",
    budget: REVIEW_BUDGET,
    cognitionTier: "fast",
    model: {
      reasoningDepth: "shallow",
      latencyProfile: "interactive",
      contextRequirement: "small",
      privacy: "restricted",
      toolSupport: false,
    },
    maxSensitivity: "restricted",
    outputSchema: ["decision", "reasonCodes", "limits", "explanation"],
    fallback: "Guardian unavailable fails CLOSED: capability progression is blocked.",
    sideEffects: "none",
    confirmationRequirement: "not_applicable",
    verificationRequirement: "Guardian never produces factual evidence; it only governs.",
  },
];

const BY_ID = new Map<WorkerId, WorkerDefinition>(DEFINITIONS.map((d) => [d.id, d]));

export function allWorkers(): WorkerDefinition[] {
  return DEFINITIONS.slice();
}

export function getWorker(id: WorkerId): WorkerDefinition {
  const def = BY_ID.get(id);
  if (!def) throw new Error(`Unknown worker: ${id}`);
  return def;
}

export function workersForTask(kind: WorkerTaskKind): WorkerDefinition[] {
  return DEFINITIONS.filter((d) => d.supportedTasks.includes(kind));
}

export interface RegistryProblem {
  workerId: WorkerId;
  code: "AUTONOMY_EXCEEDED" | "EXECUTE_OPERATION" | "FORBIDDEN_OVERLAP" | "MISSING_FORBIDDEN_BASELINE";
  detail: string;
}

/** Static invariants — asserted by tests and by the admin inspector. */
export function validateRegistry(): RegistryProblem[] {
  const problems: RegistryProblem[] = [];
  for (const def of DEFINITIONS) {
    if (!isWithinWorkerAutonomy(def.maxAutonomy)) {
      problems.push({
        workerId: def.id,
        code: "AUTONOMY_EXCEEDED",
        detail: `${def.id} declares ${def.maxAutonomy}, above the Phase 9 ceiling ${MAX_WORKER_AUTONOMY}.`,
      });
    }
    if (def.maxOperationClass === "execute") {
      problems.push({
        workerId: def.id,
        code: "EXECUTE_OPERATION",
        detail: `${def.id} may not declare the EXECUTE operation class in Phase 9.`,
      });
    }
    const overlap = def.allowedCapabilities.filter((c) => def.forbiddenCapabilities.includes(c));
    if (overlap.length) {
      problems.push({
        workerId: def.id,
        code: "FORBIDDEN_OVERLAP",
        detail: `${def.id} both allows and forbids: ${overlap.join(", ")}.`,
      });
    }
    const missingBaseline = GLOBALLY_FORBIDDEN_CAPABILITIES.filter(
      (c) => !def.forbiddenCapabilities.includes(c),
    );
    if (missingBaseline.length) {
      problems.push({
        workerId: def.id,
        code: "MISSING_FORBIDDEN_BASELINE",
        detail: `${def.id} is missing baseline forbidden capabilities: ${missingBaseline.join(", ")}.`,
      });
    }
  }
  return problems;
}

/* ------------------------------------------------------------------ */
/* Health                                                              */
/* ------------------------------------------------------------------ */

const health = new Map<WorkerId, WorkerHealth>();

export const workerHealth = {
  get(id: WorkerId): WorkerHealth {
    return health.get(id) ?? "healthy";
  },
  set(id: WorkerId, state: WorkerHealth): void {
    health.set(id, state);
  },
  reset(): void {
    health.clear();
  },
  snapshot(): Record<WorkerId, WorkerHealth> {
    const out = {} as Record<WorkerId, WorkerHealth>;
    for (const id of WORKER_IDS) out[id] = health.get(id) ?? "healthy";
    return out;
  },
};

export function isWorkerAvailable(id: WorkerId): boolean {
  const state = workerHealth.get(id);
  return state === "healthy" || state === "degraded";
}
