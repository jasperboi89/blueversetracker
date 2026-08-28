/**
 * Phase 7 — deterministic path engine.
 *
 * Traverses the Phase 4 structural model under a scenario. Two invariants make
 * this a simulator rather than a guesser:
 *
 * 1. **Nothing is invented.** When the next step is not uniquely determined by
 *    structure + scenario inputs + recorded assumptions, the walk STOPS and
 *    reports why (ambiguous branch, unresolved reference, unsupported
 *    expression). It never picks a branch at random.
 * 2. **Determinism.** Edges are visited in a stable order (line, then target
 *    key), so the same structure + scenario always produces the same trace.
 *
 * All bounds come from SIMULATION_LIMITS: depth, step count, transitions and
 * alternate paths are capped, and reaching a cap is reported as TRUNCATED
 * rather than silently dropping the remainder of the path.
 */

import {
  SIMULATION_LIMITS,
  type PathStep,
  type SimulationStatus,
  type SimulationWarning,
  type StateTransition,
} from "./simulation-contract";
import type { OperationalScenario } from "./scenario-model";
import type {
  ScriptComponent,
  ScriptDependency,
  ScriptStructure,
} from "@/lib/script/script-contract";

const NAVIGATION_KINDS = new Set(["branches_to", "calls", "includes", "transfers_to"]);

export interface TraversalOutcome {
  status: SimulationStatus;
  startingComponentId?: string;
  traversedComponentIds: string[];
  pathTrace: PathStep[];
  transitions: StateTransition[];
  terminalState?: { componentId: string; name: string; kind: string };
  alternatePaths: string[][];
  affectedDependencies: string[];
  unresolvedDependencies: string[];
  assumptionsUsed: Array<{ key: string; value: string }>;
  warnings: SimulationWarning[];
  truncated: boolean;
  cycleDetected: boolean;
  knownSteps: number;
  assumedSteps: number;
  unknownSteps: number;
  unsupportedConstructs: number;
}

function sortEdges(a: ScriptDependency, b: ScriptDependency): number {
  return a.line - b.line || a.toKey.localeCompare(b.toKey) || a.kind.localeCompare(b.kind);
}

/** Entry points: components nothing navigates to. */
export function entryComponents(structure: ScriptStructure): ScriptComponent[] {
  const targeted = new Set<string>();
  for (const dep of structure.dependencies) {
    if (!NAVIGATION_KINDS.has(dep.kind)) continue;
    if (dep.toId) targeted.add(dep.toId);
  }
  const entries = structure.components.filter((c) => !targeted.has(c.id));
  return (entries.length > 0 ? entries : structure.components)
    .slice()
    .sort((a, b) => a.line - b.line || a.key.localeCompare(b.key));
}

