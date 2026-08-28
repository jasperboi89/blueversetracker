/**
 * Phase 4 — dependency model & traversal.
 *
 * Pure graph mechanics over an extracted `ScriptStructure`. Everything here is
 * deterministic and bounded: identical input always yields an identically
 * ordered result, so a diff between two analyses reflects the script changing
 * rather than traversal order changing.
 */

import {
  SCRIPT_LIMITS,
  type ScriptComponent,
  type ScriptDependency,
  type ScriptStructure,
} from "./script-contract";

export interface DependencyNode {
  component: ScriptComponent;
  /** Ids of components this one depends on (internal edges only). */
  dependsOn: string[];
  /** Ids of components that depend on this one. */
  dependents: string[];
}

export interface DependencyGraph {
  nodes: Map<string, DependencyNode>;
  edges: ScriptDependency[];
  /** Reachable from the root; anything absent is orphaned. */
  roots: string[];
}

export function buildDependencyGraph(structure: ScriptStructure): DependencyGraph {
  const nodes = new Map<string, DependencyNode>();
  for (const component of structure.components) {
    nodes.set(component.id, { component, dependsOn: [], dependents: [] });
  }

  const internal = structure.dependencies.filter((d) => d.resolution === "internal" && d.toId);
  for (const edge of internal) {
    const from = nodes.get(edge.fromId);
    const to = edge.toId ? nodes.get(edge.toId) : undefined;
    if (!from || !to || from === to) continue;
    if (!from.dependsOn.includes(to.component.id)) from.dependsOn.push(to.component.id);
    if (!to.dependents.includes(from.component.id)) to.dependents.push(from.component.id);
  }

  // Deterministic neighbour order.
  for (const node of nodes.values()) {
    node.dependsOn.sort();
    node.dependents.sort();
  }

  const roots = [...nodes.values()]
    .filter((n) => n.dependents.length === 0)
    .map((n) => n.component.id)
    .sort();

  return { nodes, edges: structure.dependencies, roots };
}

/**
 * Components nothing points at and which point at nothing — usually dead script
 * or a rename that left a stale definition behind. Reported, never deleted.
 */
export function findOrphans(graph: DependencyGraph): string[] {
  return [...graph.nodes.values()]
    .filter((n) => n.dependsOn.length === 0 && n.dependents.length === 0)
    .map((n) => n.component.id)
    .sort();
}

/**
 * All simple cycles, as ordered id lists. Cycles are legitimate in scripts
 * (a "repeat the question" loop) so they are surfaced as structure, not errors.
 */
export function findCycles(graph: DependencyGraph): string[][] {
  const cycles: string[][] = [];
  const seen = new Set<string>();
  const stack: string[] = [];
  const onStack = new Set<string>();

  const visit = (id: string): void => {
    if (cycles.length >= 50) return;
    if (onStack.has(id)) {
      const start = stack.indexOf(id);
      if (start >= 0) {
        const cycle = stack.slice(start);
        // Canonical rotation so the same loop is never reported twice.
        const min = cycle.reduce((a, b) => (a < b ? a : b));
        const pivot = cycle.indexOf(min);
        const rotated = [...cycle.slice(pivot), ...cycle.slice(0, pivot)];
        const key = rotated.join(">");
        if (!cycles.some((c) => c.join(">") === key)) cycles.push(rotated);
      }
      return;
    }
    if (seen.has(id)) return;
    seen.add(id);
    stack.push(id);
    onStack.add(id);
    for (const next of graph.nodes.get(id)?.dependsOn ?? []) visit(next);
    stack.pop();
    onStack.delete(id);
  };

  for (const id of [...graph.nodes.keys()].sort()) visit(id);
  return cycles;
}

/** Longest dependency chain, cycle-safe. */
export function maxDepth(graph: DependencyGraph): number {
  const memo = new Map<string, number>();
  const visiting = new Set<string>();

  const depth = (id: string): number => {
    if (memo.has(id)) return memo.get(id)!;
    if (visiting.has(id)) return 0; // cycle — stop counting, don't hang
    visiting.add(id);
    const children = graph.nodes.get(id)?.dependsOn ?? [];
    const result = children.length === 0 ? 1 : 1 + Math.max(...children.map(depth));
    visiting.delete(id);
    memo.set(id, result);
    return result;
  };

  let best = 0;
  for (const id of graph.nodes.keys()) best = Math.max(best, depth(id));
  return best;
}

export type ImpactDirection = "downstream" | "upstream";

export interface ImpactHit {
  id: string;
  /** Edge hops from the seed component. */
  distance: number;
}

/**
 * Everything reachable from `seedIds`, breadth-first so `distance` is the true
 * shortest hop count. `downstream` = what this component relies on;
 * `upstream` = what would be affected if this component changed.
 */
export function traverseImpact(
  graph: DependencyGraph,
  seedIds: string[],
  direction: ImpactDirection,
  maxNodes: number = SCRIPT_LIMITS.maxImpactNodes,
): ImpactHit[] {
  const out: ImpactHit[] = [];
  const seen = new Set<string>(seedIds);
  let frontier = seedIds.filter((id) => graph.nodes.has(id));
  let distance = 0;

  while (frontier.length > 0 && out.length < maxNodes) {
    distance += 1;
    const next: string[] = [];
    for (const id of frontier) {
      const node = graph.nodes.get(id);
      if (!node) continue;
      const neighbours = direction === "downstream" ? node.dependsOn : node.dependents;
      for (const n of neighbours) {
        if (seen.has(n)) continue;
        seen.add(n);
        out.push({ id: n, distance });
        next.push(n);
        if (out.length >= maxNodes) break;
      }
      if (out.length >= maxNodes) break;
    }
    frontier = next;
  }

  return out;
}
