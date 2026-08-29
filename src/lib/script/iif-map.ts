/**
 * Activation 4 — records → canonical script structure.
 *
 * Turns located {@link IifRecord}s into the same `ScriptStructure` the rest of
 * Phase 4 already reasons over, so an imported Amtelco export lights up the
 * Dependency Cortex, diffing, impact analysis and regression suites without any
 * of those modules learning about IIF.
 *
 * Mapping is registry-driven: a record type only becomes a component if
 * `IIF_CONSTRUCTS` declares a `mapsTo` kind for it. An unfamiliar type is never
 * coerced into the nearest-looking kind — it is recorded as an unknown and
 * surfaced in the coverage report.
 */

import {
  SCRIPT_LIMITS,
  componentId,
  normalizeKey,
  type ScriptComponent,
  type ScriptDependency,
  type ScriptDependencyKind,
  type ScriptStructure,
  type ScriptUnknown,
} from "./script-contract";
import {
  IIF_CONSTRUCTS,
  IIF_LIMITS,
  constructFor,
  type IifConstructCoverage,
  type IifCoverageReport,
} from "./iif-contract";
import type { IifParseResult, IifRecord } from "./iif-parse";

/** Field names that carry the operator-facing identity of a record. */
const NAME_FIELDS = ["name", "id", "label", "title", "caption", "key", "tag", "text", "prompt"];

/**
 * Field names whose *value* points at another node, and the edge kind that
 * implies. Anything not listed here is treated as data, never as an edge — an
 * invented edge is worse than a missing one, because it silently widens every
 * downstream impact analysis.
 */
const EDGE_FIELDS: ReadonlyArray<{ field: string; kind: ScriptDependencyKind }> = [
  { field: "goto", kind: "branches_to" },
  { field: "next", kind: "branches_to" },
  { field: "then", kind: "branches_to" },
  { field: "else", kind: "branches_to" },
  { field: "target", kind: "branches_to" },
  { field: "jump", kind: "branches_to" },
  { field: "onyes", kind: "branches_to" },
  { field: "onno", kind: "branches_to" },
  { field: "call", kind: "calls" },
  { field: "proc", kind: "calls" },
  { field: "procedure", kind: "calls" },
  { field: "include", kind: "includes" },
  { field: "src", kind: "includes" },
  { field: "source_script", kind: "includes" },
  { field: "transfer", kind: "transfers_to" },
  { field: "destination", kind: "transfers_to" },
  { field: "dest", kind: "transfers_to" },
  { field: "reads", kind: "reads" },
  { field: "input", kind: "reads" },
  { field: "writes", kind: "writes" },
  { field: "output", kind: "writes" },
  { field: "assign_to", kind: "writes" },
  { field: "ref", kind: "references" },
  { field: "parent", kind: "references" },
];

function displayName(record: IifRecord): string {
  for (const field of NAME_FIELDS) {
    const v = record.fields[field];
    if (v) return v.slice(0, 120);
  }
  const positional = record.values.find((v) => v.length > 0);
  if (positional) return positional.slice(0, 120);
  return `${record.rawType} @ line ${record.line}`;
}

export interface IifMapResult {
  structure: ScriptStructure;
  coverage: IifCoverageReport;
}

