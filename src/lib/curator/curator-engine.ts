/**
 * Intelligence Core — Phase 13: Curator engine.
 *
 * Pure and deterministic. Given Operational Memory (Phase 12) it clusters
 * equivalent lessons, accumulates support, measures recurrence, applies the
 * contradiction gate and moves candidates through their lifecycle.
 *
 * Nothing here calls a model, mutates a store, or publishes anything.
 */

import { containsSensitive } from "@/lib/core/reality-boundary";
import type { EvidenceConflict, EvidenceEntityRef } from "@/lib/core/evidence-contract";
import type { OperationalMemory } from "@/lib/memory/memory-contract";
import {
  confidenceFromSupport,
  emptySupport,
  hasCriticalConflict,
  type CandidateLifecycle,
  type CandidateSupport,
  type CuratedCandidateType,
  type CuratedMemoryCandidate,
  type SupportEntry,
} from "./curator-contract";

export const CURATOR_VERSION = "memory-curator@1";

/* ------------------------------------------------------------------ */
/* Normalization + fingerprinting                                      */
/* ------------------------------------------------------------------ */

const STOPWORDS = new Set([
  "the", "and", "for", "with", "this", "that", "from", "into", "were", "was", "have", "has",
  "then", "than", "when", "after", "before", "only", "also", "been", "being", "will", "would",
  "should", "could", "must", "there", "their", "they", "them", "your", "about", "which",
  "check", "checked", "verify", "verified", "verifying", "confirm", "confirmed",
]);

/** Crude but deterministic singularization so "mappings" ≡ "mapping". */
function stem(token: string): string {
  if (token.length > 4 && token.endsWith("ies")) return `${token.slice(0, -3)}y`;
  if (token.length > 4 && token.endsWith("ing")) return token.slice(0, -3);
  if (token.length > 4 && token.endsWith("ed")) return token.slice(0, -2);
  if (token.length > 3 && token.endsWith("s")) return token.slice(0, -1);
  return token;
}

export function normalizeTopic(text: string): string {
  const tokens = text
    .toLowerCase()
    .replace(/<[^>]*>/g, " ")
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 2 && !STOPWORDS.has(t))
    .map(stem);
  return Array.from(new Set(tokens)).sort().slice(0, 8).join("-");
}

export function topicTokens(text: string): Set<string> {
  const n = normalizeTopic(text);
  return new Set(n ? n.split("-") : []);
}

export function jaccard(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let hits = 0;
  for (const t of a) if (b.has(t)) hits += 1;
  return hits / (a.size + b.size - hits);
}

const CLASS_TO_TYPE: Record<string, CuratedCandidateType> = {
  semantic_candidate: "semantic",
  procedural_candidate: "procedural",
  reflection_candidate: "reflection",
  relational: "recurring_pattern",
  episodic: "recurring_pattern",
};

export function candidateTypeFor(memory: OperationalMemory): CuratedCandidateType {
  return CLASS_TO_TYPE[memory.class] ?? "recurring_pattern";
}

/**
 * Candidate fingerprint. Deliberately excludes the ticket and the shift so
 * the same lesson learned on three tickets collapses into ONE candidate, but
 * includes the destination class and the affected area so genuinely different
 * lessons stay apart.
 */
export function candidateFingerprint(input: {
  type: CuratedCandidateType;
  topic: string;
  area?: string;
}): string {
  return [input.type, (input.area ?? "").toLowerCase().trim(), normalizeTopic(input.topic)]
    .filter(Boolean)
    .join("|");
}

/* ------------------------------------------------------------------ */
/* Support accumulation                                                */
/* ------------------------------------------------------------------ */

const DAY = 86_400_000;

