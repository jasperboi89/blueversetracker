/**
 * Phase 9 — deterministic AgentRunInspector fixtures.
 *
 * TEST-ONLY. Nothing in this module is imported by application code, nothing is
 * recorded into the run store at runtime, and no fixture is ever presented as a
 * production run. Its sole purpose is to pin Inspector rendering for every
 * canonical run shape.
 */

import {
  DEFAULT_RUN_BUDGET,
  type CognitiveRun,
  type CriticResult,
  type GuardianResult,
  type WorkerId,
  type WorkerOutput,
} from "./worker-contract";

const T0 = "2026-08-29T01:00:00.000Z";
const T1 = "2026-08-29T01:00:02.400Z";

export function fixtureOutput(workerId: WorkerId, over: Partial<WorkerOutput> = {}): WorkerOutput {
  return {
    workerId,
    workerVersion: 1,
    taskId: "task-1",
    correlationId: "corr-1",
    status: "contributed",
    summary: `${workerId} contribution.`,
    claims: [],
    evidence: [],
    uncertainties: [],
    contradictions: [],
    recommendations: [],
    preparedArtifacts: [],
    confidence: "moderate",
    sensitivity: "internal",
    operationClass: "analyze",
    elapsedMs: 120,
    budgetUsed: { maxToolCalls: 1, maxEvidenceItems: 3 },
    notes: [],
    ...over,
  };
}

function critique(over: Partial<CriticResult> = {}): CriticResult {
  return {
    workerId: "critic",
    workerVersion: 1,
    taskId: "task-1",
    correlationId: "corr-1",
    reviewedWorker: "investigator",
    status: "reviewed",
    issues: [],
    revisionRequested: false,
    summary: "No material issue found.",
    elapsedMs: 20,
    ...over,
  };
}

function guardian(over: Partial<GuardianResult> = {}): GuardianResult {
  return {
    workerId: "guardian",
    workerVersion: 1,
    taskId: "task-1",
    correlationId: "corr-1",
    decision: "ALLOW",
    reasonCodes: ["READ_ONLY_CONTRIBUTION"],
    explanation: "Read-only analysis: no capability progression is requested.",
    limits: [],
    available: true,
    elapsedMs: 5,
    ...over,
  };
}

export function fixtureRun(over: Partial<CognitiveRun> = {}): CognitiveRun {
  const base: CognitiveRun = {
    correlationId: "corr-1",
    taskId: "task-1",
    state: "completed",
    intent: "Why did cancellation routing fail?",
    intentClass: "explain_cause",
    operatorRef: "op-1",
    accountId: "1001",
    cognitionTier: "deep",
    sensitivity: "internal",
    plan: {
      direct: false,
      intentClass: "explain_cause",
      steps: [
        { workerId: "investigator", taskKind: "explain_cause", reason: "Causal question over canonical investigation state.", wave: 0 },
      ],
      criticRequired: true,
      criticReason: "Causal explanations are always challenged before they are shown.",
      guardianRequired: false,
      guardianReason: "No capability progression requested; read-only analysis.",
      cognitionTier: "deep",
      honouredDirectives: [],
      refusedDirectives: [],
    },
    participation: [
      {
        workerId: "investigator",
        workerVersion: 1,
        status: "contributed",
        routeReason: "Causal question over canonical investigation state.",
        fingerprint: "fp-investigator-1",
        revision: 0,
        elapsedMs: 120,
      },
    ],
    contributions: [fixtureOutput("investigator")],
    critiques: [critique()],
    disagreements: [],
    response: {
      answer: "Hypothesis A is currently the strongest available explanation.",
      evidence: [],
      uncertainties: [],
      disagreements: [],
      recommendations: [],
      analysisUsed: ["Causal investigation specialist"],
      multiplePlausibleExplanations: false,
      status: "answered",
    },
    budget: DEFAULT_RUN_BUDGET,
    usage: { workers: 1, invocations: 2, depth: 1, revisions: 0, elapsedMs: 2400 },
    stopReason: "completed",
    claimValidation: [],
    skippedWorkers: [{ workerId: "forecaster", reason: "No future-state question was detected in the request." }],
    injectionMarkers: [],
    events: [
      { at: T0, label: "Run started" },
      { at: T0, label: "Routed → investigator" },
      { at: T1, label: "investigator contributed" },
      { at: T1, label: "Assembler completed" },
    ],
    startedAt: T0,
    endedAt: T1,
  };
  return { ...base, ...over };
}

