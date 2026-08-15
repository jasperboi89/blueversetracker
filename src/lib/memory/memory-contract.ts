/**
 * Intelligence Core — Phase 12: Operational Memory contract.
 *
 * Durable memory of WHAT HAPPENED during real work. It is deliberately NOT a
 * second source of truth: a memory never stores account instructions, ticket
 * bodies or live state. It stores a bounded experience record plus references
 * back to the systems that remain authoritative (Freshdesk, Account Context,
 * Resolution Memory, Knowledge Vault, Event Spine).
 *
 * Reality semantics are inherited from Phase 11 verbatim: `origin` answers
 * "how do we know this", `confidence` answers "how trustworthy is it", and
 * neither is ever collapsed or upgraded without an operator.
 */

import type {
  EvidenceConfidence,
  EvidenceEntityRef,
  EvidenceOrigin,
  EvidenceSourceType,
} from "@/lib/core/evidence-contract";

export const MEMORY_CLASSES = [
  /** A single lived experience: this happened, here, then. */
  "episodic",
  /** A learned durable fact proposed by the compiler. Requires review. */
  "semantic_candidate",
  /** A workflow lesson ("this order of steps worked"). Requires review. */
  "procedural_candidate",
  /** An observed association between entities. */
  "relational",
  /** A self-observation about how work went. Requires review. */
  "reflection_candidate",
] as const;
export type MemoryClass = (typeof MEMORY_CLASSES)[number];

export const CANDIDATE_CLASSES: MemoryClass[] = [
  "semantic_candidate",
  "procedural_candidate",
  "reflection_candidate",
];

export const MEMORY_STATUSES = [
  "active",
  "candidate",
  "promoted",
  "rejected",
  "superseded",
  "archived",
] as const;
export type MemoryStatus = (typeof MEMORY_STATUSES)[number];

export interface MemoryScope {
  shiftKey?: string;
  accountNumber?: string;
  ticketId?: string;
  workItemId?: string;
  dispatchId?: string;
  operatorId?: string;
}

/** A pointer back at the authoritative record. Never a copy of its content. */
export interface MemoryEvidenceRef {
  sourceType: EvidenceSourceType;
  sourceId?: string;
  title?: string;
  /** Phase 11 fact id, when the memory was compiled alongside an evidence graph. */
  factId?: string;
}

/** Compressed state transition distilled from the Event Spine. */
export interface MemoryTransition {
  at: string;
  /** Event type that caused the transition. */
  type: string;
  label: string;
  /** Repeat count when identical consecutive events were collapsed. */
  repeats?: number;
}

export interface MemoryEpisode {
  /** Deterministic, bounded narrative — never a model hallucination surface. */
  narrative: string;
  actions: string[];
  findings: string[];
  outcomes: string[];
  unresolved: string[];
  transitions: MemoryTransition[];
  startedAt: string;
  endedAt: string;
  durationMs: number;
  eventCount: number;
  /** Why the episode closed: what made it a meaningful unit of experience. */
  closedBy: MemoryTrigger;
}

export const MEMORY_TRIGGERS = [
  "work_completed",
  "ticket_completed",
  "dispatch_completed",
  "change_verified",
  "shift_handoff",
  "manual_capture",
  "session_ended",
] as const;
export type MemoryTrigger = (typeof MEMORY_TRIGGERS)[number];

export interface OperationalMemory {
  id: string;
  class: MemoryClass;
  /** Short operator-facing headline. */
  title: string;
  /** Bounded summary. Sensitive content is dropped, never redacted in place. */
  summary: string;
  subject: EvidenceEntityRef;
  scope: MemoryScope;
  episode?: MemoryEpisode;
  evidence: MemoryEvidenceRef[];
  origin: EvidenceOrigin;
  confidence: EvidenceConfidence;
  status: MemoryStatus;
  /** 0..1 deterministic significance score used for retention and ranking. */
  importance: number;
  tags: string[];
  occurredAt: string;
  recordedAt: string;
  /** Stable dedupe key: same experience compiled twice collapses to one row. */
  fingerprint: string;
  supersedes?: string[];
  supersededBy?: string[];
  /** Set only when a human accepted or rejected a candidate. */
  reviewedAt?: string;
  reviewNote?: string;
  /** Where this memory came from, e.g. "experience-compiler@1". */
  compiler: string;
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

export function isCandidateClass(cls: MemoryClass): boolean {
  return CANDIDATE_CLASSES.includes(cls);
}

export function isPendingReview(m: OperationalMemory): boolean {
  return isCandidateClass(m.class) && m.status === "candidate";
}

/** Only settled, non-retired memory may be injected into a prompt. */
export function isRetrievableMemory(m: OperationalMemory): boolean {
  return m.status !== "rejected" && m.status !== "archived" && m.status !== "superseded";
}

/**
 * A candidate is experience, not proof. It may inform a suggestion but must
 * never be cited as a verified fact until an operator promotes it.
 */
export function isOperationallyBinding(m: OperationalMemory): boolean {
  return m.status === "promoted" && m.confidence === "verified";
}

export function memoryFingerprint(input: {
  cls: MemoryClass;
  subject: EvidenceEntityRef;
  key: string;
  scope?: MemoryScope;
}): string {
  const scope = input.scope ?? {};
  const bits = [
    input.cls,
    `${input.subject.type}:${input.subject.id}`,
    scope.shiftKey ?? "",
    input.key.toLowerCase().replace(/\s+/g, " ").trim().slice(0, 120),
  ];
  return bits.join("|");
}

export function memoryId(fingerprint: string, at: string): string {
  let hash = 0;
  for (let i = 0; i < fingerprint.length; i += 1) {
    hash = (hash * 31 + fingerprint.charCodeAt(i)) | 0;
  }
  return `mem_${Math.abs(hash).toString(36)}_${Date.parse(at) || 0}`;
}