export function recomputeSupport(
  entries: SupportEntry[],
  memories: OperationalMemory[],
  conflicts: EvidenceConflict[],
): CandidateSupport {
  const support = emptySupport();
  const accounts = new Set<string>();
  const tickets = new Set<string>();
  const memoryIds = new Set<string>();

  for (const e of entries) {
    memoryIds.add(e.memoryId);
    if (e.accountNumber) accounts.add(e.accountNumber);
    if (e.ticketId) tickets.add(e.ticketId);
    if (e.supportType === "episode") support.episodeCount += 1;
    if (e.confidence === "verified") support.verifiedEvidenceCount += 1;
    else if (e.confidence === "probable") support.probableEvidenceCount += 1;
    if (!support.firstObservedAt || e.at < support.firstObservedAt) support.firstObservedAt = e.at;
    if (!support.lastObservedAt || e.at > support.lastObservedAt) support.lastObservedAt = e.at;
  }

  support.memoryCount = memoryIds.size;
  support.accountCount = accounts.size;
  support.ticketCount = tickets.size;
  support.conflictingEvidenceCount = conflicts.filter((c) => c.status === "unresolved").length;

  // Recurrence blends repetition with breadth so raw frequency alone cannot
  // dominate; it is capped and never feeds confidence directly.
  const spreadBonus = Math.min(0.3, Math.max(0, accounts.size - 1) * 0.15);
  const ticketBonus = Math.min(0.2, Math.max(0, tickets.size - 1) * 0.07);
  support.recurrenceScore =
    Math.round(Math.min(1, support.episodeCount * 0.18 + spreadBonus + ticketBonus) * 100) / 100;

  const importances = memories.map((m) => m.importance).filter((n) => Number.isFinite(n));
  support.importanceScore = importances.length
    ? Math.round((importances.reduce((a, b) => a + b, 0) / importances.length) * 100) / 100
    : 0;

  return support;
}

/* ------------------------------------------------------------------ */
/* Recurrence                                                          */
/* ------------------------------------------------------------------ */

export const RECURRENCE_WINDOW_DAYS = 30;
export const RECURRENCE_MIN_EPISODES = 3;

/** Recurrence is an attention signal. It is NEVER a verification signal. */
export function isRecurring(c: CuratedMemoryCandidate, now = Date.now()): boolean {
  const recent = c.supportLog.filter(
    (e) => now - Date.parse(e.at) <= RECURRENCE_WINDOW_DAYS * DAY && e.supportType === "episode",
  );
  if (recent.length >= RECURRENCE_MIN_EPISODES) return true;
  const accounts = new Set(recent.map((e) => e.accountNumber).filter(Boolean));
  return recent.length >= 2 && accounts.size >= 2;
}

export function isCrossAccount(c: CuratedMemoryCandidate): boolean {
  return c.support.accountCount >= 2;
}

/* ------------------------------------------------------------------ */
/* Lifecycle                                                           */
/* ------------------------------------------------------------------ */

export const DORMANT_AFTER_DAYS = 45;

/**
 * Deterministic lifecycle evaluation. Movement is bidirectional: a new
 * conflict pulls a review-ready candidate back to `blocked`, and a candidate
 * that stops being observed goes dormant instead of cluttering the queue.
 */
export function evaluateLifecycle(
  c: CuratedMemoryCandidate,
  now = Date.now(),
): { lifecycle: CandidateLifecycle; blockReason?: CuratedMemoryCandidate["blockReason"] } {
  // Terminal / operator-owned states are never auto-changed.
  if (["promoted", "dismissed", "archived", "merged", "superseded", "under_review"].includes(c.lifecycle)) {
    return { lifecycle: c.lifecycle };
  }

  if (hasCriticalConflict(c)) return { lifecycle: "blocked", blockReason: "conflicting_evidence" };
  if (containsSensitive(`${c.title} ${c.proposedStatement}`)) {
    return { lifecycle: "blocked", blockReason: "sensitive_content" };
  }
  if (!c.sourceMemoryIds.length) return { lifecycle: "blocked", blockReason: "no_provenance" };

  const last = c.support.lastObservedAt ? Date.parse(c.support.lastObservedAt) : Date.parse(c.createdAt);
  if (Number.isFinite(last) && now - last > DORMANT_AFTER_DAYS * DAY && c.support.episodeCount < 2) {
    return { lifecycle: "dormant" };
  }

  const recurring = isRecurring(c, now);
  if (recurring && c.support.verifiedEvidenceCount >= 1) return { lifecycle: "review_ready" };
  if (c.support.episodeCount >= 2 && c.support.verifiedEvidenceCount >= 2) {
    return { lifecycle: "review_ready" };
  }
  if (recurring) return { lifecycle: "recurring" };
  if (c.support.memoryCount >= 2) return { lifecycle: "supported" };
  return { lifecycle: "new" };
}

/* ------------------------------------------------------------------ */
/* Candidate assembly from memory                                      */
/* ------------------------------------------------------------------ */

