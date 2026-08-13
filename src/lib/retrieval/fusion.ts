/**
 * Deterministic fusion + domain re-ranking.
 *
 * Stage 1 (candidates) happens in SQL. Stage 2 is this file: pure, ordered
 * and explainable. Given the same candidates the output order is always the
 * same, and every result carries the reasons it ranked where it did.
 */
import type {
  LexicalCandidate,
  MatchSignal,
  RetrievalCandidate,
  RetrievalResult,
  SemanticCandidate,
} from "./retrieval-types";
import type { ResolutionConfidence } from "@/lib/resolution/resolution-types";

/** Standard RRF damping constant. */
export const RRF_K = 60;
const UNIT = 1 / (RRF_K + 1);

const BOOST = {
  exact: 50 * UNIT,
  account: 0.75 * UNIT,
  verified: 0.5 * UNIT,
  probable: 0.2 * UNIT,
  resolution: 0.3 * UNIT,
  runbook: 0.1 * UNIT,
  active: 0.15 * UNIT,
  superseded: -0.5 * UNIT,
  archived: -0.75 * UNIT,
  /** Recency is a tiebreaker, never a substitute for verified evidence. */
  recencyMax: 0.25 * UNIT,
} as const;

const RECENCY_WINDOW_MS = 180 * 24 * 60 * 60 * 1000;

/** Resolution Memory statuses that mean "no longer current guidance". */
export const HISTORICAL_RESOLUTION_STATUSES = ["superseded", "archived"] as const;

/**
 * Historical semantics are source-specific. Only Resolution Memories carry
 * superseded/archived lifecycle status; other source types keep their own
 * status meanings untouched.
 */
export function isHistoricalCandidate(c: {
  sourceType: string;
  sourceStatus: string;
}): boolean {
  return (
    c.sourceType === "resolution" &&
    (HISTORICAL_RESOLUTION_STATUSES as readonly string[]).includes(c.sourceStatus)
  );
}

export interface QueryIdentifiers {
  ticketNumbers: string[];
  accountNumbers: string[];
  ids: string[];
  all: string[];
}

/**
 * Exact identifiers short-circuit ranking: if the operator typed a ticket
 * number or an account number, matches on it always come first.
 */
