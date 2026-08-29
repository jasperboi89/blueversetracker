/**
 * Phase 9 — Specialized Intelligence Workers: shared contracts.
 *
 * A "worker" is a governed cognitive ROLE, not an autonomous agent and not a
 * separate chatbot. Workers read canonical intelligence, return structured
 * contributions, and never hold independent truth, independent memory, or the
 * authority to mutate production.
 *
 * Everything in this file is pure types + constants so the browser, the server
 * and the tests share one vocabulary.
 */

/* ------------------------------------------------------------------ */
/* Identity + versioning                                               */
/* ------------------------------------------------------------------ */

export const WORKER_IDS = [
  "investigator",
  "simulator",
  "forecaster",
  "researcher",
  "critic",
  "guardian",
] as const;
export type WorkerId = (typeof WORKER_IDS)[number];

/** Contribution-producing specialists (Critic/Guardian are reviewers). */
export const SPECIALIST_IDS: readonly WorkerId[] = [
  "investigator",
  "simulator",
  "forecaster",
  "researcher",
];

export function isSpecialist(id: WorkerId): boolean {
  return SPECIALIST_IDS.includes(id);
}

/* ------------------------------------------------------------------ */
/* Operation classes + autonomy                                        */
/* ------------------------------------------------------------------ */

/** Canonical operation classes. Phase 9 workers may never reach `execute`. */
export const OPERATION_CLASSES = ["read", "analyze", "prepare", "propose", "execute"] as const;
export type OperationClass = (typeof OPERATION_CLASSES)[number];

export const WORKER_AUTONOMY_LEVELS = ["observe", "explain", "recommend", "prepare"] as const;
export type WorkerAutonomy = (typeof WORKER_AUTONOMY_LEVELS)[number];

/** Hard Phase 9 ceiling. No worker definition may exceed it. */
export const MAX_WORKER_AUTONOMY: WorkerAutonomy = "prepare";

export function isWithinWorkerAutonomy(level: WorkerAutonomy): boolean {
  return WORKER_AUTONOMY_LEVELS.indexOf(level) <= WORKER_AUTONOMY_LEVELS.indexOf(MAX_WORKER_AUTONOMY);
}

/* ------------------------------------------------------------------ */
/* Evidence + sensitivity                                              */
/* ------------------------------------------------------------------ */

export const EVIDENCE_KINDS = [
  "investigation",
  "hypothesis",
  "discriminating_test",
  "anomaly",
  "forecast",
  "comparable_state",
  "simulation",
  "script_structure",
  "pattern",
  "ledger_event",
  "resolution",
  "knowledge_note",
  "completed_work",
  "change_record",
] as const;
export type EvidenceKind = (typeof EVIDENCE_KINDS)[number];

export interface WorkerEvidenceRef {
  kind: EvidenceKind;
  id: string;
  /** Account the reference belongs to — enforced against the task account. */
  accountId?: string;
  /** Short non-sensitive label. Never a body, script, note or ticket text. */
  label?: string;
  /** ISO timestamp the referenced fact was observed/recorded at. */
  at?: string;
}

export type SensitivityClass = "public" | "internal" | "sensitive" | "restricted";

/* ------------------------------------------------------------------ */
/* Claims                                                              */
/* ------------------------------------------------------------------ */

/**
 * Claim types are ranked: a worker may never silently promote a claim upward
 * (inference -> fact, correlation -> causation, forecast -> certainty,
 * simulation -> production behaviour).
 */
export const CLAIM_TYPES = [
  "observed_fact",
  "canonical_state",
  "association",
  "inference",
  "simulated_outcome",
  "forecast_observation",
  "historical_precedent",
  "gap",
] as const;
export type ClaimType = (typeof CLAIM_TYPES)[number];

export type ConfidenceClass = "verified" | "high" | "moderate" | "low" | "unknown";

export interface WorkerClaim {
  id: string;
  /** One sentence. Structured, non-causal, no operator-facing hedging theatre. */
  statement: string;
  type: ClaimType;
  confidence: ConfidenceClass;
  evidence: WorkerEvidenceRef[];
  /** Known limitations — always present for non-canonical claim types. */
  limitations: string[];
}

/* ------------------------------------------------------------------ */
/* Worker definition (the registry record)                             */
/* ------------------------------------------------------------------ */

export type WorkerHealth = "healthy" | "degraded" | "unavailable" | "blocked";

export interface WorkerBudget {
  maxToolCalls: number;
  maxEvidenceItems: number;
  maxContextChars: number;
  maxIterations: number;
  maxElapsedMs: number;
}

/** Cognition tier — cost/latency class, resolved by the AI Router. */
export type CognitionTier = "fast" | "standard" | "deep";

