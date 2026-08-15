import type { AccountContextPack } from "./account-context";
import { classifyFreshness } from "./context-reality";
import type { ContextEvidence, PortalContextEnvelope } from "./portal-context";

/**
 * Bounded Evidence Pack assembly (Phase 10 §9).
 *
 * Evidence is *potentially relevant material*, never an answer. Each item keeps
 * its provenance (`origin`) and — for Resolution Memory — the operator's
 * `confidence`, unchanged. Every source is optional: a failure degrades the
 * pack and is reported as a warning instead of becoming "there is nothing".
 */

const SUMMARY_MAX = 320;

function bound(text: string): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > SUMMARY_MAX ? `${clean.slice(0, SUMMARY_MAX - 1)}…` : clean;
}

/** Evidence derived from an already-assembled Account Context Pack. */
export function evidenceFromAccountPack(
  pack: AccountContextPack,
  now = Date.now(),
): ContextEvidence[] {
  const out: ContextEvidence[] = [];

  for (const r of pack.resolutions) {
    out.push({
      id: `resolution:${r.id}`,
      sourceType: "resolution",
      sourceId: r.id,
      title: bound(r.problem),
      summary: bound(r.resolutionSummary),
      origin: "operator_confirmed",
      confidence: r.confidence,
      status: r.status,
      updatedAt: r.updatedAt,
      superseded: r.status === "superseded",
      historical: r.status !== "active",
      freshness: classifyFreshness(r.updatedAt, now, {
        superseded: r.status === "superseded",
        historical: r.status === "archived",
      }),
      relevance: 0.8,
    });
  }

  for (const c of pack.recentChanges) {
    out.push({
      id: `change:${c.id}`,
      sourceType: "change_record",
      sourceId: c.id,
      title: bound(c.title),
      summary: bound(
        `${c.changeType} · ${c.status} · risk ${c.risk}${c.ticketNumber ? ` · ticket ${c.ticketNumber}` : ""}`,
      ),
      origin: "operator_confirmed",
      status: c.status,
      updatedAt: c.verifiedAt ?? c.appliedAt ?? c.createdAt,
      freshness: classifyFreshness(c.verifiedAt ?? c.appliedAt ?? c.createdAt, now),
      relevance: 0.6,
    });
  }

  for (const p of pack.recurringPatterns) {
    out.push({
      id: `pattern:${p.id}`,
      sourceType: "account_context",
      sourceId: p.id,
      title: "Recurring pattern",
      summary: bound(`${p.label} (${p.count30d} in 30d, ${p.count6m} in 6m)`),
      origin: "observed",
      ...(p.lastAt ? { observedAt: p.lastAt } : {}),
      historical: !p.active,
      freshness: classifyFreshness(p.lastAt, now, { historical: !p.active }),
      relevance: p.active ? 0.7 : 0.3,
    });
  }

  for (const rb of pack.runbooks) {
    out.push({
      id: `knowledge:${rb.id}`,
      sourceType: "runbook",
      sourceId: rb.id,
      title: bound(rb.title),
      summary: bound(`${rb.noteType} · ${rb.relevance}`),
      origin: "retrieved",
      updatedAt: rb.updatedAt,
      freshness: classifyFreshness(rb.updatedAt, now),
      relevance: 0.5,
    });
  }

  for (const t of pack.recentTickets.slice(0, 4)) {
    out.push({
      id: `ticket:${t.id}`,
      sourceType: "freshdesk_ticket",
      sourceId: t.number,
      title: `Ticket ${t.number}`,
      // Subject only — never the body or the conversation.
      summary: bound(`${t.status}${t.classification ? ` · ${t.classification}` : ""}${t.subject ? ` · ${t.subject}` : ""}`),
      origin: "observed",
      status: t.status,
      updatedAt: t.updatedAt,
      freshness: classifyFreshness(t.updatedAt, now),
      relevance: 0.4,
    });
  }

  return out;
}

interface RetrievalLike {
  sourceType: string;
  sourceId: string;
  title: string;
  snippet: string;
  confidence?: string;
  sourceStatus?: string;
  historical?: boolean;
  sourceUpdatedAt?: string;
  finalScore: number;
}

/** Evidence from Hybrid Retrieval / Similar Prior Work results. */
export function evidenceFromRetrieval(
  results: RetrievalLike[],
  now = Date.now(),
): ContextEvidence[] {
  return results.map((r) => {
    const sourceType: ContextEvidence["sourceType"] =
      r.sourceType === "resolution"
        ? "resolution"
        : r.sourceType === "change_record"
          ? "change_record"
          : r.sourceType === "knowledge_note"
            ? "knowledge"
            : r.sourceType === "ticket"
              ? "freshdesk_ticket"
              : "similar_work";
    const superseded = r.sourceStatus === "superseded";
    return {
      id: `retrieval:${r.sourceType}:${r.sourceId}`,
      sourceType,
      sourceId: r.sourceId,
      title: bound(r.title),
      summary: bound(r.snippet),
      origin: "retrieved",
      ...(r.confidence === "verified" || r.confidence === "probable" || r.confidence === "unknown"
        ? { confidence: r.confidence }
        : {}),
      ...(r.sourceStatus ? { status: r.sourceStatus } : {}),
      ...(r.sourceUpdatedAt ? { updatedAt: r.sourceUpdatedAt } : {}),
      historical: Boolean(r.historical),
      superseded,
      freshness: classifyFreshness(r.sourceUpdatedAt, now, {
        superseded,
        historical: Boolean(r.historical),
      }),
      relevance: Math.max(0, Math.min(1, r.finalScore)),
    } satisfies ContextEvidence;
  });
}

/** A retrieval query built deterministically from the envelope — no AI call. */
export function evidenceQueryFor(env: PortalContextEnvelope): string | null {
  const parts: string[] = [];
  if (env.active.ticket?.label) parts.push(env.active.ticket.label);
  else if (env.active.ticket) parts.push(`ticket ${env.active.ticket.id}`);
  if (env.active.workItem?.title) parts.push(env.active.workItem.title);
  if (env.active.knowledgeNote?.title) parts.push(env.active.knowledgeNote.title);
  if (env.active.account?.name) parts.push(env.active.account.name);
  const query = parts.join(" ").trim();
  return query.length >= 3 ? query.slice(0, 240) : null;
}
