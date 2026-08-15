/**
 * Intelligence Core — Phase 11: canonical Evidence contract.
 *
 * This is the shared truth vocabulary that sits UNDERNEATH the systems that
 * already own data (Resolution Memory, Account Context, Knowledge Vault,
 * Hybrid Retrieval, Event Spine). It never stores their content: a fact holds
 * a stable reference, a bounded operational value, provenance, confidence,
 * temporal validity and supersession — nothing else.
 *
 * `origin` answers "how do we know this?".
 * `confidence` answers "how trustworthy is the conclusion?".
 * They are never collapsed into one field.
 */

import type { ContextFreshness, EvidenceConfidence } from "./context-reality";

export const EVIDENCE_ORIGINS = [
  "observed",
  "operator_confirmed",
  "retrieved",
  "inferred",
  "generated",
  "simulated",
  "uncertain",
] as const;
export type EvidenceOrigin = (typeof EVIDENCE_ORIGINS)[number];

export const EVIDENCE_STATUSES = ["active", "historical", "superseded", "disputed"] as const;
export type EvidenceStatus = (typeof EVIDENCE_STATUSES)[number];

export type EvidenceFreshness = ContextFreshness;
export type { EvidenceConfidence };

/* ------------------------------------------------------------------ */
/* References                                                          */
/* ------------------------------------------------------------------ */

export const EVIDENCE_ENTITY_TYPES = [
  "account",
  "ticket",
  "work_record",
  "resolution",
  "knowledge_note",
  "dispatch",
  "additional_work",
  "shift",
  "operator",
  "system",
] as const;
export type EvidenceEntityType = (typeof EVIDENCE_ENTITY_TYPES)[number];

export interface EvidenceEntityRef {
  type: EvidenceEntityType;
  /** Stable identifier. Display text is never identity. */
  id: string;
  label?: string;
}

export const EVIDENCE_SOURCE_TYPES = [
  "account_context",
  "resolution_memory",
  "knowledge_vault",
  "freshdesk",
  "similar_prior_work",
  "operator_input",
  "event_spine",
  "copilot",
  "system_rule",
  "import",
] as const;
export type EvidenceSourceType = (typeof EVIDENCE_SOURCE_TYPES)[number];

export interface EvidenceSourceRef {
  type: EvidenceSourceType;
  /** Id inside the authoritative system — the place the real content lives. */
  id?: string;
  title?: string;
}

/* ------------------------------------------------------------------ */
/* Fact                                                                */
/* ------------------------------------------------------------------ */

/** Bounded value space. Raw payloads are never carried in a fact. */
export type EvidenceValue = string | number | boolean | null;

export interface EvidenceScope {
  accountNumber?: string;
  shiftKey?: string;
  operatorId?: string;
}

export interface EvidenceFact<T extends EvidenceValue = EvidenceValue> {
  id: string;
  subject: EvidenceEntityRef;
  /** Stable machine predicate, e.g. "dispatch_method", "resolution.summary". */
  predicate: string;
  value: T;
  origin: EvidenceOrigin;
  confidence: EvidenceConfidence;
  source: EvidenceSourceRef;
  observedAt?: string;
  recordedAt: string;
  validFrom?: string;
  validUntil?: string;
  freshness?: EvidenceFreshness;
  supersedes?: string[];
  supersededBy?: string[];
  status: EvidenceStatus;
  scope?: EvidenceScope;
  /** Small, non-sensitive routing metadata only. */
  metadata?: Record<string, string | number | boolean>;
}

/* ------------------------------------------------------------------ */
/* Edges                                                               */
/* ------------------------------------------------------------------ */

export const EVIDENCE_RELATIONS = [
  "belongs_to",
  "reports",
  "resolved_by",
  "similar_to",
  "references",
  "supported_by",
  "supports",
  "derived_from",
  "verified_by",
  "supersedes",
  "contradicts",
] as const;
export type EvidenceRelation = (typeof EVIDENCE_RELATIONS)[number];

export interface EvidenceEdge {
  id: string;
  from: EvidenceEntityRef;
  relation: EvidenceRelation;
  to: EvidenceEntityRef;
  origin: EvidenceOrigin;
  confidence: EvidenceConfidence;
  createdAt: string;
  /** Fact that justifies the edge, when one exists. */
  factId?: string;
}

/* ------------------------------------------------------------------ */
/* Conflicts                                                           */
/* ------------------------------------------------------------------ */

export interface EvidenceConflict {
  id: string;
  subject: EvidenceEntityRef;
  predicate: string;
  factIds: string[];
  /** Bounded, human-readable rendering of the competing values. */
  values: Array<{ factId: string; value: string; origin: EvidenceOrigin; confidence: EvidenceConfidence; at?: string }>;
  /** Deterministic reading only — never an AI conclusion. */
  interpretation?: string;
  status: "unresolved" | "resolved";
  detectedAt: string;
}

/* ------------------------------------------------------------------ */
/* Verification helpers                                                */
/* ------------------------------------------------------------------ */

export function isSupersededFact(fact: EvidenceFact): boolean {
  return fact.status === "superseded" || (fact.supersededBy?.length ?? 0) > 0;
}

export function isHistoricalFact(fact: EvidenceFact): boolean {
  return fact.status === "historical" || fact.freshness === "historical";
}

export function isExpiredFact(fact: EvidenceFact, now = Date.now()): boolean {
  if (!fact.validUntil) return false;
  const until = Date.parse(fact.validUntil);
  return Number.isFinite(until) && until <= now;
}

export function isCurrentFact(fact: EvidenceFact, now = Date.now()): boolean {
  if (isSupersededFact(fact) || isHistoricalFact(fact)) return false;
  if (fact.status === "disputed") return false;
  if (isExpiredFact(fact, now)) return false;
  if (fact.validFrom) {
    const from = Date.parse(fact.validFrom);
    if (Number.isFinite(from) && from > now) return false;
  }
  return fact.freshness !== "superseded";
}

export function isVerifiedFact(fact: EvidenceFact): boolean {
  return fact.confidence === "verified" && fact.status !== "disputed";
}

/**
 * Gatekeeper for operational recommendations. Generated, simulated, superseded,
 * disputed and unsupported inference never qualify unless brainstorming is
 * explicitly requested.
 */
export function isSafeForOperationalGuidance(
  fact: EvidenceFact,
  options: { now?: number; allowExploratory?: boolean } = {},
): boolean {
  const now = options.now ?? Date.now();
  if (options.allowExploratory) return !isSupersededFact(fact);
  if (!isCurrentFact(fact, now)) return false;
  if (fact.origin === "generated" || fact.origin === "simulated" || fact.origin === "uncertain") return false;
  if (fact.origin === "inferred" && fact.confidence === "unknown") return false;
  return true;
}

/** Stable, deterministic fact id: same input -> same id (no random UUIDs). */
export function evidenceFactId(
  subject: EvidenceEntityRef,
  predicate: string,
  sourceType: EvidenceSourceType,
  sourceId = "",
): string {
  return `${subject.type}:${subject.id}|${predicate}|${sourceType}:${sourceId}`;
}
