/**
 * Phase 7 — simulation orchestrator.
 *
 * Composes: script structure (Phase 4) + optional proposed-change overlay +
 * operator scenario → a bounded, deterministic `SimulationResult`.
 *
 * Three rules this module exists to enforce:
 *
 * 1. **A simulation is never a live test.** Expectation comparison yields
 *    SIMULATION MATCH / MISMATCH / PARTIAL / UNKNOWN — never pass/fail — and
 *    every result carries `SIMULATION_DISCLAIMER`.
 * 2. **Poorly recognised scripts are not simulated as if understood.** Below
 *    `MIN_SIMULATABLE_RECOGNITION` the run returns INSUFFICIENT STRUCTURE.
 * 3. **Determinism.** Same structure + same scenario + same overlay ⇒ byte-identical
 *    trace (modulo `simulationId`/`createdAt`).
 */

import {
  MIN_SIMULATABLE_RECOGNITION,
  SIMULATION_CALCULATION_VERSION,
  SIMULATION_SCHEMA_VERSION,
  SIMULATOR_VERSION,
  classifyConfidence,
  coverageOf,
  type SimulationCoverage,
  type SimulationMatchState,
  type SimulationResult,
  type SimulationWarning,
} from "./simulation-contract";
import { validateScenario, type OperationalScenario } from "./scenario-model";
import { applyOverlay, isEmptyOverlay, type SimulationOverlay } from "./simulation-overlay";
import { traverse } from "./path-engine";
import { coverageFor, type ScriptStructure } from "@/lib/script/script-contract";

export interface SimulationRunInput {
  scenario: OperationalScenario;
  structure: ScriptStructure;
  scriptVersionId?: string;
  structureFingerprint?: string;
  overlay?: SimulationOverlay;
  now?: Date;
}

let runSeq = 0;

function newId(now: Date): string {
  runSeq += 1;
  return `sim_${now.getTime().toString(36)}_${runSeq.toString(36)}`;
}

function baseResult(
  input: SimulationRunInput,
  now: Date,
  coverage: SimulationCoverage,
): SimulationResult {
  return {
    simulationId: newId(now),
    scenarioId: input.scenario.id,
    scenarioName: input.scenario.name,
    ...(input.scenario.accountId ? { accountId: input.scenario.accountId } : {}),
    scriptId: input.scenario.scriptId,
    ...(input.scriptVersionId ? { scriptVersionId: input.scriptVersionId } : {}),
    ...(input.structureFingerprint ? { structureFingerprint: input.structureFingerprint } : {}),
    ...(input.overlay && !isEmptyOverlay(input.overlay) ? { overlayId: input.overlay.id } : {}),
    status: "insufficient_structure",
    confidence: "insufficient",
    coverage,
    traversedComponentIds: [],
    pathTrace: [],
    transitions: [],
    alternatePaths: [],
    affectedDependencies: [],
    unresolvedDependencies: [],
    assumptionsUsed: [],
    warnings: [],
    truncated: false,
    cycleDetected: false,
    createdAt: now.toISOString(),
    simulatorVersion: SIMULATOR_VERSION,
    calculationVersion: SIMULATION_CALCULATION_VERSION,
    schemaVersion: SIMULATION_SCHEMA_VERSION,
  };
}