export function traverse(
  structure: ScriptStructure,
  scenario: OperationalScenario,
): TraversalOutcome {
  const byId = new Map(structure.components.map((c) => [c.id, c] as const));
  const byKey = new Map(structure.components.map((c) => [c.key, c] as const));
  const outgoing = new Map<string, ScriptDependency[]>();
  for (const dep of structure.dependencies) {
    const list = outgoing.get(dep.fromId) ?? [];
    list.push(dep);
    outgoing.set(dep.fromId, list);
  }
  for (const list of outgoing.values()) list.sort(sortEdges);

  const inputByKey = new Map(scenario.inputs.map((i) => [i.key, i] as const));
  const assumptionByKey = new Map(scenario.assumptions.map((a) => [a.key, a] as const));

  const warnings: SimulationWarning[] = [];
  const warn = (w: SimulationWarning): void => {
    if (warnings.length >= SIMULATION_LIMITS.maxWarnings) return;
    if (warnings.some((x) => x.code === w.code && x.detail === w.detail)) return;
    warnings.push(w);
  };

  const pathTrace: PathStep[] = [];
  const transitions: StateTransition[] = [];
  const traversed: string[] = [];
  const affected: string[] = [];
  const unresolved: string[] = [];
  const assumptionsUsed: Array<{ key: string; value: string }> = [];
  const alternatePaths: string[][] = [];
  const state: Record<string, string> = {};

  let knownSteps = 0;
  let assumedSteps = 0;
  let unknownSteps = 0;
  let unsupportedConstructs = 0;
  let truncated = false;
  let cycleDetected = false;
  let status: SimulationStatus = "complete";
  let terminalState: TraversalOutcome["terminalState"];

  const addStep = (step: Omit<PathStep, "index">): void => {
    if (pathTrace.length >= SIMULATION_LIMITS.maxSteps) return;
    pathTrace.push({ index: pathTrace.length, ...step });
    if (step.knowledge === "known") knownSteps += 1;
    else if (step.knowledge === "assumed") assumedSteps += 1;
    else unknownSteps += 1;
  };

  const addTransition = (t: Omit<StateTransition, "index" | "stateAfter">): void => {
    if (transitions.length >= SIMULATION_LIMITS.maxTransitions) return;
    transitions.push({
      index: transitions.length,
      ...t,
      stateAfter: { ...state },
    });
  };

  /* -------------------- starting component -------------------- */

  let current: ScriptComponent | undefined;
  if (scenario.startingComponentKey) {
    current = byKey.get(scenario.startingComponentKey);
    if (!current) {
      return blocked(
        "invalid_scenario",
        `Starting component "${scenario.startingComponentKey}" is not in this script version.`,
      );
    }
  } else {
    const entries = entryComponents(structure);
    if (entries.length === 0) {
      return blocked("insufficient_structure", "No recognised components to start from.");
    }
    if (entries.length > 1) {
      // Multiple possible starts and nothing to choose between them — the
      // engine reports the candidates instead of picking one.
      warn({
        code: "assumption_required",
        detail: `${entries.length} possible starting components; choose one in the scenario.`,
      });
      return {
        ...empty(),
        status: "unknown_path",
        alternatePaths: entries
          .slice(0, SIMULATION_LIMITS.maxAlternatePaths)
          .map((c) => [c.id]),
        warnings,
      };
    }
    current = entries[0]!;
  }

  const startingComponentId = current.id;
  let cursor: ScriptComponent = current;
  const visited = new Set<string>();

  /* -------------------- walk -------------------- */

  for (let depth = 0; ; depth += 1) {
    const node: ScriptComponent = cursor;
    if (depth >= SIMULATION_LIMITS.maxDepth || pathTrace.length >= SIMULATION_LIMITS.maxSteps) {
      truncated = true;
      status = "partial";
      warn({
        code: "truncated",
        detail: `Traversal stopped at the ${SIMULATION_LIMITS.maxDepth}-step bound; the remainder of the path was not walked.`,
        componentId: node.id,
      });
      break;
    }

    if (visited.has(node.id)) {
      cycleDetected = true;
      status = "partial";
      warn({
        code: "cycle_detected",
        detail: `Path returns to "${node.name}" — cycle detected; traversal stopped for inspection.`,
        componentId: node.id,
      });
      addStep({
        componentId: node.id,
        name: node.name,
        kind: node.kind,
        detail: "Cycle — this component was already visited on this path.",
        knowledge: "known",
        evidence: "repeated component on the traversed path",
        warningCode: "cycle_detected",
      });
      break;
    }
    visited.add(node.id);
    traversed.push(node.id);

    addStep({
      componentId: node.id,
      name: node.name,
      kind: node.kind,
      detail: `Enter ${node.kind} "${node.name}".`,
      knowledge: "known",
      evidence: `component recognised at line ${node.line}`,
    });
    addTransition({
      componentId: node.id,
      componentName: node.name,
      operation: "enter",
      valueSource: "structure",
    });

    const edges: ScriptDependency[] = outgoing.get(node.id) ?? [];

    /* ---- state effects: writes / reads ---- */
    for (const dep of edges) {
      if (dep.kind === "writes") {
        const input = inputByKey.get(dep.toKey) ?? inputByKey.get(node.key);
        const assumption = assumptionByKey.get(dep.toKey) ?? assumptionByKey.get(node.key);
        const value = input?.value ?? assumption?.value;
        const source = input ? "scenario_input" : assumption ? "assumption" : "unknown";
        if (assumption && !input) {
          recordAssumption(assumption.key, assumption.value);
        }
        if (value === undefined) {
          state[dep.toKey] = "<unknown>";
          unknownSteps += 1;
          warn({
            code: "assumption_required",
            detail: `"${node.name}" writes "${dep.toKey}" but no value was supplied.`,
            componentId: node.id,
          });
        } else if (Object.keys(state).length < SIMULATION_LIMITS.maxStateKeys) {
          state[dep.toKey] = value;
        }
        addTransition({
          componentId: node.id,
          componentName: node.name,
          operation: "set_field",
          field: dep.toKey,
          value: state[dep.toKey] ?? "<unknown>",
          valueSource: source,
        });
        affected.push(dep.id);
      } else if (dep.kind === "reads") {
        const known = state[dep.toKey];
        addTransition({
          componentId: node.id,
          componentName: node.name,
          operation: "read_field",
          field: dep.toKey,
          value: known ?? "<unknown>",
          valueSource: known === undefined ? "unknown" : "structure",
        });
        if (known === undefined) {
          warn({
            code: "assumption_required",
            detail: `"${node.name}" reads "${dep.toKey}" before anything on this path wrote it.`,
            componentId: node.id,
          });
        }
        affected.push(dep.id);
      } else if (dep.kind === "references") {
        // Deliberately never traversed as control flow — the parser could not
        // name the relationship.
        unsupportedConstructs += 1;
        warn({
          code: "unsupported_expression",
          detail: `"${node.name}" has an unnamed reference to "${dep.toKey}"; it is not treated as a path.`,
          componentId: node.id,
        });
      }
    }

    if (node.kind === "calculation") {
      const assumption = assumptionByKey.get(node.key);
      unsupportedConstructs += 1;
      if (assumption) {
        recordAssumption(assumption.key, assumption.value);
        addStep({
          componentId: node.id,
          name: node.name,
          kind: node.kind,
          detail: `Expression not evaluated; assumed result "${assumption.value}".`,
          knowledge: "assumed",
          evidence: "operator assumption recorded on the scenario",
          warningCode: "unsupported_expression",
        });
      } else {
        warn({
          code: "unsupported_expression",
          detail: `Calculation "${node.name}" is not evaluated by the engine; supply an assumption to continue past it.`,
          componentId: node.id,
        });
      }
    }

    /* ---- navigation ---- */
    const navEdges: ScriptDependency[] = edges.filter((d) => NAVIGATION_KINDS.has(d.kind));

    for (const dep of navEdges) {
      if (dep.resolution === "unresolved" || (!dep.toId && dep.resolution !== "internal")) {
        if (!unresolved.includes(dep.toKey)) unresolved.push(dep.toKey);
      }
    }

    if (navEdges.length === 0) {
      terminalState = { componentId: node.id, name: node.name, kind: node.kind };
      addTransition({
        componentId: node.id,
        componentName: node.name,
        operation: "terminal",
        valueSource: "structure",
      });
      break;
    }

    const resolvable: ScriptDependency[] = navEdges.filter((d) => d.toId && byId.has(d.toId));

    if (resolvable.length === 0) {
      status = "partial";
      const target = navEdges[0]!;
      warn({
        code: "unresolved_dependency",
        detail: `Path stops at "${node.name}": target "${target.toKey}" is not present in this script version.`,
        componentId: node.id,
      });
      addStep({
        componentId: node.id,
        name: node.name,
        kind: node.kind,
        detail: `Continues to "${target.toKey}", which this script does not define.`,
        knowledge: "unknown",
        evidence: `unresolved ${target.kind} edge at line ${target.line}`,
        warningCode: "unresolved_dependency",
      });
      break;
    }

    let chosen: ScriptDependency | undefined;
    let chosenSource: "structure" | "scenario_input" | "assumption" = "structure";

    if (resolvable.length === 1) {
      chosen = resolvable[0]!;
    } else {
      const input = inputByKey.get(node.key);
      const assumption = assumptionByKey.get(node.key);
      const wanted = (input?.value ?? assumption?.value ?? "").trim().toLowerCase();
      if (wanted) {
        chosen = resolvable.find((d) => d.toKey === wanted) ?? resolvable.find((d) => d.toKey.includes(wanted));
        chosenSource = input ? "scenario_input" : "assumption";
        if (chosen && !input && assumption) recordAssumption(assumption.key, assumption.value);
      }
      if (!chosen) {
        status = "partial";
        warn({
          code: "ambiguous_branch",
          detail: `"${node.name}" has ${resolvable.length} possible targets and the scenario does not select one.`,
          componentId: node.id,
        });
        warn({
          code: "assumption_required",
          detail: `Supply a value for "${node.name}" to continue past this branch.`,
          componentId: node.id,
        });
        for (const cand of resolvable.slice(0, SIMULATION_LIMITS.maxAlternatePaths)) {
          alternatePaths.push([...traversed, cand.toId!]);
        }
        addStep({
          componentId: node.id,
          name: node.name,
          kind: node.kind,
          detail: `Branch not determined — candidates: ${resolvable.map((d) => d.toKey).join(", ")}.`,
          knowledge: "unknown",
          evidence: `${resolvable.length} recognised outgoing branch targets`,
          warningCode: "ambiguous_branch",
        });
        break;
      }
    }

    affected.push(chosen.id);
    const next: ScriptComponent = byId.get(chosen!.toId!)!;

    addStep({
      componentId: next.id,
      name: next.name,
      kind: next.kind,
      detail:
        chosenSource === "structure"
          ? `Single recognised ${chosen.kind.replace(/_/g, " ")} target.`
          : `Selected by ${chosenSource === "scenario_input" ? "scenario input" : "assumption"}.`,
      knowledge: chosenSource === "assumption" ? "assumed" : "known",
      evidence: `${chosen.kind} edge at line ${chosen.line}`,
    });

    if (chosen.kind === "transfers_to") {
      traversed.push(next.id);
      terminalState = { componentId: next.id, name: next.name, kind: next.kind };
      addTransition({
        componentId: next.id,
        componentName: next.name,
        operation: "dispatch",
        valueSource: chosenSource,
      });
      break;
    }

    addTransition({
      componentId: next.id,
      componentName: next.name,
      operation: chosen.kind === "branches_to" ? "branch" : "navigate",
      valueSource: chosenSource,
    });

    cursor = next;
  }

  if (unresolved.length > 0 && status === "complete") status = "partial";

  return {
    status,
    startingComponentId,
    traversedComponentIds: traversed,
    pathTrace,
    transitions,
    ...(terminalState ? { terminalState } : {}),
    alternatePaths,
    affectedDependencies: [...new Set(affected)],
    unresolvedDependencies: unresolved,
    assumptionsUsed,
    warnings,
    truncated,
    cycleDetected,
    knownSteps,
    assumedSteps,
    unknownSteps,
    unsupportedConstructs,
  };

  function recordAssumption(key: string, value: string): void {
    if (assumptionsUsed.some((a) => a.key === key)) return;
    if (assumptionsUsed.length >= SIMULATION_LIMITS.maxAssumptions) return;
    assumptionsUsed.push({ key, value });
  }

  function empty(): TraversalOutcome {
    return {
      status: "unknown_path",
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
      knownSteps: 0,
      assumedSteps: 0,
      unknownSteps: 0,
      unsupportedConstructs: 0,
    };
  }

  function blocked(kind: SimulationStatus, detail: string): TraversalOutcome {
    warn({ code: "unknown_component", detail });
    return { ...empty(), status: kind, warnings };
  }
}

/** Human-readable path trace: "Cancellation → Listed → RegDr → Dispatch". */
export function renderPathTrace(outcome: TraversalOutcome, structure: ScriptStructure): string {
  const byId = new Map(structure.components.map((c) => [c.id, c] as const));
  return outcome.traversedComponentIds.map((id) => byId.get(id)?.name ?? id).join(" → ");
}