export interface WorkerModelRequirements {
  /** Never a hardcoded model id — the AI Router resolves the provider. */
  reasoningDepth: "shallow" | "moderate" | "deep";
  latencyProfile: "interactive" | "background";
  contextRequirement: "small" | "medium" | "large";
  /** Sensitive work must stay on approved profiles chosen by the router. */
  privacy: "standard" | "restricted";
  toolSupport: boolean;
}

export interface WorkerDefinition {
  id: WorkerId;
  version: number;
  role: string;
  mission: string;
  supportedTasks: WorkerTaskKind[];
  requiredEvidence: EvidenceKind[];
  /** Capability ids (Capability Registry) the worker may request. */
  allowedCapabilities: string[];
  /** Explicitly forbidden capability ids / action families. */
  forbiddenCapabilities: string[];
  maxAutonomy: WorkerAutonomy;
  maxOperationClass: OperationClass;
  budget: WorkerBudget;
  cognitionTier: CognitionTier;
  model: WorkerModelRequirements;
  /** Highest data sensitivity this worker may be handed. */
  maxSensitivity: SensitivityClass;
  /** Field names present in this worker's structured output. */
  outputSchema: string[];
  /** What happens when the worker cannot run. */
  fallback: string;
  /** Phase 10 seam — declared side effects / confirmation expectations. */
  sideEffects: "none" | "prepared_artifacts";
  confirmationRequirement: "not_applicable" | "operator_confirms_prepared";
  verificationRequirement: string;
}

/* ------------------------------------------------------------------ */
/* Task kinds (routing vocabulary)                                     */
/* ------------------------------------------------------------------ */

export const WORKER_TASK_KINDS = [
  "explain_cause",
  "challenge_conclusion",
  "structural_what_if",
  "future_outlook",
  "prior_knowledge",
  "governance_check",
  "synthesis",
] as const;
export type WorkerTaskKind = (typeof WORKER_TASK_KINDS)[number];

/* ------------------------------------------------------------------ */
/* Worker input / output contracts                                     */
/* ------------------------------------------------------------------ */

export interface WorkerInput {
  taskId: string;
  correlationId: string;
  workerId: WorkerId;
  taskKind: WorkerTaskKind;
  /** Reference only — never operator PII beyond the hub user id. */
  operatorRef: string;
  operatorRole: "admin" | "programmer" | "viewer" | null;
  accountId?: string;
  targetEntity?: { type: string; id: string };
  /** Normalized operator intent — already treated as untrusted text. */
  intent: string;
  evidence: WorkerEvidenceRef[];
  allowedCapabilities: string[];
  autonomy: WorkerAutonomy;
  sensitivity: SensitivityClass;
  /** Historical mode: evidence after this instant must be ignored. */
  asOf?: string;
  budget: WorkerBudget;
  /** Bounded per-run scratch handed to the worker; never durable. */
  scratch: WorkerScratch;
  /** Critic-only: the contribution under review. */
  reviewTarget?: WorkerOutput;
  /** Guardian-only: the action being governed. */
  requestedCapabilityId?: string;
  /** Revision pass: what the Critic asked to be fixed. */
  revisionOf?: { output: WorkerOutput; critique: CriticResult };
}

export const WORKER_STATUSES = [
  "contributed",
  "unknown",
  "insufficient_evidence",
  "not_applicable",
  "capability_blocked",
  "unavailable",
  "budget_exhausted",
  "failed",
] as const;
export type WorkerStatus = (typeof WORKER_STATUSES)[number];

export interface WorkerOutput {
  workerId: WorkerId;
  workerVersion: number;
  taskId: string;
  correlationId: string;
  status: WorkerStatus;
  /** Operator-facing sentence(s). Never a reasoning transcript. */
  summary: string;
  claims: WorkerClaim[];
  evidence: WorkerEvidenceRef[];
  uncertainties: string[];
  contradictions: string[];
  recommendations: string[];
  /** Prepared, never executed. */
  preparedArtifacts: PreparedArtifact[];
  /** Handoff request — the worker asks, the Orchestrator decides (§35). */
  needsSpecialist?: WorkerId;
  requestedCapabilityId?: string;
  confidence: ConfidenceClass;
  sensitivity: SensitivityClass;
  operationClass: OperationClass;
  elapsedMs: number;
  budgetUsed: Pick<WorkerBudget, "maxToolCalls" | "maxEvidenceItems">;
  notes: string[];
}

export interface PreparedArtifact {
  kind: "discriminating_test" | "simulation_scenario" | "live_test_plan" | "knowledge_gap";
  label: string;
  /** Structured, non-executable description. */
  detail: Record<string, string | number | boolean>;
  requiresOperatorConfirmation: true;
}