export function mapRecordsToStructure(parsed: IifParseResult): IifMapResult {
  const components: ScriptComponent[] = [];
  const byId = new Map<string, ScriptComponent>();
  const byKey = new Map<string, ScriptComponent>();
  const dependencies: ScriptDependency[] = [];
  const unknowns: ScriptUnknown[] = [...parsed.unknowns];

  const counts = new Map<
    string,
    { count: number; mapped: number; firstLine: number; raw: string }
  >();
  const unrecognizedTypes = new Set<string>();

  const bump = (record: IifRecord, mapped: boolean) => {
    const entry = counts.get(record.type) ?? {
      count: 0,
      mapped: 0,
      firstLine: record.line,
      raw: record.rawType,
    };
    entry.count += 1;
    if (mapped) entry.mapped += 1;
    counts.set(record.type, entry);
  };

  /* ---------------- components ---------------- */

  for (const record of parsed.records) {
    const spec = constructFor(record.type);

    if (!spec) {
      bump(record, false);
      if (unrecognizedTypes.size < IIF_LIMITS.maxUnrecognizedTypes) {
        unrecognizedTypes.add(record.rawType.slice(0, 60));
      }
      if (unknowns.length < SCRIPT_LIMITS.maxUnknowns) {
        unknowns.push({
          line: record.line,
          reason: "unrecognized_construct",
          excerpt: `${record.rawType}: ${displayName(record)}`.slice(0, SCRIPT_LIMITS.maxExcerpt),
        });
      }
      continue;
    }

    if (!spec.mapsTo) {
      // `partial` support: located and counted, deliberately not graphed.
      bump(record, false);
      continue;
    }

    const name = displayName(record);
    const id = componentId(spec.mapsTo, name);
    const existing = byId.get(id);
    if (existing) {
      existing.occurrences += 1;
      bump(record, true);
      continue;
    }

    if (components.length >= SCRIPT_LIMITS.maxComponents) {
      bump(record, false);
      continue;
    }

    const component: ScriptComponent = {
      id,
      kind: spec.mapsTo,
      name,
      key: normalizeKey(name),
      line: record.line,
      occurrences: 1,
    };
    components.push(component);
    byId.set(id, component);
    if (!byKey.has(component.key)) byKey.set(component.key, component);
    bump(record, true);
  }

  /* ---------------- dependencies ---------------- */

  const seenEdges = new Set<string>();

  for (const record of parsed.records) {
    const spec = constructFor(record.type);
    if (!spec?.mapsTo) continue;
    const fromId = componentId(spec.mapsTo, displayName(record));
    if (!byId.has(fromId)) continue;

    for (const { field, kind } of EDGE_FIELDS) {
      const rawTarget = record.fields[field];
      if (!rawTarget) continue;

      // A field may list several targets; splitting on the common separators is
      // layout handling, not interpretation.
      const targets = rawTarget
        .split(/[;,|]/)
        .map((t) => normalizeKey(t))
        .filter(Boolean)
        .slice(0, 8);

      for (const toKey of targets) {
        const edgeId = `${kind}:${fromId}:${toKey}`;
        if (seenEdges.has(edgeId)) continue;
        if (dependencies.length >= SCRIPT_LIMITS.maxDependencies) break;
        seenEdges.add(edgeId);

        const target = byKey.get(toKey);
        dependencies.push({
          id: edgeId,
          kind,
          fromId,
          toKey,
          ...(target ? { toId: target.id } : {}),
          // `includes` points outside this file by definition; everything else
          // that misses a local component is honestly "unresolved".
          resolution: target ? "internal" : kind === "includes" ? "external" : "unresolved",
          line: record.line,
        });
      }
    }
  }

  const structure: ScriptStructure = {
    components,
    dependencies,
    unknowns: unknowns.slice(0, SCRIPT_LIMITS.maxUnknowns),
    lineCount: parsed.lineCount,
    recognizedLines: parsed.recognizedLines,
  };

  /* ---------------- coverage ---------------- */

  const constructs: IifConstructCoverage[] = [...counts.entries()]
    .map(([typeId, entry]) => {
      const spec = constructFor(typeId);
      return {
        typeId,
        label: spec?.label ?? `Unrecognised: ${entry.raw}`,
        support: spec?.support ?? ("unrecognized" as const),
        count: entry.count,
        mappedCount: entry.mapped,
        firstLine: entry.firstLine,
      };
    })
    .sort((a, b) => b.count - a.count || a.typeId.localeCompare(b.typeId));

  const substantive = Math.max(0, parsed.lineCount - parsed.ignoredLines);
  const lineCoverage = substantive === 0 ? 1 : Math.min(1, parsed.recognizedLines / substantive);

  const coverage: IifCoverageReport = {
    dialect: parsed.dialect,
    lineCount: parsed.lineCount,
    recognizedLines: parsed.recognizedLines,
    lineCoverage,
    recordCount: parsed.records.length,
    mappedComponentCount: components.length,
    unknownCount: structure.unknowns.length,
    constructs,
    unrecognizedTypes: [...unrecognizedTypes].sort(),
    limitations: buildLimitations(parsed, structure, lineCoverage, unrecognizedTypes),
  };

  return { structure, coverage };
}

function buildLimitations(
  parsed: IifParseResult,
  structure: ScriptStructure,
  lineCoverage: number,
  unrecognizedTypes: Set<string>,
): string[] {
  const out: string[] = [];

  out.push(
    "This importer has not been validated against a genuine Amtelco export. Treat recognised structure as a reading of the file's layout, not a certified interpretation of IS semantics.",
  );

  if (parsed.dialect === "unknown") {
    out.push(
      "The file's layout was not recognised, so no structure was extracted. Every substantive line is listed as unknown.",
    );
  } else {
    out.push(
      `Layout detected as "${parsed.dialect}" from punctuation shape alone; record names were not used to decide this.`,
    );
  }

  if (lineCoverage < 1) {
    out.push(
      `${Math.round(lineCoverage * 100)}% of substantive lines were classified. The remainder is listed below rather than discarded.`,
    );
  }
  if (unrecognizedTypes.size > 0) {
    out.push(
      `${unrecognizedTypes.size} record type(s) are outside the declared recognition registry and were not mapped into the dependency graph.`,
    );
  }
  if (parsed.truncated) {
    out.push(
      `File exceeded ${IIF_LIMITS.maxLines.toLocaleString()} lines and was read only up to that point.`,
    );
  }
  const unresolved = structure.dependencies.filter((d) => d.resolution === "unresolved").length;
  if (unresolved > 0) {
    out.push(
      `${unresolved} reference(s) point at targets not present in this file — they may live in a linked script that was not imported.`,
    );
  }
  out.push(
    "Conditions, formulas and action bodies are recorded as structure only. Nothing in this import is evaluated, simulated as a real run, executed, or written back to any IS system.",
  );

  return out;
}

/** The declared recognition surface, for the operator-facing support matrix. */
export function recognitionMatrix() {
  return IIF_CONSTRUCTS.map((c) => ({
    id: c.id,
    label: c.label,
    support: c.support,
    mapsTo: c.mapsTo,
    note: c.note,
  }));
}
