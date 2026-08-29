/**
 * Phase 8 — hypothesis/evidence graph projection (Part 21).
 *
 * This is a PROJECTION over the canonical Evidence Graph vocabulary, not a
 * second graph store. Nodes point back at the investigation record; edges reuse
 * `EvidenceRelation` where the meaning matches and add only the relations
 * Phase 8 genuinely introduces (predicts / discriminates / strengthens /
 * weakens), all derived on read.
 */

import type { EvidenceEntityRef, EvidenceRelation } from "@/lib/core/evidence-contract";
import type { Investigation } from "./hypothesis-contract";

export type HypothesisRelation =
  | EvidenceRelation
  | "explained_by"
  | "predicts"
  | "discriminates"
  | "strengthens"
  | "weakens";

export type HypothesisNodeKind = "observation" | "hypothesis" | "evidence" | "test" | "result";

export interface HypothesisGraphNode {
  id: string;
  kind: HypothesisNodeKind;
  label: string;
  /** Canonical references back to the systems that own the underlying data. */
  refs: EvidenceEntityRef[];
}

export interface HypothesisGraphEdge {
  id: string;
  from: string;
  relation: HypothesisRelation;
  to: string;
}

export interface HypothesisGraph {
  nodes: HypothesisGraphNode[];
  edges: HypothesisGraphEdge[];
}

export function buildHypothesisGraph(inv: Investigation): HypothesisGraph {
  const nodes: HypothesisGraphNode[] = [];
  const edges: HypothesisGraphEdge[] = [];
  const push = (n: HypothesisGraphNode) => {
    if (!nodes.some((x) => x.id === n.id)) nodes.push(n);
  };
  const link = (from: string, relation: HypothesisRelation, to: string) => {
    const id = `${from}|${relation}|${to}`;
    if (!edges.some((e) => e.id === id)) edges.push({ id, from, relation, to });
  };

  for (const o of inv.observations) {
    push({ id: o.id, kind: "observation", label: o.statement, refs: o.refs });
  }

  for (const h of inv.hypotheses) {
    push({ id: h.id, kind: "hypothesis", label: h.title, refs: [] });
    for (const oid of h.explains) if (inv.observations.some((o) => o.id === oid)) link(oid, "explained_by", h.id);
    for (const p of h.predictions) {
      push({ id: p.id, kind: "observation", label: p.statement, refs: [] });
      link(h.id, "predicts", p.id);
    }
  }

  for (const e of inv.evidence) {
    push({ id: e.id, kind: "evidence", label: e.statement, refs: e.refs });
    link(e.id, e.stance === "contradicts" ? "contradicts" : "supports", e.hypothesisId);
  }

  for (const t of inv.tests) {
    push({ id: t.id, kind: "test", label: t.title, refs: [] });
    for (const hid of t.hypothesisIds) link(t.id, "discriminates", hid);
    if (t.result) {
      const rid = `${t.id}:result`;
      push({ id: rid, kind: "result", label: `Outcome: ${t.result.outcomeKey}`, refs: [] });
      link(t.id, "references", rid);
      const branch = t.outcomes.find((o) => o.key === t.result?.outcomeKey);
      for (const hid of branch?.strengthens ?? []) link(rid, "strengthens", hid);
      for (const hid of branch?.weakens ?? []) link(rid, "weakens", hid);
    }
  }

  return { nodes, edges };
}