function entitiesFor(memory: OperationalMemory): EvidenceEntityRef[] {
  const out: EvidenceEntityRef[] = [];
  if (memory.scope.accountNumber) out.push({ type: "account", id: memory.scope.accountNumber });
  if (memory.scope.ticketId) out.push({ type: "ticket", id: memory.scope.ticketId });
  return out;
}

function mergeEntities(a: EvidenceEntityRef[], b: EvidenceEntityRef[]): EvidenceEntityRef[] {
  const seen = new Map<string, EvidenceEntityRef>();
  for (const e of [...a, ...b]) seen.set(`${e.type}:${e.id}`, e);
  return [...seen.values()].slice(0, 24);
}

export interface CurationInput {
  memories: OperationalMemory[];
  existing: CuratedMemoryCandidate[];
  now?: number;
}

export interface CurationOutcome {
  candidates: CuratedMemoryCandidate[];
  created: string[];
  strengthened: string[];
  revived: string[];
}

/**
 * Fold memories into candidates. Equivalent lessons cluster by fingerprint;
 * near-equivalent ones cluster by deterministic token overlap before any AI
 * is considered. Original memories are never mutated.
 */
type Mutable<T> = { -readonly [K in keyof T]: T[K] };

export function curateMemories(input: CurationInput): CurationOutcome {
  const now = input.now ?? Date.now();
  const at = new Date(now).toISOString();
  const byId = new Map(input.existing.map((c) => [c.id, { ...c }] as const));
  const created: string[] = [];
  const strengthened: string[] = [];
  const revived: string[] = [];
  const memoryById = new Map(input.memories.map((m) => [m.id, m] as const));

  for (const memory of input.memories) {
    // Episodes are experience; only proposals become curated candidates.
    if (memory.class === "episodic" || memory.class === "relational") continue;
    if (memory.status === "rejected") continue;
    const statement = memory.summary.slice(0, 400);
    if (containsSensitive(`${memory.title} ${statement}`)) continue;

    const type = candidateTypeFor(memory);
    const fingerprint = candidateFingerprint({
      type,
      topic: `${memory.title} ${statement}`,
      ...(memory.scope.accountNumber && type === "semantic"
        ? { area: memory.scope.accountNumber }
        : {}),
    });

    let target = [...byId.values()].find((c) => c.fingerprint === fingerprint);
    if (!target) {
      // Deterministic near-match: same type + strong token overlap.
      const tokens = topicTokens(`${memory.title} ${statement}`);
      target = [...byId.values()].find(
        (c) =>
          c.type === type &&
          c.lifecycle !== "merged" &&
          jaccard(tokens, topicTokens(`${c.title} ${c.proposedStatement}`)) >= 0.6,
      );
    }

    const entry: SupportEntry = {
      memoryId: memory.id,
      at: memory.occurredAt,
      supportType: memory.episode ? "episode" : "candidate",
      confidence: memory.status === "promoted" ? "verified" : memory.confidence,
      ...(memory.scope.accountNumber ? { accountNumber: memory.scope.accountNumber } : {}),
      ...(memory.scope.ticketId ? { ticketId: memory.scope.ticketId } : {}),
    };

    if (!target) {
      const id = `cand_${hash(fingerprint)}`;
      const candidate: Mutable<CuratedMemoryCandidate> = {
        id,
        type,
        title: memory.title.slice(0, 140),
        proposedStatement: statement,
        fingerprint,
        sourceMemoryIds: [memory.id],
        supportLog: [entry],
        evidenceRefs: memory.evidence.map((e) => `${e.sourceType}:${e.sourceId ?? ""}`),
        relatedEntities: entitiesFor(memory),
        support: emptySupport(),
        conflicts: [],
        reality: { origin: "inferred", confidence: "unknown" },
        lifecycle: "new",
        createdAt: at,
        updatedAt: at,
      };
      candidate.support = recomputeSupport(candidate.supportLog, [memory], []);
      candidate.reality.confidence = confidenceFromSupport(candidate.support);
      const next = evaluateLifecycle(candidate, now);
      candidate.lifecycle = next.lifecycle;
      if (next.blockReason) candidate.blockReason = next.blockReason;
      byId.set(id, candidate);
      created.push(id);
      continue;
    }

    // Strengthen — support is appended, never rewritten.
    if (target.supportLog.some((e) => e.memoryId === memory.id)) continue;
    const wasDormant = target.lifecycle === "dormant" || target.lifecycle === "archived";
    target.supportLog = [...target.supportLog, entry].slice(-200);
    target.sourceMemoryIds = Array.from(new Set([...target.sourceMemoryIds, memory.id])).slice(-200);
    target.relatedEntities = mergeEntities(target.relatedEntities, entitiesFor(memory));
    target.evidenceRefs = Array.from(
      new Set([...target.evidenceRefs, ...memory.evidence.map((e) => `${e.sourceType}:${e.sourceId ?? ""}`)]),
    ).slice(0, 40);
    const supportingMemories = target.sourceMemoryIds
      .map((id) => memoryById.get(id))
      .filter((m): m is OperationalMemory => Boolean(m));
    target.support = recomputeSupport(target.supportLog, supportingMemories, target.conflicts);
    target.reality.confidence = confidenceFromSupport(target.support);
    if (wasDormant) {
      // Revival, not a duplicate candidate.
      target.lifecycle = "supported";
      revived.push(target.id);
    }
    const next = evaluateLifecycle(target, now);
    target.lifecycle = next.lifecycle;
    if (next.blockReason) target.blockReason = next.blockReason;
    else delete target.blockReason;
    target.updatedAt = at;
    strengthened.push(target.id);
    byId.set(target.id, target);
  }

  return { candidates: [...byId.values()], created, strengthened, revived };
}

