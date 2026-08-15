/**
 * Intelligence Core — Phase 13: Memory Curator contract.
 *
 * The Curator sits BETWEEN Operational Memory (Phase 12) and the authoritative
 * knowledge destinations (Knowledge Vault, Resolution Memory). It organizes,
 * scores, compares and PROPOSES. It never publishes.
 *
 * Hard semantics preserved from Phase 11/12:
 *   - support is not verification
 *   - recurrence is not causation
 *   - operator confirmation of an EPISODE is not approval of a PROCEDURE
 *   - generated wording stays `generated` until an operator reviews it
 */

import type {
  EvidenceConfidence,
  EvidenceConflict,
  EvidenceEntityRef,
  EvidenceOrigin,
  EvidenceStatus,
} from "@/lib/core/evidence-contract";

/* ------------------------------------------------------------------ */
/* Candidate taxonomy                                                  */
/* ------------------------------------------------------------------ */

export const CURATED_CANDIDATE_TYPES = [
  "semantic",
  "procedural",
  "knowledge_update",
  "resolution_candidate",
  "recurring_pattern",
  "reflection",
] as const;
export type CuratedCandidateType = (typeof CURATED_CANDIDATE_TYPES)[number];

/**
 * Lifecycle. Movement is NOT one-way: new conflicting evidence can pull a
 * candidate back from REVIEW_READY to BLOCKED or UNDER_REVIEW.
 */
export const CANDIDATE_LIFECYCLES = [
  "new",
  "supported",
  "recurring",
  "review_ready",
  "under_review",
  "promoted",
  "blocked",
  "dismissed",
  "dormant",
  "archived",
  "superseded",
  "merged",
] as const;
export type CandidateLifecycle = (typeof CANDIDATE_LIFECYCLES)[number];

export const OPEN_LIFECYCLES: CandidateLifecycle[] = [
  "new",
  "supported",
  "recurring",
  "review_ready",
  "under_review",
  "blocked",
];

export const PROMOTION_DESTINATIONS = [
  "knowledge_vault",
  "resolution_memory",
  "operational_memory",
  "improvement",
] as const;
export type PromotionDestination = (typeof PROMOTION_DESTINATIONS)[number];

export const PROMOTION_OPERATIONS = [
  "create",
  "update",
  "merge",
  "supersede",
  "reinforce",
  "keep_as_memory",
] as const;
export type PromotionOperation = (typeof PROMOTION_OPERATIONS)[number];

export type PromotionRisk = "low" | "medium" | "high" | "blocked";

export type BlockReason =
  | "conflicting_evidence"
  | "insufficient_support"
  | "sensitive_content"
  | "no_provenance"
  | "unsafe_destination";

/* ------------------------------------------------------------------ */
/* Support                                                             */
/* ------------------------------------------------------------------ */

/**
 * Structured support metadata. Every field answers "how much have we seen
 * this?" — none of them answers "is it true?".
 */
export interface CandidateSupport {
  memoryCount: number;
  episodeCount: number;
  accountCount: number;
  ticketCount: number;
  firstObservedAt?: string;
  lastObservedAt?: string;
  verifiedEvidenceCount: number;
  probableEvidenceCount: number;
  conflictingEvidenceCount: number;
  /** 0..1 — how repeatedly and how widely this has been observed. */
  recurrenceScore: number;
  /** 0..1 — how operationally consequential the supporting work was. */
  importanceScore: number;
}

export function emptySupport(): CandidateSupport {
  return {
    memoryCount: 0,
    episodeCount: 0,
    accountCount: 0,
    ticketCount: 0,
    verifiedEvidenceCount: 0,
    probableEvidenceCount: 0,
    conflictingEvidenceCount: 0,
    recurrenceScore: 0,
    importanceScore: 0,
  };
}

/** One append-only support entry. History is never rewritten. */
export interface SupportEntry {
  memoryId: string;
  at: string;
  supportType: "episode" | "candidate" | "outcome" | "operator" | "revival";
  confidence: EvidenceConfidence;
  accountNumber?: string;
  ticketId?: string;
  note?: string;
}

/* ------------------------------------------------------------------ */
/* Existing knowledge                                                  */
/* ------------------------------------------------------------------ */

export interface ExistingKnowledgeMatch {
  sourceType: "knowledge_vault" | "resolution_memory" | "candidate";
  sourceId: string;
  title: string;
  /** 0..1, lexical/deterministic overlap. Similarity never sets relationship alone. */
  similarity: number;
  relationship: "equivalent" | "overlapping" | "complementary" | "conflicting" | "superseded";
  realityStatus?: EvidenceStatus;
  /** Current body, when we need to show a diff. */
  currentText?: string;
}

/* ------------------------------------------------------------------ */
/* Candidate                                                           */
/* ------------------------------------------------------------------ */

