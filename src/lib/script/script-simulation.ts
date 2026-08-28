/**
 * Phase 4 — future simulation seam.
 *
 * Phase 4 autonomy is capped at OBSERVE / EXPLAIN / RECOMMEND / PREPARE, so
 * nothing here executes a script or predicts runtime behaviour. What it does is
 * define the *shape* a later simulation phase will fill in, and provide the one
 * thing that is safe today: static path enumeration over the dependency graph.
 *
 * Keeping the seam explicit prevents a later phase from bolting simulation onto
 * the extractor and quietly implying the walked paths were actually executed.
 */

import { SCRIPT_LIMITS, type ScriptStructure } from "./script-contract";
import { buildDependencyGraph, type DependencyGraph } from "./dependency-graph";

export type SimulationSupport = "static_paths_only";

export interface ScriptPath {
  /** Component ids in visit order. */
  nodeIds: string[];
  names: string[];
  /** True when the walk stopped at the depth cap rather than a terminal node. */
  truncated: boolean;
  /** True when the walk stopped because it revisited a node. */
  loopedBack: boolean;
}

export interface StaticPathReport {
  support: SimulationSupport;
  entryPoints: string[];
  paths: ScriptPath[];
  /** Components no enumerated path reaches. */
  unreachable: string[];
  caveats: string[];
}

const MAX_PATHS = 25;
const MAX_DEPTH = 25;

/** Nodes nothing points at — where a run of the script can begin. */
function entryPointsOf(graph: DependencyGraph): string[] {
  const targeted = new Set<string>();
  for (const node of graph.nodes.values()) {
    for (const id of node.dependsOn) targeted.add(id);
  }
  const entries = [...graph.nodes.keys()].filter((id) => !targeted.has(id));
  // A fully cyclic graph has no entry point; fall back to the first node so the
  // report is still useful rather than empty.
  return entries.length > 0 ? entries.sort() : [...graph.nodes.keys()].sort().slice(0, 1);
}

/**
 * Enumerates structural paths through the script. These are routes the script's
 * declared dependencies allow — NOT executions, and not weighted by likelihood.
 */
export function enumerateStaticPaths(structure: ScriptStructure): StaticPathReport {
  const graph = buildDependencyGraph(structure);
  const entryPoints = entryPointsOf(graph);
  const paths: ScriptPath[] = [];
  const visitedAnywhere = new Set<string>();

  const walk = (id: string, trail: string[], seen: Set<string>): void => {
    if (paths.length >= MAX_PATHS) return;
    const node = graph.nodes.get(id);
    if (!node) return;

    const nextTrail = [...trail, id];
    visitedAnywhere.add(id);

    if (seen.has(id)) {
      paths.push({
        nodeIds: nextTrail,
        names: nextTrail.map((n) => graph.nodes.get(n)?.component.name ?? n),
        truncated: false,
        loopedBack: true,
      });
      return;
    }
    if (nextTrail.length >= MAX_DEPTH) {
      paths.push({
        nodeIds: nextTrail,
        names: nextTrail.map((n) => graph.nodes.get(n)?.component.name ?? n),
        truncated: true,
        loopedBack: false,
      });
      return;
    }

    const onward = node.dependsOn.filter((id) => graph.nodes.has(id));
    if (onward.length === 0) {
      paths.push({
        nodeIds: nextTrail,
        names: nextTrail.map((n) => graph.nodes.get(n)?.component.name ?? n),
        truncated: false,
        loopedBack: false,
      });
      return;
    }

    const nextSeen = new Set(seen).add(id);
    for (const nextId of onward) walk(nextId, nextTrail, nextSeen);
  };

  for (const entry of entryPoints) walk(entry, [], new Set());

  // Components that sit inside a cycle are reachable from no entry point, so
  // the walk above never touches them. Seed a walk from each so a fully or
  // partially cyclic script still reports its paths instead of looking empty.
  for (const id of [...graph.nodes.keys()].sort()) {
    if (visitedAnywhere.has(id) || paths.length >= MAX_PATHS) continue;
    walk(id, [], new Set());
  }

  const unreachable = [...graph.nodes.keys()]
    .filter((id) => !visitedAnywhere.has(id))
    .map((id) => graph.nodes.get(id)?.component.name ?? id)
    .sort();

  const caveats = [
    "Structural paths only — these are routes the script's declared dependencies permit, not executions or predictions.",
    "Conditions on branches are not evaluated; every outgoing edge is treated as equally available.",
  ];
  if (paths.length >= MAX_PATHS) {
    caveats.push(`Enumeration stopped at ${MAX_PATHS} paths; this is a sample, not the full set.`);
  }
  if (structure.unknowns.length > 0) {
    caveats.push(
      `${structure.unknowns.length} unrecognised line(s) may contain paths that are missing here.`,
    );
  }
  if (structure.components.length > SCRIPT_LIMITS.maxImpactNodes) {
    caveats.push("Large script — path enumeration covers only part of the graph.");
  }

  return { support: "static_paths_only", entryPoints, paths, unreachable, caveats };
}
