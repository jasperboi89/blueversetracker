/**
 * Phase 7 — Operational Simulation & Digital Twin: canonical contract.
 *
 * The Digital Twin is NOT "LLM + imagination". It is a deterministic evaluator
 * over the Phase 4 script structure plus an explicit operator scenario. This
 * module owns the vocabulary that keeps the four ideas separate:
 *
 *   FACT        — canonical operational state (elsewhere)
 *   STRUCTURE   — a parsed script relationship (Phase 4)
 *   SIMULATED   — produced here, by traversal, from structure + scenario
 *   LIVE TEST   — something a human actually ran in production (never here)
 *
 * A SIMULATION MATCH is not a PASS. A SIMULATION MISMATCH is not a production
 * failure. Those words are separate types on purpose, and the test suite
 * enforces the separation.
 *
 * Autonomy stays capped at OBSERVE / EXPLAIN / RECOMMEND / PREPARE: nothing in
 * Phase 7 writes a script, deploys, or mutates production.
 */

export const SIMULATOR_VERSION = 1;
export const SIMULATION_CALCULATION_VERSION = 1;
export const SIMULATION_SCHEMA_VERSION = 1;

/** Phase 7 autonomy ceiling. Anything beyond `prepare` is out of contract. */
export const SIMULATION_AUTONOMY = ["observe", "explain", "recommend", "prepare"] as const;
export type SimulationAutonomy = (typeof SIMULATION_AUTONOMY)[number];

/* ------------------------------------------------------------------ */
/* Status                                                              */
/* ------------------------------------------------------------------ */

/**
 * A simulation that cannot determine the answer must say so. There is no
 * "assume the rest" status — `partial` and `unknown_path` exist precisely so
 * the engine never has to invent a terminal.
 */
export const SIMULATION_STATUSES = [
  "complete",
  "partial",
  "blocked",
  "insufficient_structure",
  "invalid_scenario",
  "unknown_path",
] as const;
export type SimulationStatus = (typeof SIMULATION_STATUSES)[number];

export const SIMULATION_STATUS_LABEL: Record<SimulationStatus, string> = {
  complete: "COMPLETE",
  partial: "PARTIAL",
  blocked: "BLOCKED",
  insufficient_structure: "INSUFFICIENT STRUCTURE",
  invalid_scenario: "INVALID SCENARIO",
  unknown_path: "UNKNOWN PATH",
};

/* ------------------------------------------------------------------ */
/* Confidence                                                          */
/* ------------------------------------------------------------------ */

/**
 * Confidence describes how much of the traversed path came from understood
 * structure — never how likely production is to agree. No percentages are
 * published as "accuracy".
 */
export const SIMULATION_CONFIDENCE_CLASSES = [
  "verified_structure",
  "supported",
  "partial",
  "insufficient",
] as const;
export type SimulationConfidence = (typeof SIMULATION_CONFIDENCE_CLASSES)[number];

/* ------------------------------------------------------------------ */
/* Coverage                                                            */
/* ------------------------------------------------------------------ */

/**
 * STRUCTURAL COVERAGE — the share of traversed steps the engine understood.
 * Deliberately *not* named accuracy or confidence: it says how much of the
 * path is modelled, not how right the model is.
 */
export interface SimulationCoverage {
  knownSteps: number;
  assumedSteps: number;
  unknownSteps: number;
  totalSteps: number;
  /** 0–1 share of steps grounded in recognised structure. */
  structuralCoverage: number;
  unresolvedReferences: number;
  unsupportedConstructs: number;
  /** Phase 4 extraction coverage of the underlying script. */
  scriptRecognitionCoverage: number;
}

export const COVERAGE_LABEL = "STRUCTURAL COVERAGE";

/** Below this, the script itself is too poorly recognised to simulate over. */
export const MIN_SIMULATABLE_RECOGNITION = 0.6;

/* ------------------------------------------------------------------ */
/* Warnings                                                            */
/* ------------------------------------------------------------------ */