export interface CuratedMemoryCandidate {
  id: string;
  type: CuratedCandidateType;
  title: string;
  /** Bounded, deterministic proposal text. Never a raw ticket body. */
  proposedStatement: string;
  fingerprint: string;
  sourceMemoryIds: string[];
  supportLog: SupportEntry[];
  evidenceRefs: string[];
  relatedEntities: EvidenceEntityRef[];
  support: CandidateSupport;
  conflicts: EvidenceConflict[];
  reality: { origin: EvidenceOrigin; confidence: EvidenceConfidence };
  lifecycle: CandidateLifecycle;
  blockReason?: BlockReason;
  suggestedDestination?: PromotionDestination;
  existingKnowledgeMatches?: ExistingKnowledgeMatch[];
  /** Candidate ids folded into this one (merge lineage is never erased). */
  mergedFrom?: string[];
  mergedInto?: string;
  promotedTo?: { destination: PromotionDestination; targetId: string; at: string; packetId: string };
  /** Operator decisions, append-only. */
  decisions?: Array<{ at: string; action: string; note?: string }>;
  /** Last time the candidate was retrieved/surfaced — feeds decay only. */
  lastSurfacedAt?: string;
  createdAt: string;
  updatedAt: string;
}

/* ------------------------------------------------------------------ */
/* Promotion packet                                                    */
/* ------------------------------------------------------------------ */

export interface MemoryReference {
  memoryId: string;
  title: string;
  occurredAt: string;
  confidence: EvidenceConfidence;
}

export interface EvidenceReference {
  factId?: string;
  sourceType: string;
  sourceId?: string;
  title?: string;
  confidence?: EvidenceConfidence;
}

export interface KnowledgeDiffLine {
  kind: "context" | "added" | "removed";
  text: string;
}

export interface PromotionPacket {
  id: string;
  candidateId: string;
  type: CuratedCandidateType;
  proposedKnowledge: { title: string; summary: string; body?: string };
  supportingMemories: MemoryReference[];
  supportingEvidence: EvidenceReference[];
  conflicts: EvidenceConflict[];
  recurrence: CandidateSupport;
  relatedAccounts: EvidenceEntityRef[];
  relatedTickets: EvidenceEntityRef[];
  currentKnowledgeMatches: ExistingKnowledgeMatch[];
  suggestedDestination: PromotionDestination;
  proposedOperation: PromotionOperation;
  /** Target record for update/merge/supersede/reinforce. */
  targetId?: string;
  diff?: KnowledgeDiffLine[];
  reality: { origin: EvidenceOrigin; confidence: EvidenceConfidence };
  risk: PromotionRisk;
  /** Plain, auditable reasons — never "AI confidence: 87%". */
  readinessSignals: string[];
  createdAt: string;
}

/* ------------------------------------------------------------------ */
/* Deterministic eligibility (no LLM ever decides these)               */
/* ------------------------------------------------------------------ */

export function hasCriticalConflict(c: CuratedMemoryCandidate): boolean {
  return c.conflicts.some((x) => x.status === "unresolved");
}

export function canPreparePromotion(c: CuratedMemoryCandidate): boolean {
  if (c.lifecycle === "promoted" || c.lifecycle === "dismissed" || c.lifecycle === "merged") return false;
  if (!c.sourceMemoryIds.length) return false;
  return c.support.memoryCount >= 1;
}

export function canCreateKnowledgeDraft(c: CuratedMemoryCandidate): boolean {
  if (!canPreparePromotion(c)) return false;
  if (hasCriticalConflict(c)) return false;
  return c.support.episodeCount >= 1;
}

/**
 * Resolution Memory is the strongest gate: a merely recurring pattern can
 * never become a verified resolution. It needs real verified outcomes, an
 * account scope, and no unresolved contradiction.
 */
export function canPromoteResolution(c: CuratedMemoryCandidate): boolean {
  if (!canPreparePromotion(c)) return false;
  if (hasCriticalConflict(c)) return false;
  if (c.type !== "resolution_candidate" && c.type !== "procedural" && c.type !== "semantic") return false;
  if (c.support.verifiedEvidenceCount < 1) return false;
  if (c.support.episodeCount < 2) return false;
  return c.relatedEntities.some((e) => e.type === "account");
}

export function canSupersedeKnowledge(c: CuratedMemoryCandidate): boolean {
  if (!canCreateKnowledgeDraft(c)) return false;
  if (c.support.verifiedEvidenceCount < 1) return false;
  return (c.existingKnowledgeMatches ?? []).some(
    (m) => m.sourceType === "knowledge_vault" && (m.relationship === "equivalent" || m.relationship === "conflicting"),
  );
}

/** Support is never verification: this is the only place confidence is raised. */
export function confidenceFromSupport(support: CandidateSupport): EvidenceConfidence {
  if (support.conflictingEvidenceCount > 0) return "unknown";
  if (support.verifiedEvidenceCount >= 2 && support.episodeCount >= 2) return "probable";
  if (support.episodeCount >= 2) return "probable";
  return "unknown";
}
