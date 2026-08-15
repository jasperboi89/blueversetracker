/**
 * Intelligence Core — Phase 11: adapters from authoritative systems to facts.
 *
 * Each adapter PROJECTS an existing record into the shared truth vocabulary.
 * The originating system stays authoritative: Resolution Memory keeps its own
 * richer semantics, Account Context keeps its pack, the Knowledge Vault keeps
 * its notes. A fact only references them.
 */

import type { ContextEvidence, PortalContextEnvelope } from "./portal-context";
import {
  evidenceFactId,
  type EvidenceEdge,
  type EvidenceEntityRef,
  type EvidenceFact,
  type EvidenceOrigin,
  type EvidenceSourceType,
} from "./evidence-contract";
import { confidenceAtMost, freshnessFor, sanitizeEvidenceValue } from "./reality-boundary";

const SOURCE_MAP: Record<ContextEvidence["sourceType"], EvidenceSourceType> = {
  account_context: "account_context",
  resolution: "resolution_memory",
  knowledge: "knowledge_vault",
  runbook: "knowledge_vault",
  change_record: "account_context",
  freshdesk_ticket: "freshdesk",
  similar_work: "similar_prior_work",
};

const SUBJECT_MAP: Record<ContextEvidence["sourceType"], EvidenceEntityRef["type"]> = {
  account_context: "account",
  resolution: "resolution",
  knowledge: "knowledge_note",
  runbook: "knowledge_note",
  change_record: "work_record",
  freshdesk_ticket: "ticket",
  similar_work: "ticket",
};

const PREDICATE_MAP: Record<ContextEvidence["sourceType"], string> = {
  account_context: "account.pattern",
  resolution: "resolution.summary",
  knowledge: "knowledge.note",
  runbook: "knowledge.runbook",
  change_record: "change.record",
  freshdesk_ticket: "ticket.summary",
  similar_work: "similar.prior_work",
};

/**
 * Similarity is not proof: prior work can never arrive as verified, and an
 * AI-generated item can never arrive above `unknown`.
 */
function cappedConfidence(e: ContextEvidence, origin: EvidenceOrigin) {
  const base = e.confidence ?? "unknown";
  if (e.sourceType === "similar_work") return confidenceAtMost(base, "probable");
  if (origin === "generated" || origin === "simulated" || origin === "inferred") {
    return confidenceAtMost(base, "unknown");
  }
  return base;
}

/** Project already-bounded Context Evidence into Reality Boundary facts. */
export function factsFromContextEvidence(
  evidence: ContextEvidence[],
  scope: { accountNumber?: string; shiftKey?: string } = {},
  now = Date.now(),
): EvidenceFact[] {
  const out: EvidenceFact[] = [];
  for (const e of evidence) {
    const value = sanitizeEvidenceValue(e.summary || e.title || "");
    if (value === null) continue; // privacy boundary: drop rather than redact
    const sourceType = SOURCE_MAP[e.sourceType];
    const subject: EvidenceEntityRef = {
      type: SUBJECT_MAP[e.sourceType],
      id: e.sourceId,
      ...(e.title ? { label: e.title } : {}),
    };
    const origin: EvidenceOrigin = e.origin as EvidenceOrigin;
    const at = e.observedAt ?? e.updatedAt;
    const status = e.superseded
      ? ("superseded" as const)
      : e.historical
        ? ("historical" as const)
        : ("active" as const);
    out.push({
      id: evidenceFactId(subject, PREDICATE_MAP[e.sourceType], sourceType, e.sourceId),
      subject,
      predicate: PREDICATE_MAP[e.sourceType],
      value,
      origin,
      confidence: cappedConfidence(e, origin),
      source: { type: sourceType, id: e.sourceId, ...(e.title ? { title: e.title } : {}) },
      ...(e.observedAt ? { observedAt: e.observedAt } : {}),
      recordedAt: e.updatedAt ?? e.observedAt ?? new Date(now).toISOString(),
      ...(at ? { validFrom: at } : {}),
      freshness:
        e.freshness ??
        freshnessFor(sourceType, at, now, { superseded: e.superseded, historical: e.historical }),
      status,
      scope: {
        ...(scope.accountNumber ? { accountNumber: scope.accountNumber } : {}),
        ...(scope.shiftKey ? { shiftKey: scope.shiftKey } : {}),
      },
      ...(e.relevance !== undefined ? { metadata: { relevance: Math.round(e.relevance * 100) / 100 } } : {}),
    });
  }
  return out;
}

/**
 * Facts the portal can observe directly: what the operator has open right now.
 * These are the only facts that legitimately start life as `observed`.
 */