/* ------------------------------------------------------------------ */
/* Canonical scenarios                                                 */
/* ------------------------------------------------------------------ */

export const FIXTURES = {
  directResponse: (): CognitiveRun =>
    fixtureRun({
      correlationId: "corr-direct",
      intent: "Open the accounts page",
      intentClass: "direct",
      cognitionTier: "fast",
      plan: {
        direct: true,
        directReason: "This is answered from deterministic portal state; no specialist cognition adds value.",
        intentClass: "direct",
        steps: [],
        criticRequired: false,
        criticReason: "Low-risk query: critique adds no material value.",
        guardianRequired: false,
        guardianReason: "No capability progression requested; read-only analysis.",
        cognitionTier: "fast",
        honouredDirectives: [],
        refusedDirectives: [],
      },
      participation: [],
      contributions: [],
      critiques: [],
      skippedWorkers: [],
      stopReason: "direct_response",
      usage: { workers: 0, invocations: 0, depth: 0, revisions: 0, elapsedMs: 12 },
    }),

  singleWorker: (): CognitiveRun => fixtureRun({ correlationId: "corr-single" }),

  multiWorker: (): CognitiveRun =>
    fixtureRun({
      correlationId: "corr-multi",
      plan: {
        ...fixtureRun().plan,
        steps: [
          { workerId: "investigator", taskKind: "explain_cause", reason: "Causal question.", wave: 0 },
          { workerId: "researcher", taskKind: "prior_knowledge", reason: "Prior resolutions may explain this shape.", wave: 0 },
          { workerId: "simulator", taskKind: "structural_what_if", reason: "A structural mechanism is in play.", wave: 1 },
        ],
      },
      participation: [
        { workerId: "investigator", workerVersion: 1, status: "contributed", routeReason: "Causal question.", fingerprint: "fp-i", revision: 0, elapsedMs: 100 },
        { workerId: "researcher", workerVersion: 1, status: "contributed", routeReason: "Prior resolutions.", fingerprint: "fp-r", revision: 0, elapsedMs: 80 },
        { workerId: "simulator", workerVersion: 1, status: "contributed", routeReason: "Structural check.", fingerprint: "fp-s", revision: 0, elapsedMs: 60 },
      ],
      contributions: [fixtureOutput("investigator"), fixtureOutput("researcher"), fixtureOutput("simulator")],
      usage: { workers: 3, invocations: 4, depth: 2, revisions: 0, elapsedMs: 3200 },
    }),

  criticNoIssue: (): CognitiveRun => fixtureRun({ correlationId: "corr-critic-clean" }),

  criticRevision: (): CognitiveRun =>
    fixtureRun({
      correlationId: "corr-critic-revision",
      critiques: [
        critique({
          issues: [
            { code: "CAUSAL_OVERREACH", target: "claim-1", detail: "Statement asserts causation from correlation.", material: true, suggestedFix: "Restate as an association." },
          ],
          revisionRequested: true,
          summary: "Causal overreach found; one revision requested.",
        }),
      ],
      participation: [
        { workerId: "investigator", workerVersion: 1, status: "contributed", routeReason: "Causal question.", fingerprint: "fp-i", revision: 1, elapsedMs: 100 },
      ],
      usage: { workers: 1, invocations: 3, depth: 1, revisions: 1, elapsedMs: 2600 },
      events: [
        { at: T0, label: "Run started" },
        { at: T0, label: "Routed → investigator" },
        { at: T1, label: "Critic reviewed investigator: CAUSAL_OVERREACH" },
        { at: T1, label: "Revision completed for investigator (1 / 1)" },
      ],
    }),

  criticUnresolved: (): CognitiveRun =>
    fixtureRun({
      correlationId: "corr-critic-unresolved",
      critiques: [
        critique({
          issues: [{ code: "MISSING_EVIDENCE", target: "claim-2", detail: "No canonical evidence supports this claim.", material: true }],
          revisionRequested: true,
          summary: "Material issue remains after the bounded revision pass.",
        }),
      ],
      usage: { workers: 1, invocations: 3, depth: 1, revisions: 1, elapsedMs: 2600 },
      state: "partial",
    }),

  guardianAllow: (): CognitiveRun => fixtureRun({ correlationId: "corr-guard-allow", guardian: guardian() }),

  guardianBlock: (): CognitiveRun =>
    fixtureRun({
      correlationId: "corr-guard-block",
      state: "blocked",
      stopReason: "guardian_blocked",
      guardian: guardian({
        decision: "BLOCK",
        reasonCodes: ["PRODUCTION_SIDE_EFFECT"],
        explanation: '"script.deploy" is not a capability any intelligence worker may reach in this phase.',
        capabilityId: "script.deploy",
        limits: ["No worker may deploy, execute, close or mark anything verified."],
      }),
    }),

  guardianUnavailable: (): CognitiveRun =>
    fixtureRun({
      correlationId: "corr-guard-unavailable",
      state: "blocked",
      stopReason: "guardian_unavailable",
      guardian: guardian({
        decision: "BLOCK",
        reasonCodes: ["GUARDIAN_UNAVAILABLE"],
        explanation: "Governance review is unavailable, so no capability progression is permitted.",
        available: false,
      }),
    }),

  disagreement: (): CognitiveRun =>
    fixtureRun({
      correlationId: "corr-disagreement",
      disagreements: [
        "Investigator: hypothesis A is strongest. Researcher: historical resolutions favour B.",
      ],
      response: {
        ...fixtureRun().response!,
        answer: "Multiple plausible explanations remain.",
        disagreements: ["Investigator: hypothesis A is strongest. Researcher: historical resolutions favour B."],
        multiplePlausibleExplanations: true,
      },
    }),

  loopDetected: (): CognitiveRun =>
    fixtureRun({ correlationId: "corr-loop", state: "partial", stopReason: "duplicate_task" }),

  budgetExhausted: (): CognitiveRun =>
    fixtureRun({
      correlationId: "corr-budget",
      state: "partial",
      stopReason: "invocation_budget_exceeded",
      usage: { workers: 4, invocations: 6, depth: 2, revisions: 1, elapsedMs: 8000 },
    }),

  workerUnavailable: (): CognitiveRun =>
    fixtureRun({
      correlationId: "corr-worker-unavailable",
      state: "partial",
      contributions: [
        fixtureOutput("investigator", { status: "unavailable", summary: "Causal investigation is unavailable; the canonical record is unchanged." }),
      ],
      participation: [
        { workerId: "investigator", workerVersion: 1, status: "unavailable", routeReason: "Causal question.", fingerprint: "fp-i", revision: 0, elapsedMs: 0 },
      ],
      critiques: [],
    }),

  partial: (): CognitiveRun => fixtureRun({ correlationId: "corr-partial", state: "partial" }),

  failed: (): CognitiveRun =>
    fixtureRun({ correlationId: "corr-failed", state: "failed", stopReason: "runtime_error" }),

  promptInjectionRejected: (): CognitiveRun =>
    fixtureRun({
      correlationId: "corr-injection",
      injectionMarkers: [{ source: "knowledge_note:kn-9", codes: ["INSTRUCTION_OVERRIDE"] }],
    }),

  claimValidationFailure: (): CognitiveRun =>
    fixtureRun({
      correlationId: "corr-claim-invalid",
      claimValidation: [{ claimId: "claim-7", kind: "forecast", id: "abc123", code: "UNKNOWN_REFERENCE" }],
    }),
};