export interface WorkerScratch {
  notes: string[];
  openQuestions: string[];
}

export function emptyScratch(): WorkerScratch {
  return { notes: [], openQuestions: [] };
}

export function emptyOutput(
  def: Pick<WorkerDefinition, "id" | "version">,
  input: Pick<WorkerInput, "taskId" | "correlationId" | "sensitivity">,
  status: WorkerStatus,
  summary: string,
): WorkerOutput {
  return {
    workerId: def.id,
    workerVersion: def.version,
    taskId: input.taskId,
    correlationId: input.correlationId,
    status,
    summary,
    claims: [],
    evidence: [],
    uncertainties: [],
    contradictions: [],
    recommendations: [],
    preparedArtifacts: [],
    confidence: "unknown",
    sensitivity: input.sensitivity,
    operationClass: "read",
    elapsedMs: 0,
    budgetUsed: { maxToolCalls: 0, maxEvidenceItems: 0 },
    notes: [],
  };
}

/* ------------------------------------------------------------------ */
/* Critic                                                              */
/* ------------------------------------------------------------------ */

export const CRITIC_ISSUE_CODES = [
  "NO_MATERIAL_ISSUE",
  "MISSING_EVIDENCE",
  "CONTRADICTORY_EVIDENCE",
  "OVERCLAIM",
  "CAUSAL_OVERREACH",
  "FORECAST_OVERREACH",
  "SIMULATION_OVERREACH",
  "TEMPORAL_LEAKAGE_RISK",
  "PRIVACY_SENSITIVITY_ISSUE",
  "ALTERNATIVE_EXPLANATION_MISSING",
] as const;
export type CriticIssueCode = (typeof CRITIC_ISSUE_CODES)[number];

export interface CriticIssue {
  code: CriticIssueCode;
  /** Which claim/field the issue attaches to. */
  target: string;
  detail: string;
  /** Material issues trigger the single bounded revision pass. */
  material: boolean;
  suggestedFix?: string;
}

export interface CriticResult {
  workerId: "critic";
  workerVersion: number;
  taskId: string;
  correlationId: string;
  reviewedWorker: WorkerId;
  status: "reviewed" | "unavailable";
  issues: CriticIssue[];
  /** True when at least one issue is material. */
  revisionRequested: boolean;
  summary: string;
  elapsedMs: number;
}

/* ------------------------------------------------------------------ */
/* Guardian                                                            */
/* ------------------------------------------------------------------ */

export const GUARDIAN_DECISIONS = [
  "ALLOW",
  "ALLOW_WITH_LIMITS",
  "REQUIRE_HUMAN_CONFIRMATION",
  "BLOCK",
  "INSUFFICIENT_AUTHORITY",
] as const;
export type GuardianDecision = (typeof GUARDIAN_DECISIONS)[number];

export const GUARDIAN_REASON_CODES = [
  "READ_ONLY_CONTRIBUTION",
  "CAPABILITY_UNKNOWN",
  "CAPABILITY_UNAVAILABLE",
  "PERMISSION_MISSING",
  "AUTONOMY_CEILING",
  "CONFIRMATION_REQUIRED",
  "SENSITIVITY_EXCEEDED",
  "CROSS_ACCOUNT_EVIDENCE",
  "EVIDENCE_INSUFFICIENT",
  "PRODUCTION_SIDE_EFFECT",
  "GUARDIAN_UNAVAILABLE",
] as const;
export type GuardianReasonCode = (typeof GUARDIAN_REASON_CODES)[number];

export interface GuardianResult {
  workerId: "guardian";
  workerVersion: number;
  taskId: string;
  correlationId: string;
  decision: GuardianDecision;
  reasonCodes: GuardianReasonCode[];
  /** Operator-facing explanation of the governance boundary. */
  explanation: string;
  limits: string[];
  /** Capability the decision was made about, when applicable. */
  capabilityId?: string;
  available: boolean;
  elapsedMs: number;
}

/* ------------------------------------------------------------------ */
/* Cognitive run                                                       */
/* ------------------------------------------------------------------ */

export const COGNITIVE_RUN_STATES = [
  "created",
  "routed",
  "running",
  "critiqued",
  "governed",
  "completed",
  "partial",
  "blocked",
  "failed",
  "cancelled",
] as const;
export type CognitiveRunState = (typeof COGNITIVE_RUN_STATES)[number];

export interface RunBudget {
  maxWorkers: number;
  maxWorkerInvocations: number;
  maxOrchestrationDepth: number;
  maxRevisions: number;
  maxElapsedMs: number;
}

