/**
 * Intelligence Core — Phase 12: memory retrieval.
 *
 * Deterministic, bounded lookup of prior experience relevant to what the
 * operator is doing now. Memory is retrieved as EXPERIENCE, never promoted to
 * current truth: scoring only decides ordering, never trust.
 */

import { isRetrievableMemory, type OperationalMemory } from "./memory-contract";
import { allMemories } from "./memory-store";

export interface MemoryQuery {
  accountNumber?: string;
  ticketId?: string;
  workItemId?: string;
  dispatchId?: string;
  /** Free text (route label, ticket subject fragment) — matched on tokens. */
  topic?: string;
  limit?: number;
  includeCandidates?: boolean;
  now?: number;
}

export interface ScoredMemory {
  memory: OperationalMemory;
  score: number;
  reasons: string[];
}

const DAY = 86_400_000;

function tokens(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 3);
}

/** Recency decays over ~60 days; experience never expires outright. */
function recencyScore(at: string, now: number): number {
  const t = Date.parse(at);
  if (!Number.isFinite(t)) return 0;
  const days = Math.max(0, (now - t) / DAY);
  return Math.max(0, 1 - days / 60);
}

export function scoreMemories(query: MemoryQuery, pool = allMemories()): ScoredMemory[] {
  const now = query.now ?? Date.now();
  const topicTokens = query.topic ? tokens(query.topic) : [];
  const out: ScoredMemory[] = [];

  for (const memory of pool) {
    if (!isRetrievableMemory(memory)) continue;
    if (!query.includeCandidates && memory.status === "candidate") continue;

    let score = 0;
    const reasons: string[] = [];
    const s = memory.scope;

    if (query.ticketId && s.ticketId === query.ticketId) {
      score += 1;
      reasons.push("same ticket");
    }
    if (query.accountNumber && s.accountNumber === query.accountNumber) {
      score += 0.7;
      reasons.push("same account");
    }
    if (query.workItemId && s.workItemId === query.workItemId) {
      score += 0.6;
      reasons.push("same work item");
    }
    if (query.dispatchId && s.dispatchId === query.dispatchId) {
      score += 0.6;
      reasons.push("same dispatch");
    }
    if (topicTokens.length) {
      const hay = `${memory.title} ${memory.summary} ${memory.tags.join(" ")}`.toLowerCase();
      const hits = topicTokens.filter((t) => hay.includes(t)).length;
      if (hits) {
        score += Math.min(0.5, hits * 0.15);
        reasons.push(`topic match (${hits})`);
      }
    }
    if (memory.status === "promoted") {
      score += 0.3;
      reasons.push("operator promoted");
    }

    if (score <= 0) continue;
    score += memory.importance * 0.3 + recencyScore(memory.occurredAt, now) * 0.3;
    out.push({ memory, score: Math.round(score * 100) / 100, reasons });
  }

  return out.sort((a, b) => b.score - a.score).slice(0, query.limit ?? 5);
}

/** Convenience wrapper used by the Context Orchestrator. */
export function findRelevantMemories(query: MemoryQuery): ScoredMemory[] {
  try {
    return scoreMemories(query);
  } catch {
    return [];
  }
}