export function runSimulation(input: SimulationRunInput): SimulationResult {
  const now = input.now ?? new Date();
  const recognition = coverageFor(input.structure);

  const emptyCoverage: SimulationCoverage = {
    knownSteps: 0,
    assumedSteps: 0,
    unknownSteps: 0,
    totalSteps: 0,
    structuralCoverage: 0,
    unresolvedReferences: 0,
    unsupportedConstructs: 0,
    scriptRecognitionCoverage: recognition,
  };

  // Gate 1 — the script itself is too poorly recognised to reason over.
  if (recognition < MIN_SIMULATABLE_RECOGNITION) {
    const result = baseResult(input, now, emptyCoverage);
    result.status = "insufficient_structure";
    result.warnings = [
      {
        code: "insufficient_script_coverage",
        detail: `Only ${(recognition * 100).toFixed(0)}% of this script was recognised (minimum ${(
          MIN_SIMULATABLE_RECOGNITION * 100
        ).toFixed(0)}%). Simulation is withheld rather than run over an unparsed script.`,
      },
    ];
    return result;
  }

  // Gate 2 — the scenario cannot be evaluated at all.
  const validation = validateScenario(input.scenario, input.structure);
  if (!validation.valid) {
    const result = baseResult(input, now, emptyCoverage);
    result.status = "invalid_scenario";
    result.warnings = validation.errors.map((detail) => ({
      code: "unknown_component" as const,
      detail,
    }));
    return result;
  }

  const overlayApplication = applyOverlay(input.structure, input.overlay);
  const structure = overlayApplication.structure;

  const outcome = traverse(structure, input.scenario);

  const coverage: SimulationCoverage = {
    knownSteps: outcome.knownSteps,
    assumedSteps: outcome.assumedSteps,
    unknownSteps: outcome.unknownSteps,
    totalSteps: outcome.knownSteps + outcome.assumedSteps + outcome.unknownSteps,
    structuralCoverage: coverageOf(outcome.knownSteps, outcome.assumedSteps, outcome.unknownSteps),
    unresolvedReferences: outcome.unresolvedDependencies.length,
    unsupportedConstructs: outcome.unsupportedConstructs,
    scriptRecognitionCoverage: recognition,
  };

  const warnings: SimulationWarning[] = [...outcome.warnings];
  if (!isEmptyOverlay(input.overlay)) {
    warnings.unshift({
      code: "overlay_applied",
      detail: `Evaluated against a proposed change overlay (${overlayApplication.notes.length} modification(s)); the canonical script was not altered.`,
    });
    for (const note of overlayApplication.ineffective) {
      warnings.push({ code: "unknown_component", detail: note });
    }
  }
  if (!input.structureFingerprint) {
    warnings.push({
      code: "script_version_unknown",
      detail: "No structure fingerprint supplied — this run cannot be tied to a recorded version.",
    });
  }
  if (!input.scenario.expected) {
    warnings.push({
      code: "expected_result_missing",
      detail: "No operator-recorded expected result; the run cannot be compared to an expectation.",
    });
  }
  warnings.push({
    code: "live_test_required",
    detail:
      "Simulated result only. Confirm behaviour with a live test before relying on it in production.",
  });

  const result = baseResult(input, now, coverage);
  result.status = outcome.status;
  result.confidence = classifyConfidence(
    coverage,
    outcome.assumptionsUsed.length,
    outcome.status,
  );
  if (outcome.startingComponentId) result.startingComponentId = outcome.startingComponentId;
  result.traversedComponentIds = outcome.traversedComponentIds;
  result.pathTrace = outcome.pathTrace;
  result.transitions = outcome.transitions;
  if (outcome.terminalState) result.terminalState = outcome.terminalState;
  result.alternatePaths = outcome.alternatePaths;
  result.affectedDependencies = outcome.affectedDependencies;
  result.unresolvedDependencies = outcome.unresolvedDependencies;
  result.assumptionsUsed = outcome.assumptionsUsed;
  result.warnings = warnings;
  result.truncated = outcome.truncated;
  result.cycleDetected = outcome.cycleDetected;
  return result;
}

/* ------------------------------------------------------------------ */
/* Expectation comparison — MATCH, never PASS                          */
/* ------------------------------------------------------------------ */

export interface ExpectationComparison {
  state: SimulationMatchState;
  reasons: string[];
  /** Always true in Phase 7: a simulation never substitutes for a live test. */
  liveTestStillRequired: true;
}

