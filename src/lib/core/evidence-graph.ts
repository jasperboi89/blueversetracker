/**
 * Intelligence Core — Phase 11: Evidence Graph.
 *
 * A lightweight, in-memory graph assembled over facts projected from the
 * systems that remain authoritative. It is an INDEX of truth semantics, not a
 * second copy of the data: every node points back at its source record.
 *
 * All queries are deterministic and bounded. No AI is consulted to decide
 * supersession, staleness, confidence, historicity or contradiction.
 */

import {
  isCurrentFact,
  isHistoricalFact,
  isSupersededFact,
  isVerifiedFact,
  type EvidenceConflict,
  type EvidenceEdge,
  type EvidenceEntityRef,
  type EvidenceFact,
} from "./evidence-contract";

export interface EvidenceGraph {
  facts: EvidenceFact[];
  edges: EvidenceEdge[];
  conflicts: EvidenceConflict[];
  byId: Map<string, EvidenceFact>;
  builtAt: string;
}

export function entityKey(ref: EvidenceEntityRef): string {
  return `${ref.type}:${ref.id}`;
}

/* ------------------------------------------------------------------ */
/* Supersession                                                        */
/* ------------------------------------------------------------------ */

/**
 * Apply declared supersession links. A fact named by another fact's
 * `supersedes` becomes superseded — history is kept, never deleted.
 */
export function applySupersession(facts: EvidenceFact[]): EvidenceFact[] {
  const supersededBy = new Map<string, string[]>();
  for (const f of facts) {
    for (const oldId of f.supersedes ?? []) {
      supersededBy.set(oldId, [...(supersededBy.get(oldId) ?? []), f.id]);
    }
  }
  return facts.map((f) => {
    const by = Array.from(new Set([...(f.supersededBy ?? []), ...(supersededBy.get(f.id) ?? [])]));
    if (!by.length) return f;
    return { ...f, supersededBy: by, status: "superseded" as const, freshness: "superseded" as const };
  });
}

/* ------------------------------------------------------------------ */
/* Conflict detection                                                  */
/* ------------------------------------------------------------------ */

function overlaps(a: EvidenceFact, b: EvidenceFact): boolean {
  const aFrom = a.validFrom ? Date.parse(a.validFrom) : Number.NEGATIVE_INFINITY;
  const aTo = a.validUntil ? Date.parse(a.validUntil) : Number.POSITIVE_INFINITY;
  const bFrom = b.validFrom ? Date.parse(b.validFrom) : Number.NEGATIVE_INFINITY;
  const bTo = b.validUntil ? Date.parse(b.validUntil) : Number.POSITIVE_INFINITY;
  return aFrom < bTo && bFrom < aTo;
}

/** Predicates whose value is single-valued for a subject; multi-valued ones never conflict. */
const MULTI_VALUED = /(^|\.)(note|resolution|pattern|ticket|similar|activity|evidence)/;

/**
 * Two active facts asserting different values for the same single-valued
 * predicate, on the same subject, over overlapping validity, is a conflict.
 * The system never silently picks a winner.
 */
export function detectConflicts(facts: EvidenceFact[], now = Date.now()): EvidenceConflict[] {
  const groups = new Map<string, EvidenceFact[]>();
  for (const f of facts) {
    if (!isCurrentFact(f, now) && f.status !== "disputed") continue;
    if (MULTI_VALUED.test(f.predicate)) continue;
    if (f.origin === "simulated") continue;
    const key = `${entityKey(f.subject)}|${f.predicate}`;
    groups.set(key, [...(groups.get(key) ?? []), f]);
  }

  const conflicts: EvidenceConflict[] = [];
  for (const [key, group] of groups) {
    if (group.length < 2) continue;
    const distinct = new Set(group.map((f) => String(f.value)));
    if (distinct.size < 2) continue;
    // Only meaningful when at least two competing claims carry weight.
    const weighty = group.filter((f) => f.confidence !== "unknown" || f.origin === "observed");
    if (weighty.length < 2) continue;
    if (!weighty.some((a, i) => weighty.slice(i + 1).some((b) => a.value !== b.value && overlaps(a, b)))) continue;

    const [subjectPart, predicate] = key.split("|");
    const subject = group[0]!.subject;
    const newest = [...weighty].sort(
      (a, b) => Date.parse(b.observedAt ?? b.recordedAt) - Date.parse(a.observedAt ?? a.recordedAt),
    )[0]!;
    const liveWins =
      newest.origin === "observed" && weighty.some((f) => f.id !== newest.id && f.origin === "retrieved");

    conflicts.push({
      id: `conflict:${subjectPart}:${predicate}`,
      subject,
      predicate: predicate ?? "",
      factIds: weighty.map((f) => f.id),
      values: weighty.map((f) => ({
        factId: f.id,
        value: String(f.value),
        origin: f.origin,
        confidence: f.confidence,
        ...(f.observedAt ?? f.recordedAt ? { at: f.observedAt ?? f.recordedAt } : {}),
      })),
      ...(liveWins
        ? {
            interpretation:
              "Live observed state is newer than the stored documentation; documentation may be out of date. Not resolved automatically.",
          }
        : {}),
      status: "unresolved",
      detectedAt: new Date(now).toISOString(),
    });
  }
  return conflicts;
}