export function factsFromActiveEntities(
  env: PortalContextEnvelope,
  now = Date.now(),
): EvidenceFact[] {
  const nowIso = new Date(now).toISOString();
  const out: EvidenceFact[] = [];
  const scope = {
    ...(env.active.account?.id ? { accountNumber: env.active.account.id } : {}),
    shiftKey: env.shiftKey,
  };

  const push = (
    subject: EvidenceEntityRef,
    predicate: string,
    value: string,
    origin: EvidenceOrigin,
  ) => {
    const safe = sanitizeEvidenceValue(value);
    if (safe === null) return;
    out.push({
      id: evidenceFactId(subject, predicate, "event_spine", subject.id),
      subject,
      predicate,
      value: safe,
      origin,
      confidence: origin === "observed" ? "verified" : "unknown",
      source: { type: "event_spine", id: subject.id },
      observedAt: nowIso,
      recordedAt: nowIso,
      validFrom: nowIso,
      freshness: "current",
      status: "active",
      scope,
    });
  };

  const a = env.active;
  if (a.ticket) {
    push({ type: "ticket", id: a.ticket.id, ...(a.ticket.label ? { label: a.ticket.label } : {}) },
      "ticket.open_in_portal", a.ticket.onScreen ? "on screen" : "working context", a.ticket.origin as EvidenceOrigin);
  }
  if (a.account) {
    push({ type: "account", id: a.account.id, ...(a.account.name ? { label: a.account.name } : {}) },
      "account.active", a.account.name ?? a.account.id, a.account.origin as EvidenceOrigin);
  }
  if (a.dispatch) {
    push({ type: "dispatch", id: a.dispatch.id }, "dispatch.session_active", "testing in progress", "observed");
  }
  if (a.knowledgeNote) {
    // Reference state is documentation status, never a verification claim.
    const subject: EvidenceEntityRef = {
      type: "knowledge_note",
      id: a.knowledgeNote.id,
      ...(a.knowledgeNote.title ? { label: a.knowledgeNote.title } : {}),
    };
    const state = a.knowledgeNote.status ?? "saved";
    out.push({
      id: evidenceFactId(subject, "knowledge.state", "knowledge_vault", a.knowledgeNote.id),
      subject,
      predicate: "knowledge.state",
      value: state,
      origin: state === "draft" ? "generated" : "retrieved",
      confidence: "unknown",
      source: { type: "knowledge_vault", id: a.knowledgeNote.id, ...(a.knowledgeNote.title ? { title: a.knowledgeNote.title } : {}) },
      recordedAt: a.knowledgeNote.updatedAt ?? nowIso,
      ...(a.knowledgeNote.updatedAt ? { validFrom: a.knowledgeNote.updatedAt } : {}),
      freshness: freshnessFor("knowledge_vault", a.knowledgeNote.updatedAt, now),
      status: "active",
      scope,
    });
  }
  if (env.workState.running) {
    push({ type: "operator", id: "current" }, "timer.running", "true", "observed");
  }
  return out;
}

/** Relationship edges we can justify from the envelope — never invented. */
export function edgesFromEnvelope(env: PortalContextEnvelope, facts: EvidenceFact[]): EvidenceEdge[] {
  const at = env.generatedAt;
  const edges: EvidenceEdge[] = [];
  const account = env.active.account;
  const ticket = env.active.ticket;

  if (ticket && account) {
    edges.push({
      id: `edge:belongs_to:${ticket.id}:${account.id}`,
      from: { type: "ticket", id: ticket.id },
      relation: "belongs_to",
      to: { type: "account", id: account.id },
      origin: ticket.accountId === account.id ? "observed" : "inferred",
      confidence: ticket.accountId === account.id ? "verified" : "unknown",
      createdAt: at,
    });
  }

  for (const f of facts) {
    if (f.source.type === "similar_prior_work" && ticket) {
      edges.push({
        id: `edge:similar_to:${ticket.id}:${f.subject.id}`,
        from: { type: "ticket", id: ticket.id },
        relation: "similar_to",
        to: f.subject,
        origin: "retrieved",
        confidence: "unknown",
        createdAt: at,
        factId: f.id,
      });
    }
    if (f.subject.type === "resolution" && account) {
      edges.push({
        id: `edge:resolution_account:${f.subject.id}:${account.id}`,
        from: f.subject,
        relation: "belongs_to",
        to: { type: "account", id: account.id },
        origin: "retrieved",
        confidence: "probable",
        createdAt: at,
        factId: f.id,
      });
    }
  }
  return edges;
}

/**
 * A confirmed Safe Action that actually executed produced an observable
 * result — that, and only that, becomes observed evidence.
 */
export function factFromActionResult(input: {
  actionId: string;
  actionType: string;
  entity: EvidenceEntityRef;
  outcome: string;
  status: "success" | "failed" | "proposed";
  at?: string;
  accountNumber?: string;
}): EvidenceFact | null {
  if (input.status !== "success") return null; // proposals never create evidence
  const value = sanitizeEvidenceValue(input.outcome);
  if (value === null) return null;
  const at = input.at ?? new Date().toISOString();
  return {
    id: evidenceFactId(input.entity, `action.${input.actionType}`, "event_spine", input.actionId),
    subject: input.entity,
    predicate: `action.${input.actionType}`,
    value,
    origin: "observed",
    confidence: "verified",
    source: { type: "event_spine", id: input.actionId },
    observedAt: at,
    recordedAt: at,
    validFrom: at,
    freshness: "current",
    status: "active",
    ...(input.accountNumber ? { scope: { accountNumber: input.accountNumber } } : {}),
  };
}

/* ------------------------------------------------------------------ */
/* Envelope -> graph                                                   */
/* ------------------------------------------------------------------ */

import { buildEvidenceGraph, type EvidenceGraph } from "./evidence-graph";

/**
 * Deterministic projection of one envelope into the Evidence Graph. Called at
 * ask time only — nothing polls, and no fact is fabricated for a source that
 * did not answer (unavailable stays unknown, never empty).
 */
export function graphFromEnvelope(
  env: PortalContextEnvelope,
  extraFacts: EvidenceFact[] = [],
  now = Date.now(),
): EvidenceGraph {
  const scope = {
    ...(env.active.account?.id ? { accountNumber: env.active.account.id } : {}),
    shiftKey: env.shiftKey,
  };
  const facts = [
    ...factsFromActiveEntities(env, now),
    ...factsFromContextEvidence(env.evidence, scope, now),
    ...extraFacts,
  ];
  // Same subject+predicate+source is one fact; last projection wins.
  const deduped = Array.from(new Map(facts.map((f) => [f.id, f])).values());
  return buildEvidenceGraph(deduped, edgesFromEnvelope(env, deduped), now);
}