export function compareToExpectation(
  result: SimulationResult,
  scenario: OperationalScenario,
  structure: ScriptStructure,
): ExpectationComparison {
  const reasons: string[] = [];
  const expected = scenario.expected;

  if (!expected || (!expected.terminalKey && !(expected.mustTraverseKeys ?? []).length)) {
    return {
      state: "simulation_unknown",
      reasons: ["No expected result recorded, so there is nothing to compare the run against."],
      liveTestStillRequired: true,
    };
  }

  if (result.status === "insufficient_structure" || result.status === "invalid_scenario") {
    return {
      state: "simulation_unknown",
      reasons: ["The run did not produce a path to compare."],
      liveTestStillRequired: true,
    };
  }

  const byId = new Map(structure.components.map((c) => [c.id, c] as const));
  const traversedKeys = new Set(
    result.traversedComponentIds.map((id) => byId.get(id)?.key ?? id),
  );
  const terminalKey = result.terminalState
    ? byId.get(result.terminalState.componentId)?.key
    : undefined;

  let mismatch = false;

  if (expected.terminalKey) {
    if (!terminalKey) {
      reasons.push(
        `Expected to end at "${expected.terminalKey}", but the run did not reach a terminal.`,
      );
    } else if (terminalKey !== expected.terminalKey) {
      mismatch = true;
      reasons.push(`Expected terminal "${expected.terminalKey}"; simulated terminal "${terminalKey}".`);
    } else {
      reasons.push(`Simulated terminal matches the expected "${expected.terminalKey}".`);
    }
  }

  for (const key of expected.mustTraverseKeys ?? []) {
    if (traversedKeys.has(key)) reasons.push(`Traversed "${key}" as expected.`);
    else if (result.status === "complete") {
      mismatch = true;
      reasons.push(`Expected the path to traverse "${key}"; it did not.`);
    } else {
      reasons.push(`"${key}" was not reached before the run stopped early.`);
    }
  }

  if (mismatch) {
    return {
      state: "simulation_mismatch",
      reasons: [
        ...reasons,
        "A simulation mismatch is a modelling difference, not a production failure.",
      ],
      liveTestStillRequired: true,
    };
  }
  if (result.status !== "complete" || result.confidence === "partial") {
    return {
      state: "simulation_partial",
      reasons: [...reasons, "The run stopped before the whole path was determined."],
      liveTestStillRequired: true,
    };
  }
  return {
    state: "simulation_match",
    reasons: [...reasons, "A simulation match is not a production pass; live testing still applies."],
    liveTestStillRequired: true,
  };
}

/* ------------------------------------------------------------------ */
/* Current vs proposed comparison                                      */
/* ------------------------------------------------------------------ */

export interface SimulationDelta {
  scenarioId: string;
  scenarioName: string;
  pathChanged: boolean;
  terminalChanged: boolean;
  currentPath: string[];
  proposedPath: string[];
  currentTerminal?: string;
  proposedTerminal?: string;
  statusChange?: string;
  newlyUnresolved: string[];
  addedComponents: string[];
  removedComponents: string[];
  notes: string[];
}

/** Deterministic diff between a baseline run and an overlay run. */
export function compareSimulations(
  current: SimulationResult,
  proposed: SimulationResult,
  structure: ScriptStructure,
): SimulationDelta {
  const byId = new Map(structure.components.map((c) => [c.id, c.name] as const));
  const name = (id: string): string => byId.get(id) ?? id;

  const currentPath = current.traversedComponentIds.map(name);
  const proposedPath = proposed.traversedComponentIds.map(name);
  const currentSet = new Set(current.traversedComponentIds);
  const proposedSet = new Set(proposed.traversedComponentIds);

  const notes: string[] = [];
  const statusChange =
    current.status === proposed.status
      ? undefined
      : `${current.status} → ${proposed.status}`;
  if (statusChange) {
    notes.push(`Simulation status changes from ${current.status} to ${proposed.status}.`);
  }
  if (proposed.confidence !== current.confidence) {
    notes.push(`Confidence changes from ${current.confidence} to ${proposed.confidence}.`);
  }

  const newlyUnresolved = proposed.unresolvedDependencies.filter(
    (k) => !current.unresolvedDependencies.includes(k),
  );
  if (newlyUnresolved.length > 0) {
    notes.push(
      `The proposed change introduces ${newlyUnresolved.length} unresolved reference(s): ${newlyUnresolved.join(", ")}.`,
    );
  }

  const pathChanged = currentPath.join("→") !== proposedPath.join("→");
  if (!pathChanged) {
    notes.push("No difference in the simulated path for this scenario.");
  }

  return {
    scenarioId: current.scenarioId,
    scenarioName: current.scenarioName,
    pathChanged,
    terminalChanged: current.terminalState?.componentId !== proposed.terminalState?.componentId,
    currentPath,
    proposedPath,
    ...(current.terminalState ? { currentTerminal: current.terminalState.name } : {}),
    ...(proposed.terminalState ? { proposedTerminal: proposed.terminalState.name } : {}),
    ...(statusChange ? { statusChange } : {}),
    newlyUnresolved,
    addedComponents: proposed.traversedComponentIds.filter((id) => !currentSet.has(id)).map(name),
    removedComponents: current.traversedComponentIds.filter((id) => !proposedSet.has(id)).map(name),
    notes,
  };
}

/** Run a bounded batch of scenarios (regression suite) against one structure. */
export function runScenarioBatch(
  scenarios: OperationalScenario[],
  shared: Omit<SimulationRunInput, "scenario">,
  limit = 25,
): SimulationResult[] {
  return scenarios
    .slice(0, limit)
    .map((scenario) => runSimulation({ ...shared, scenario }));
}