export const SIMULATION_WARNING_CODES = [
  "unresolved_dependency",
  "unsupported_expression",
  "assumption_required",
  "ambiguous_branch",
  "unknown_component",
  "insufficient_script_coverage",
  "expected_result_missing",
  "live_test_required",
  "cycle_detected",
  "truncated",
  "overlay_applied",
  "script_version_unknown",
  "partial_replay",
] as const;
export type SimulationWarningCode = (typeof SIMULATION_WARNING_CODES)[number];

export interface SimulationWarning {
  code: SimulationWarningCode;
  detail: string;
  componentId?: string;
}

/* ------------------------------------------------------------------ */
/* Supported construct registry                                        */
/* ------------------------------------------------------------------ */

export type ConstructSupport = "supported" | "partially_supported" | "unsupported";

export interface ConstructEntry {
  construct: string;
  support: ConstructSupport;
  note: string;
}

/**
 * What the Phase 7 engine can actually evaluate, grounded strictly in what the
 * Phase 4 parser produces. Nothing is listed as supported because it would be
 * convenient — if the extractor cannot see it, it is `unsupported` here.
 */
export const SUPPORTED_CONSTRUCTS: ConstructEntry[] = [
  {
    construct: "navigation edge (branches_to / calls / includes)",
    support: "supported",
    note: "Deterministic traversal between recognised components.",
  },
  {
    construct: "direct field assignment (writes edge)",
    support: "supported",
    note: "Produces an explicit state transition; value comes from scenario input or an assumption.",
  },
  {
    construct: "field read (reads edge)",
    support: "supported",
    note: "Recorded as a read of current simulated state; unknown when nothing has written the field.",
  },
  {
    construct: "deterministic branch selection",
    support: "supported",
    note: "Taken when scenario inputs uniquely select one outgoing target.",
  },
  {
    construct: "transfer / dispatch terminal (transfers_to)",
    support: "supported",
    note: "Terminates the path and projects the simulated dispatch state.",
  },
  {
    construct: "known pick-list selection",
    support: "partially_supported",
    note: "Supported only when the option text matches a recognised outgoing target key.",
  },
  {
    construct: "calculation / expression component",
    support: "partially_supported",
    note: "Traversed as a step; the expression itself is not evaluated — an assumption is required for its output.",
  },
  {
    construct: "external / dynamic lookup",
    support: "unsupported",
    note: "No result is invented; the operator must supply an assumption to continue.",
  },
  {
    construct: "unresolved reference (target outside this script)",
    support: "unsupported",
    note: "Path stops at the boundary and reports UNRESOLVED DEPENDENCY.",
  },
  {
    construct: "ambiguous 'references' edge",
    support: "unsupported",
    note: "The parser could not name the relationship, so it is never traversed as control flow.",
  },
  {
    construct: "unrecognised line (parser unknown)",
    support: "unsupported",
    note: "Counted against structural coverage; never simulated as if understood.",
  },
];

export function constructSupport(construct: string): ConstructSupport {
  return SUPPORTED_CONSTRUCTS.find((c) => c.construct === construct)?.support ?? "unsupported";
}

/* ------------------------------------------------------------------ */
/* Path trace + state transitions                                      */
/* ------------------------------------------------------------------ */

export type StepKnowledge = "known" | "assumed" | "unknown";

export type TransitionOperation =
  | "enter"
  | "set_field"
  | "read_field"
  | "branch"
  | "navigate"
  | "dispatch"
  | "terminal";

export interface StateTransition {
  index: number;
  componentId: string;
  componentName: string;
  operation: TransitionOperation;
  field?: string;
  value?: string;
  /** Where the value came from — structure, the scenario, or an assumption. */
  valueSource: "structure" | "scenario_input" | "assumption" | "unknown";
  /** Simulated state after this transition (bounded, redacted keys only). */
  stateAfter: Record<string, string>;
}

export interface PathStep {
  index: number;
  componentId: string;
  name: string;
  kind: string;
  detail: string;
  knowledge: StepKnowledge;
  /** Why this step is what it is — a structural fact, never a guess. */
  evidence: string;
  warningCode?: SimulationWarningCode;
}

/* ------------------------------------------------------------------ */
/* Result                                                              */
/* ------------------------------------------------------------------ */

