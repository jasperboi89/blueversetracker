/**
 * Phase 7 — proposed-change overlays.
 *
 * A proposed change exists ONLY inside the simulation. The canonical imported
 * script is never rewritten: `applyOverlay` returns a derived structure that
 * lives for the duration of a run. There is deliberately no "commit overlay"
 * function anywhere in Phase 7.
 */

import {
  componentId as makeComponentId,
  normalizeKey,
  type ScriptComponent,
  type ScriptDependency,
  type ScriptDependencyKind,
  type ScriptStructure,
} from "@/lib/script/script-contract";

export interface BranchTargetOverride {
  /** Component key whose outgoing edge is being redirected. */
  fromKey: string;
  /** Existing target key being replaced. */
  currentToKey: string;
  /** Proposed target key. */
  proposedToKey: string;
}

export interface AddedRelationship {
  fromKey: string;
  toKey: string;
  kind: ScriptDependencyKind;
}

export interface SimulationOverlay {
  id: string;
  name: string;
  scriptId: string;
  /** Structure fingerprint the overlay was authored against. */
  baseStructureFingerprint?: string;
  disabledComponentKeys: string[];
  branchTargetOverrides: BranchTargetOverride[];
  addedRelationships: AddedRelationship[];
  /** Field assignment overrides keyed by component key. */
  fieldValueOverrides: Array<{ key: string; value: string }>;
  createdAt: string;
}

let seq = 0;

export function makeOverlay(
  input: Omit<Partial<SimulationOverlay>, "id" | "createdAt"> & { name: string; scriptId: string },
  now: Date = new Date(),
): SimulationOverlay {
  seq += 1;
  return {
    id: `ovl_${now.getTime().toString(36)}_${seq.toString(36)}`,
    name: input.name.slice(0, 120),
    scriptId: input.scriptId,
    ...(input.baseStructureFingerprint
      ? { baseStructureFingerprint: input.baseStructureFingerprint }
      : {}),
    disabledComponentKeys: (input.disabledComponentKeys ?? []).map(normalizeKey),
    branchTargetOverrides: (input.branchTargetOverrides ?? []).map((o) => ({
      fromKey: normalizeKey(o.fromKey),
      currentToKey: normalizeKey(o.currentToKey),
      proposedToKey: normalizeKey(o.proposedToKey),
    })),
    addedRelationships: (input.addedRelationships ?? []).map((r) => ({
      fromKey: normalizeKey(r.fromKey),
      toKey: normalizeKey(r.toKey),
      kind: r.kind,
    })),
    fieldValueOverrides: (input.fieldValueOverrides ?? []).map((f) => ({
      key: normalizeKey(f.key),
      value: f.value.slice(0, 120),
    })),
    createdAt: now.toISOString(),
  };
}

export function isEmptyOverlay(overlay: SimulationOverlay | undefined): boolean {
  if (!overlay) return true;
  return (
    overlay.disabledComponentKeys.length === 0 &&
    overlay.branchTargetOverrides.length === 0 &&
    overlay.addedRelationships.length === 0 &&
    overlay.fieldValueOverrides.length === 0
  );
}

export interface OverlayApplication {
  /** Derived, in-memory only. Never persisted as a script version. */
  structure: ScriptStructure;
  /** What the overlay actually did — reported to the operator verbatim. */
  notes: string[];
  /** Overlay entries that matched nothing in the base structure. */
  ineffective: string[];
}

/**
 * Evaluate CANONICAL SCRIPT + PROPOSED OVERLAY. The base structure object is
 * not mutated; callers keep using it for the "current behaviour" side of a
 * comparison.
 */
export function applyOverlay(
  base: ScriptStructure,
  overlay: SimulationOverlay | undefined,
): OverlayApplication {
  if (isEmptyOverlay(overlay) || !overlay) {
    return { structure: base, notes: [], ineffective: [] };
  }

  const notes: string[] = [];
  const ineffective: string[] = [];

  const byKey = new Map(base.components.map((c) => [c.key, c] as const));
  const disabled = new Set<string>();
  for (const key of overlay.disabledComponentKeys) {
    if (byKey.has(key)) {
      disabled.add(key);
      notes.push(`Component "${key}" disabled in the overlay.`);
    } else {
      ineffective.push(`Disable "${key}" matched no component.`);
    }
  }

  const disabledIds = new Set(
    [...disabled].map((k) => byKey.get(k)?.id).filter((v): v is string => Boolean(v)),
  );

  const components: ScriptComponent[] = base.components.filter((c) => !disabledIds.has(c.id));
  const componentIdByKey = new Map(components.map((c) => [c.key, c.id] as const));

  const dependencies: ScriptDependency[] = [];
  for (const dep of base.dependencies) {
    if (disabledIds.has(dep.fromId)) continue;
    if (dep.toId && disabledIds.has(dep.toId)) {
      notes.push(`Edge into disabled component "${dep.toKey}" removed for this run.`);
      continue;
    }

    const fromKey = components.find((c) => c.id === dep.fromId)?.key;
    const override = overlay.branchTargetOverrides.find(
      (o) => o.fromKey === fromKey && o.currentToKey === dep.toKey,
    );

    if (!override) {
      dependencies.push(dep);
      continue;
    }

    const toId = componentIdByKey.get(override.proposedToKey);
    dependencies.push({
      ...dep,
      id: `${dep.id}~overlay`,
      toKey: override.proposedToKey,
      ...(toId ? { toId } : {}),
      resolution: toId ? "internal" : "unresolved",
    });
    notes.push(
      `"${fromKey}" → "${dep.toKey}" retargeted to "${override.proposedToKey}"${
        toId ? "" : " (target not present in this script — unresolved in simulation)"
      }.`,
    );
  }

  for (const rel of overlay.addedRelationships) {
    const fromId = componentIdByKey.get(rel.fromKey);
    if (!fromId) {
      ineffective.push(`New relationship from "${rel.fromKey}" matched no component.`);
      continue;
    }
    const toId = componentIdByKey.get(rel.toKey);
    dependencies.push({
      id: `overlay:${rel.kind}:${fromId}:${rel.toKey}`,
      kind: rel.kind,
      fromId,
      toKey: rel.toKey,
      ...(toId ? { toId } : {}),
      resolution: toId ? "internal" : "unresolved",
      line: 0,
    });
    notes.push(`Proposed relationship "${rel.fromKey}" --${rel.kind}--> "${rel.toKey}" added.`);
  }

  for (const f of overlay.fieldValueOverrides) {
    if (!componentIdByKey.has(f.key) && !byKey.has(f.key)) {
      ineffective.push(`Field override for "${f.key}" matched no component.`);
    } else {
      notes.push(`Field "${f.key}" assigned "${f.value}" by the overlay.`);
    }
  }

  // Overlays never change how much of the underlying script the parser
  // understood, so recognition counts are carried straight through.
  return {
    structure: {
      components,
      dependencies,
      unknowns: base.unknowns,
      lineCount: base.lineCount,
      recognizedLines: base.recognizedLines,
    },
    notes,
    ineffective,
  };
}

/** Used by the builder UI so a proposed component reference stays canonical. */
export function overlayComponentId(kind: ScriptComponent["kind"], name: string): string {
  return makeComponentId(kind, name);
}
