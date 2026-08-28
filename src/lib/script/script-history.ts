/**
 * Phase 4 — historical intelligence over the append-only version record.
 *
 * `script_versions` is insert+select only, so history is a trustworthy record
 * rather than a mutable cache. This module reads that record and answers
 * questions about how a script has moved over time.
 *
 * Everything here is descriptive. It reports what changed and when; it does not
 * assert that any change produced any outcome.
 */

import type { ScriptVersion } from "./script-contract";
import { diffStructures, type StructuralDiff } from "./script-diff";

export interface VersionTransition {
  from: ScriptVersion;
  to: ScriptVersion;
  diff: StructuralDiff;
  /** True when only wording changed — same structure fingerprint. */
  cosmeticOnly: boolean;
  intervalMs: number;
}

export interface ScriptHistoryInsight {
  versionCount: number;
  firstSeenAt?: string;
  lastChangedAt?: string;
  /** Structural (non-cosmetic) revisions. */
  structuralRevisions: number;
  cosmeticRevisions: number;
  /** Components changed most often — churn hotspots. */
  hotspots: Array<{ id: string; name: string; changeCount: number }>;
  /** Direction of travel across the whole record. */
  complexityTrend: "growing" | "shrinking" | "stable" | "unknown";
  /** Unknown-construct count over time — is the script drifting away from us? */
  recognitionTrend: "improving" | "degrading" | "stable" | "unknown";
}

/** Versions ordered oldest → newest, defensively (the API sorts descending). */
export function orderVersions(versions: ScriptVersion[]): ScriptVersion[] {
  return [...versions].sort((a, b) => a.versionNumber - b.versionNumber);
}

export function buildTransitions(versions: ScriptVersion[]): VersionTransition[] {
  const ordered = orderVersions(versions);
  const transitions: VersionTransition[] = [];

  for (let i = 1; i < ordered.length; i += 1) {
    const from = ordered[i - 1]!;
    const to = ordered[i]!;
    transitions.push({
      from,
      to,
      diff: diffStructures(from.structure, to.structure),
      cosmeticOnly: from.structureFingerprint === to.structureFingerprint,
      intervalMs: Math.max(0, Date.parse(to.ingestedAt) - Date.parse(from.ingestedAt)),
    });
  }

  return transitions;
}

function trend(first: number, last: number, tolerance: number): "up" | "down" | "flat" {
  const delta = last - first;
  if (Math.abs(delta) <= tolerance) return "flat";
  return delta > 0 ? "up" : "down";
}

export function analyzeHistory(versions: ScriptVersion[]): ScriptHistoryInsight {
  const ordered = orderVersions(versions);

  if (ordered.length === 0) {
    return {
      versionCount: 0,
      structuralRevisions: 0,
      cosmeticRevisions: 0,
      hotspots: [],
      complexityTrend: "unknown",
      recognitionTrend: "unknown",
    };
  }

  const transitions = buildTransitions(ordered);
  const churn = new Map<string, { name: string; count: number }>();

  for (const t of transitions) {
    for (const delta of t.diff.components) {
      if (delta.kind === "unchanged") continue;
      const entry = churn.get(delta.id) ?? { name: delta.component.name, count: 0 };
      entry.count += 1;
      churn.set(delta.id, entry);
    }
  }

  const hotspots = [...churn.entries()]
    .map(([id, v]) => ({ id, name: v.name, changeCount: v.count }))
    .filter((h) => h.changeCount > 1)
    .sort((a, b) => b.changeCount - a.changeCount || a.name.localeCompare(b.name))
    .slice(0, 8);

  const first = ordered[0]!;
  const last = ordered[ordered.length - 1]!;

  const complexityDirection =
    ordered.length < 2
      ? "unknown"
      : trend(first.complexity.componentCount, last.complexity.componentCount, 2);
  const recognitionDirection =
    ordered.length < 2 ? "unknown" : trend(first.complexity.unknownCount, last.complexity.unknownCount, 1);

  const structuralRevisions = transitions.filter((t) => !t.cosmeticOnly).length;

  return {
    versionCount: ordered.length,
    firstSeenAt: first.ingestedAt,
    lastChangedAt: last.ingestedAt,
    structuralRevisions,
    cosmeticRevisions: transitions.length - structuralRevisions,
    hotspots,
    complexityTrend:
      complexityDirection === "unknown"
        ? "unknown"
        : complexityDirection === "up"
          ? "growing"
          : complexityDirection === "down"
            ? "shrinking"
            : "stable",
    // More unknowns over time means the script is drifting away from what the
    // extractor understands — worth telling the operator.
    recognitionTrend:
      recognitionDirection === "unknown"
        ? "unknown"
        : recognitionDirection === "up"
          ? "degrading"
          : recognitionDirection === "down"
            ? "improving"
            : "stable",
  };
}