export const DEFAULT_RUN_BUDGET: RunBudget = {
  maxWorkers: 4,
  maxWorkerInvocations: 6,
  maxOrchestrationDepth: 2,
  maxRevisions: 1,
  maxElapsedMs: 45_000,
};

export interface RunBudgetUsage {
  workers: number;
  invocations: number;
  depth: number;
  revisions: number;
  elapsedMs: number;
}

export interface WorkerParticipation {
  workerId: WorkerId;
  workerVersion: number;
  status: WorkerStatus;
  routeReason: string;
  /** Deterministic fingerprint for duplicate/no-progress detection. */
  fingerprint: string;
  revision: number;
  elapsedMs: number;
}

/** A canonical reference a worker cited that failed validation. */
export interface RunClaimValidationIssue {
  claimId: string;
  kind: EvidenceKind;
  id: string;
  code: "UNKNOWN_REFERENCE" | "WRONG_ACCOUNT" | "FUTURE_EVIDENCE";
}

/** A worker the deterministic route considered but did not invoke. */
export interface SkippedWorker {
  workerId: WorkerId;
  reason: string;
}

/** Safe marker that retrieved content was treated strictly as data. */
export interface InjectionMarker {
  /** Where the hostile pattern was seen — never the hostile text itself. */
  source: string;
  codes: string[];
}

/** Compact cognitive lifecycle event. Never token-level or reasoning events. */
export interface RunEvent {
  at: string;
  label: string;
}

export interface CognitiveRun {
  correlationId: string;
  taskId: string;
  state: CognitiveRunState;
  intent: string;
  intentClass: WorkerTaskKind | "direct";
  operatorRef: string;
  accountId?: string;
  asOf?: string;
  cognitionTier: CognitionTier;
  sensitivity?: SensitivityClass;
  plan: RoutePlan;
  participation: WorkerParticipation[];
  contributions: WorkerOutput[];
  critiques: CriticResult[];
  guardian?: GuardianResult;
  disagreements: string[];
  /** Assembled operator-facing answer. */
  response?: AssembledResponse;
  budget: RunBudget;
  usage: RunBudgetUsage;
  stopReason?: RunStopReason;
  /** Canonical references rejected before assembly. */
  claimValidation?: RunClaimValidationIssue[];
  /** Materially relevant workers the route did not invoke, with the reason. */
  skippedWorkers?: SkippedWorker[];
  /** Retrieved content flagged as instruction-like and neutralised. */
  injectionMarkers?: InjectionMarker[];
  /** Compact structured lifecycle timeline. */
  events?: RunEvent[];
  startedAt: string;
  endedAt?: string;
}


export const RUN_STOP_REASONS = [
  "completed",
  "direct_response",
  "worker_budget_exceeded",
  "invocation_budget_exceeded",
  "depth_exceeded",
  "duplicate_task",
  "no_progress",
  "guardian_blocked",
  "guardian_unavailable",
  "all_workers_unavailable",
  "wall_clock_exceeded",
  "cancelled",
  "runtime_error",
] as const;
export type RunStopReason = (typeof RUN_STOP_REASONS)[number];

/* ------------------------------------------------------------------ */
/* Routing                                                             */
/* ------------------------------------------------------------------ */

export interface RouteStep {
  workerId: WorkerId;
  taskKind: WorkerTaskKind;
  reason: string;
  /** Steps sharing a wave may run in parallel; waves run in order. */
  wave: number;
}

export interface RoutePlan {
  /** Empty steps + direct === true means no worker is needed (§4). */
  direct: boolean;
  directReason?: string;
  intentClass: WorkerTaskKind | "direct";
  steps: RouteStep[];
  criticRequired: boolean;
  criticReason: string;
  guardianRequired: boolean;
  guardianReason: string;
  cognitionTier: CognitionTier;
  /** Honoured operator directives (§45). */
  honouredDirectives: string[];
  /** Directives that were refused because governance forbids them. */
  refusedDirectives: string[];
}

/* ------------------------------------------------------------------ */
/* Assembled response                                                  */
/* ------------------------------------------------------------------ */

export interface AssembledResponse {
  /** The direct answer, first. */
  answer: string;
  evidence: WorkerEvidenceRef[];
  uncertainties: string[];
  /** Preserved rather than averaged away (§17). */
  disagreements: string[];
  recommendations: string[];
  governanceNote?: string;
  /** "Analysis used:" provenance — worker roles, not personalities. */
  analysisUsed: string[];
  /** Multiple plausible explanations remain, no consensus was forced. */
  multiplePlausibleExplanations: boolean;
  status: "answered" | "partial" | "insufficient_evidence" | "blocked";
}
