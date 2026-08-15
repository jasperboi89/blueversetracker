import type { ContextEvidence, PortalContextEnvelope } from "./portal-context";
import { isBackwardLooking } from "./context-reality";

/**
 * Deterministic context prioritisation (Phase 10 §14).
 *
 * When context must be trimmed, the order is fixed and testable — nothing
 * historical or low-confidence may silently outrank live verified information.
 */

const SOURCE_RANK: Record<ContextEvidence["sourceType"], number> = {
  freshdesk_ticket: 0, // active entity metadata
  resolution: 1,
  account_context: 2,
  change_record: 3,
  runbook: 4,
  knowledge: 5,
  similar_work: 6,
};

const CONFIDENCE_RANK: Record<string, number> = { verified: 0, probable: 1, unknown: 2 };

const ORIGIN_RANK: Record<string, number> = {
  operator_confirmed: 0,
  observed: 1,
  retrieved: 2,
  inferred: 3,
  generated: 4,
  uncertain: 5,
};

const FRESHNESS_RANK: Record<string, number> = {
  current: 0,
  recent: 1,
  stale: 2,
  historical: 3,
  superseded: 4,
};

/** Lower score = keep first. */
export function evidenceScore(e: ContextEvidence, activeEntityIds: string[] = []): number {
  const active = activeEntityIds.includes(e.sourceId) ? 0 : 1;
  const backward = isBackwardLooking(e.freshness ?? "current") ? 1 : 0;
  const confidence = CONFIDENCE_RANK[e.confidence ?? "unknown"] ?? 2;
  const origin = ORIGIN_RANK[e.origin] ?? 5;
  const freshness = FRESHNESS_RANK[e.freshness ?? "stale"] ?? 2;
  const relevance = 1 - Math.max(0, Math.min(1, e.relevance ?? 0));
  return (
    active * 10_000 +
    backward * 5_000 +
    confidence * 500 +
    origin * 100 +
    freshness * 20 +
    SOURCE_RANK[e.sourceType] * 4 +
    relevance * 3
  );
}

/** Stable priority sort: active entity → confirmed/verified → fresh → source. */
export function prioritizeEvidence(
  evidence: ContextEvidence[],
  activeEntityIds: string[] = [],
): ContextEvidence[] {
  return evidence
    .map((e, i) => ({ e, i, s: evidenceScore(e, activeEntityIds) }))
    .sort((a, b) => a.s - b.s || a.i - b.i)
    .map((x) => x.e);
}

export function activeEntityIds(env: PortalContextEnvelope): string[] {
  const { ticket, account, workItem, dispatch, knowledgeNote } = env.active;
  return [ticket?.id, account?.id, workItem?.id, dispatch?.id, knowledgeNote?.id].filter(
    (v): v is string => Boolean(v),
  );
}

/** Apply an evidence-count budget, keeping the highest-priority items. */
export function trimEvidence(
  evidence: ContextEvidence[],
  maxItems: number,
  ids: string[] = [],
): { kept: ContextEvidence[]; dropped: number } {
  const ordered = prioritizeEvidence(evidence, ids);
  const kept = maxItems <= 0 ? [] : ordered.slice(0, maxItems);
  return { kept, dropped: ordered.length - kept.length };
}