export function parseIdentifiers(query: string): QueryIdentifiers {
  const q = query.trim();
  const ticketNumbers = Array.from(q.matchAll(/#\s*(\d{3,10})\b/g)).map((m) => m[1]!);
  const bareNumbers = Array.from(q.matchAll(/\b(\d{4,10})\b/g)).map((m) => m[1]!);
  const accountNumbers = Array.from(q.matchAll(/\b(?:acct|account)\s*#?\s*(\w{2,20})\b/gi)).map(
    (m) => m[1]!,
  );
  const ids = Array.from(
    q.matchAll(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi),
  ).map((m) => m[0]!);
  const all = Array.from(
    new Set([...ticketNumbers, ...accountNumbers, ...ids, ...bareNumbers].map((s) => s.toLowerCase())),
  );
  return { ticketNumbers, accountNumbers, ids, all };
}

function keyOf(c: { sourceType: string; sourceId: string; chunkId: string }): string {
  return `${c.sourceType}:${c.sourceId}:${c.chunkId}`;
}

function isExactMatch(c: RetrievalCandidate, identifiers: QueryIdentifiers): boolean {
  if (identifiers.all.length === 0) return false;
  const hay = [c.sourceId, c.accountNumber].map((s) => (s ?? "").toLowerCase());
  return identifiers.all.some((id) => hay.includes(id));
}

function recencyBoost(updatedAt: string | undefined, now: number): number {
  if (!updatedAt) return 0;
  const t = Date.parse(updatedAt);
  if (Number.isNaN(t)) return 0;
  const age = Math.max(0, now - t);
  if (age >= RECENCY_WINDOW_MS) return 0;
  return BOOST.recencyMax * (1 - age / RECENCY_WINDOW_MS);
}

function snippetOf(text: string, max = 220): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max)}\u2026` : clean;
}

export interface FuseOptions {
  identifiers: QueryIdentifiers;
  accountNumber?: string;
  limit: number;
  /**
   * Defense-in-depth mirror of the SQL filter: superseded/archived Resolution
   * Memories are dropped entirely unless historical search was requested.
   */
  includeHistorical?: boolean;
  /** Injected for deterministic tests. */
  now?: number;
}

/**
 * Reciprocal Rank Fusion over the two candidate lists, then domain boosts.
 * Ties break on source type, then id, so ordering is fully deterministic.
 */
export function fuseCandidates(
  lexical: LexicalCandidate[],
  semantic: SemanticCandidate[],
  opts: FuseOptions,
): RetrievalResult[] {
  const now = opts.now ?? Date.now();
  const retrievedAt = new Date(now).toISOString();
  const byKey = new Map<
    string,
    { candidate: RetrievalCandidate; lexicalRank?: number; semanticRank?: number }
  >();

  lexical
    .slice()
    .sort((a, b) => b.lexicalScore - a.lexicalScore || keyOf(a).localeCompare(keyOf(b)))
    .forEach((c, i) => {
      byKey.set(keyOf(c), { candidate: c, lexicalRank: i + 1 });
    });

  semantic
    .slice()
    .sort((a, b) => a.distance - b.distance || keyOf(a).localeCompare(keyOf(b)))
    .forEach((c, i) => {
      const existing = byKey.get(keyOf(c));
      if (existing) existing.semanticRank = i + 1;
      else byKey.set(keyOf(c), { candidate: c, semanticRank: i + 1 });
    });

  const results: RetrievalResult[] = [];
  for (const entry of byKey.values()) {
    const c = entry.candidate;
    const historical = isHistoricalCandidate(c);
    if (historical && !opts.includeHistorical) continue;
    const matchedBy: MatchSignal[] = [];
    let fusionScore = 0;
    if (entry.lexicalRank !== undefined) {
      fusionScore += 1 / (RRF_K + entry.lexicalRank);
      matchedBy.push("lexical");
    }
    if (entry.semanticRank !== undefined) {
      fusionScore += 1 / (RRF_K + entry.semanticRank);
      matchedBy.push("semantic");
    }

    let finalScore = fusionScore;
    if (isExactMatch(c, opts.identifiers)) {
      finalScore += BOOST.exact;
      matchedBy.unshift("exact");
    }
    if (opts.accountNumber && c.accountNumber && c.accountNumber === opts.accountNumber) {
      finalScore += BOOST.account;
      matchedBy.push("account");
    }
    if (c.confidence === "verified") {
      finalScore += BOOST.verified;
      matchedBy.push("confidence");
    } else if (c.confidence === "probable") {
      finalScore += BOOST.probable;
      matchedBy.push("confidence");
    }
    if (c.sourceType === "resolution") {
      finalScore += BOOST.resolution;
      matchedBy.push("source");
    } else if (c.sourceType === "runbook") {
      finalScore += BOOST.runbook;
      matchedBy.push("source");
    }
    if (c.sourceStatus === "superseded") {
      finalScore += BOOST.superseded;
      matchedBy.push("historical");
    } else if (c.sourceStatus === "archived") {
      finalScore += BOOST.archived;
      matchedBy.push("historical");
    } else if (c.sourceStatus) {
      finalScore += BOOST.active;
    }
    const rec = recencyBoost(c.sourceUpdatedAt, now);
    if (rec > 0) {
      finalScore += rec;
      matchedBy.push("recency");
    }

    results.push({
      sourceType: c.sourceType,
      sourceId: c.sourceId,
      ...(c.chunkId ? { chunkId: c.chunkId } : {}),
      ...(c.accountNumber ? { accountNumber: c.accountNumber } : {}),
      title: c.title,
      snippet: snippetOf(c.text),
      matchedBy,
      ...(entry.lexicalRank !== undefined ? { lexicalRank: entry.lexicalRank } : {}),
      ...(entry.semanticRank !== undefined ? { semanticRank: entry.semanticRank } : {}),
      fusionScore,
      finalScore,
      ...(c.confidence ? { confidence: c.confidence as ResolutionConfidence } : {}),
      ...(c.sourceStatus ? { sourceStatus: c.sourceStatus } : {}),
      ...(historical ? { historical: true } : {}),
      ...(c.sourceUpdatedAt ? { sourceUpdatedAt: c.sourceUpdatedAt } : {}),
      provenance: {
        source: c.sourceType,
        sourceId: c.sourceId,
        ...(c.chunkId ? { chunkId: c.chunkId } : {}),
        retrievedAt,
      },
    });
  }

  return results
    .sort(
      (a, b) =>
        b.finalScore - a.finalScore ||
        a.sourceType.localeCompare(b.sourceType) ||
        a.sourceId.localeCompare(b.sourceId) ||
        (a.chunkId ?? "").localeCompare(b.chunkId ?? ""),
    )
    .slice(0, opts.limit);
}