/** Mark every fact participating in a conflict as disputed, keeping its content. */
export function markDisputed(facts: EvidenceFact[], conflicts: EvidenceConflict[]): EvidenceFact[] {
  if (!conflicts.length) return facts;
  const ids = new Set(conflicts.flatMap((c) => c.factIds));
  return facts.map((f) => (ids.has(f.id) ? { ...f, status: "disputed" as const } : f));
}

/* ------------------------------------------------------------------ */
/* Build                                                               */
/* ------------------------------------------------------------------ */

export function buildEvidenceGraph(
  facts: EvidenceFact[],
  edges: EvidenceEdge[] = [],
  now = Date.now(),
): EvidenceGraph {
  const withSupersession = applySupersession(facts);
  const conflicts = detectConflicts(withSupersession, now);
  const final = markDisputed(withSupersession, conflicts);
  const supersedeEdges: EvidenceEdge[] = [];
  for (const f of final) {
    for (const oldId of f.supersedes ?? []) {
      const old = final.find((x) => x.id === oldId);
      if (!old) continue;
      supersedeEdges.push({
        id: `edge:supersedes:${f.id}:${oldId}`,
        from: f.subject,
        relation: "supersedes",
        to: old.subject,
        origin: f.origin,
        confidence: f.confidence,
        createdAt: f.recordedAt,
        factId: f.id,
      });
    }
  }
  for (const c of conflicts) {
    for (let i = 0; i < c.factIds.length - 1; i += 1) {
      supersedeEdges.push({
        id: `edge:contradicts:${c.factIds[i]}:${c.factIds[i + 1]}`,
        from: c.subject,
        relation: "contradicts",
        to: c.subject,
        origin: "inferred",
        confidence: "unknown",
        createdAt: c.detectedAt,
        factId: c.factIds[i],
      });
    }
  }
  return {
    facts: final,
    edges: [...edges, ...supersedeEdges],
    conflicts,
    byId: new Map(final.map((f) => [f.id, f])),
    builtAt: new Date(now).toISOString(),
  };
}

/* ------------------------------------------------------------------ */
/* Query API                                                           */
/* ------------------------------------------------------------------ */

export function getEvidenceForEntity(graph: EvidenceGraph, ref: EvidenceEntityRef): EvidenceFact[] {
  const key = entityKey(ref);
  return graph.facts.filter((f) => entityKey(f.subject) === key);
}

export function getCurrentVerifiedFacts(graph: EvidenceGraph, now = Date.now()): EvidenceFact[] {
  return graph.facts.filter((f) => isCurrentFact(f, now) && isVerifiedFact(f));
}

export function getConflictingEvidence(graph: EvidenceGraph): EvidenceFact[] {
  const ids = new Set(graph.conflicts.flatMap((c) => c.factIds));
  return graph.facts.filter((f) => ids.has(f.id));
}

export function getHistoricalEvidence(graph: EvidenceGraph): EvidenceFact[] {
  return graph.facts.filter((f) => isHistoricalFact(f));
}

export function getSupersededEvidence(graph: EvidenceGraph): EvidenceFact[] {
  return graph.facts.filter((f) => isSupersededFact(f));
}

/** Facts linked to the subject through supporting relationships. */
export function getSupportingEvidence(graph: EvidenceGraph, ref: EvidenceEntityRef): EvidenceFact[] {
  const key = entityKey(ref);
  const related = new Set<string>();
  for (const e of graph.edges) {
    if (entityKey(e.from) === key) related.add(entityKey(e.to));
    if (entityKey(e.to) === key) related.add(entityKey(e.from));
  }
  return graph.facts.filter((f) => related.has(entityKey(f.subject)) && entityKey(f.subject) !== key);
}

export interface EvidenceTimelineEntry {
  at: string;
  factId: string;
  label: string;
  origin: EvidenceFact["origin"];
  confidence: EvidenceFact["confidence"];
  status: EvidenceFact["status"];
}

/** Compact truth-evolution timeline for one entity (admin/debug surface). */
export function getEvidenceTimeline(
  graph: EvidenceGraph,
  ref: EvidenceEntityRef,
  limit = 20,
): EvidenceTimelineEntry[] {
  return getEvidenceForEntity(graph, ref)
    .map((f) => ({
      at: f.observedAt ?? f.validFrom ?? f.recordedAt,
      factId: f.id,
      label: `${f.predicate}: ${String(f.value)}`,
      origin: f.origin,
      confidence: f.confidence,
      status: f.status,
    }))
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
    .slice(0, limit);
}

export const EMPTY_GRAPH: EvidenceGraph = {
  facts: [],
  edges: [],
  conflicts: [],
  byId: new Map(),
  builtAt: new Date(0).toISOString(),
};
