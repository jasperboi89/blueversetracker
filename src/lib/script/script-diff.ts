/**
 * Phase 4 — structural diff.
 *
 * Compares two extracted structures rather than two blobs of text. A reworded
 * prompt is a `modified` component; a new branch target is an `added`
 * dependency. That distinction is what makes change-impact analysis meaningful
 * — text diffs cannot tell the two apart.
 *
 * Diffs are computed on component *keys*, so a component that moved to a
 * different line is unchanged, not removed-and-re-added.
 */

import type {
  ScriptComponent,
  ScriptDependency,
  ScriptStructure,
} from "./script-contract";

export type DiffKind = "added" | "removed" | "modified" | "unchanged";

export interface ComponentDelta {
  id: string;
  kind: DiffKind;
  component: ScriptComponent;
  /** Populated for `modified` — what actually differs. */
  changes?: string[];
}

export interface DependencyDelta {
  kind: DiffKind;
  dependency: ScriptDependency;
}

export interface StructuralDiff {
  components: ComponentDelta[];
  dependencies: DependencyDelta[];
  counts: {
    componentsAdded: number;
    componentsRemoved: number;
    componentsModified: number;
    dependenciesAdded: number;
    dependenciesRemoved: number;
  };
  /** True when nothing structural changed, even if the text differs. */
  structurallyIdentical: boolean;
  unknownDelta: number;
}

function depKey(d: ScriptDependency): string {
  return `${d.kind}|${d.fromId}|${d.toKey}`;
}

export function diffStructures(
  before: ScriptStructure,
  after: ScriptStructure,
): StructuralDiff {
  const beforeComponents = new Map(before.components.map((c) => [c.id, c]));
  const afterComponents = new Map(after.components.map((c) => [c.id, c]));

  const components: ComponentDelta[] = [];

  for (const [id, component] of afterComponents) {
    const prev = beforeComponents.get(id);
    if (!prev) {
      components.push({ id, kind: "added", component });
      continue;
    }
    const changes: string[] = [];
    if (prev.name !== component.name) changes.push(`renamed from "${prev.name}"`);
    if (prev.occurrences !== component.occurrences) {
      changes.push(`used ${prev.occurrences}→${component.occurrences} time(s)`);
    }
    components.push(
      changes.length > 0
        ? { id, kind: "modified", component, changes }
        : { id, kind: "unchanged", component },
    );
  }

  for (const [id, component] of beforeComponents) {
    if (!afterComponents.has(id)) components.push({ id, kind: "removed", component });
  }

  const beforeDeps = new Map(before.dependencies.map((d) => [depKey(d), d]));
  const afterDeps = new Map(after.dependencies.map((d) => [depKey(d), d]));
  const dependencies: DependencyDelta[] = [];

  for (const [key, dependency] of afterDeps) {
    if (!beforeDeps.has(key)) dependencies.push({ kind: "added", dependency });
  }
  for (const [key, dependency] of beforeDeps) {
    if (!afterDeps.has(key)) dependencies.push({ kind: "removed", dependency });
  }

  // Stable presentation order: structural changes first, then alphabetical.
  const ORDER: Record<DiffKind, number> = { added: 0, removed: 1, modified: 2, unchanged: 3 };
  components.sort((a, b) => ORDER[a.kind] - ORDER[b.kind] || a.id.localeCompare(b.id));
  dependencies.sort(
    (a, b) => ORDER[a.kind] - ORDER[b.kind] || depKey(a.dependency).localeCompare(depKey(b.dependency)),
  );

  const counts = {
    componentsAdded: components.filter((c) => c.kind === "added").length,
    componentsRemoved: components.filter((c) => c.kind === "removed").length,
    componentsModified: components.filter((c) => c.kind === "modified").length,
    dependenciesAdded: dependencies.filter((d) => d.kind === "added").length,
    dependenciesRemoved: dependencies.filter((d) => d.kind === "removed").length,
  };

  const structurallyIdentical =
    counts.componentsAdded === 0 &&
    counts.componentsRemoved === 0 &&
    counts.componentsModified === 0 &&
    counts.dependenciesAdded === 0 &&
    counts.dependenciesRemoved === 0;

  return {
    components,
    dependencies,
    counts,
    structurallyIdentical,
    unknownDelta: after.unknowns.length - before.unknowns.length,
  };
}