export interface SimulationResult {
  simulationId: string;
  scenarioId: string;
  scenarioName: string;
  accountId?: string;
  scriptId: string;
  scriptVersionId?: string;
  /** Structure fingerprint the run was evaluated against. */
  structureFingerprint?: string;
  overlayId?: string;
  status: SimulationStatus;
  confidence: SimulationConfidence;
  coverage: SimulationCoverage;
  startingComponentId?: string;
  traversedComponentIds: string[];
  pathTrace: PathStep[];
  transitions: StateTransition[];
  terminalState?: { componentId: string; name: string; kind: string };
  /** Alternative paths when the scenario did not uniquely determine one. */
  alternatePaths: string[][];
  affectedDependencies: string[];
  unresolvedDependencies: string[];
  assumptionsUsed: Array<{ key: string; value: string }>;
  warnings: SimulationWarning[];
  truncated: boolean;
  cycleDetected: boolean;
  createdAt: string;
  simulatorVersion: number;
  calculationVersion: number;
  schemaVersion: number;
}

/* ------------------------------------------------------------------ */
/* Simulation vs live test vocabulary                                  */
/* ------------------------------------------------------------------ */

/**
 * Mandatory semantic boundary. These values are deliberately NOT "pass"/"fail":
 * a simulation compares a modelled path with a human-recorded expectation, and
 * that is a different claim from a live production test.
 */
export const SIMULATION_MATCH_STATES = [
  "simulation_match",
  "simulation_mismatch",
  "simulation_partial",
  "simulation_unknown",
] as const;
export type SimulationMatchState = (typeof SIMULATION_MATCH_STATES)[number];

export const SIMULATION_MATCH_LABEL: Record<SimulationMatchState, string> = {
  simulation_match: "SIMULATION MATCH",
  simulation_mismatch: "SIMULATION MISMATCH",
  simulation_partial: "SIMULATION PARTIAL",
  simulation_unknown: "SIMULATION UNKNOWN",
};

/** Live testing is always a separate, human-owned status. */
export const LIVE_TEST_STATES = ["live_test_not_run", "live_test_recorded"] as const;
export type LiveTestState = (typeof LIVE_TEST_STATES)[number];

export const LIVE_TEST_LABEL: Record<LiveTestState, string> = {
  live_test_not_run: "LIVE TEST NOT RUN",
  live_test_recorded: "LIVE TEST RECORDED BY OPERATOR",
};

/** Rendered next to every simulation surface. */
export const SIMULATION_DISCLAIMER =
  "Simulated from the available structural model and the scenario's assumptions. This is not a live execution and does not replace live testing.";

/* ------------------------------------------------------------------ */
/* Bounds                                                              */
/* ------------------------------------------------------------------ */

export const SIMULATION_LIMITS = {
  maxSteps: 120,
  maxDepth: 60,
  maxAlternatePaths: 8,
  maxTransitions: 200,
  maxScenarioBatch: 25,
  maxAssumptions: 40,
  maxStateKeys: 60,
  maxWarnings: 40,
  maxRunsRetained: 60,
} as const;

export function coverageOf(
  known: number,
  assumed: number,
  unknown: number,
): number {
  const total = known + assumed + unknown;
  if (total <= 0) return 0;
  return known / total;
}

/**
 * Confidence is derived, never asserted. It degrades for assumptions,
 * unresolved references and poor script recognition — in that order.
 */
export function classifyConfidence(
  coverage: SimulationCoverage,
  assumptionCount: number,
  status: SimulationStatus,
): SimulationConfidence {
  if (
    status === "insufficient_structure" ||
    status === "invalid_scenario" ||
    coverage.scriptRecognitionCoverage < MIN_SIMULATABLE_RECOGNITION
  ) {
    return "insufficient";
  }
  if (status === "blocked" || status === "unknown_path") return "partial";
  if (coverage.unknownSteps > 0 || coverage.unresolvedReferences > 0 || status === "partial") {
    return "partial";
  }
  if (assumptionCount > 0 || coverage.assumedSteps > 0) return "supported";
  return coverage.structuralCoverage >= 1 ? "verified_structure" : "supported";
}