/* ------------------------------------------------------------------ */
/* Conflict gate                                                       */
/* ------------------------------------------------------------------ */

/**
 * Apply Phase 11 conflicts to a candidate. A candidate touched by an
 * unresolved conflict is blocked from being presented as clean guidance — it
 * remains reviewable, and it is never deleted.
 */
export function applyConflicts(
  c: CuratedMemoryCandidate,
  conflicts: EvidenceConflict[],
  now = Date.now(),
): CuratedMemoryCandidate {
  const keys = new Set(c.relatedEntities.map((e) => `${e.type}:${e.id}`));
  const relevant = conflicts.filter((x) => keys.has(`${x.subject.type}:${x.subject.id}`));
  const next: CuratedMemoryCandidate = { ...c, conflicts: relevant };
  next.support = { ...next.support, conflictingEvidenceCount: relevant.filter((x) => x.status === "unresolved").length };
  next.reality = { ...next.reality, confidence: confidenceFromSupport(next.support) };
  const evaluated = evaluateLifecycle(next, now);
  next.lifecycle = evaluated.lifecycle;
  if (evaluated.blockReason) next.blockReason = evaluated.blockReason;
  else delete next.blockReason;
  next.updatedAt = new Date(now).toISOString();
  return next;
}

/* ------------------------------------------------------------------ */
/* Decay (retrieval weight only — never historical truth)              */
/* ------------------------------------------------------------------ */

export interface DecayInput {
  importance: number;
  lastSupportedAt?: string;
  lastRetrievedAt?: string;
  retrievalCount?: number;
  pinned?: boolean;
  unresolved?: boolean;
  linkedToVerifiedKnowledge?: boolean;
}

/**
 * Retrieval weight in 0..1. Low weight means "rank this lower", never
 * "this did not happen". Protected memories keep a floor.
 */
export function retrievalWeight(input: DecayInput, now = Date.now()): number {
  const protectedMemory =
    Boolean(input.pinned) || Boolean(input.unresolved) || Boolean(input.linkedToVerifiedKnowledge);
  const last = input.lastSupportedAt ? Date.parse(input.lastSupportedAt) : NaN;
  const ageDays = Number.isFinite(last) ? Math.max(0, (now - last) / DAY) : 365;
  const decay = Math.max(0, 1 - ageDays / 180);
  const reuse = Math.min(0.25, (input.retrievalCount ?? 0) * 0.05);
  const raw = decay * 0.6 + Math.max(0, Math.min(1, input.importance)) * 0.3 + reuse;
  const floor = protectedMemory ? 0.4 : 0.05;
  return Math.round(Math.max(floor, Math.min(1, raw)) * 100) / 100;
}

function hash(value: string): string {
  let h = 0;
  for (let i = 0; i < value.length; i += 1) h = (h * 31 + value.charCodeAt(i)) | 0;
  return Math.abs(h).toString(36);
}
