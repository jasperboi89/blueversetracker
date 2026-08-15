/**
 * Phase 14 — Work Progress Model.
 *
 * A PROJECTION over the Portal Context Envelope (Phase 10), the Reality
 * Boundary facts (Phase 11) and bounded episode signals. It is not a second
 * source of truth: nothing here is stored, and nothing writes back.
 */

import type { PortalContextEnvelope, ContextBlocker } from "@/lib/core/portal-context";
import type { EvidenceFact } from "@/lib/core/evidence-contract";
import { isSafeForOperationalGuidance } from "@/lib/core/evidence-contract";
import type {
  EpisodeAttempt,
  MissingEvidence,
  WorkEpisodeSignals,
  WorkHypothesis,
} from "./nba-contract";
import { interpretProcedures, type ProcedureInterpretation, type ProcedureStep } from "./procedure-steps";

export interface WorkCheck {
  fingerprint: string;
  label: string;
  status: ProcedureStep["status"];
  sourceType: string;
  sourceId: string;
  verification: boolean;
}

export interface WorkQuestion {
  id: string;
  question: string;
  /** Why it is still open. */
  reason: "unverified_step" | "conflict" | "missing_source" | "blocker";
}

export interface KnowledgeReference {
  sourceType: string;
  sourceId: string;
  title?: string;
  stale: boolean;
  superseded: boolean;
  confidence: "verified" | "probable" | "unknown";
}

export interface WorkProgressState {
  objective?: string;
  episodeKey: string;
  completedChecks: WorkCheck[];
  remainingChecks: WorkCheck[];
  blockedChecks: WorkCheck[];
  verifiedFacts: EvidenceFact[];
  contextOnlyFacts: EvidenceFact[];
  unresolvedQuestions: WorkQuestion[];
  activeBlockers: ContextBlocker[];
  pending: ContextBlocker[];
  attemptedActions: EpisodeAttempt[];
  successfulActions: EpisodeAttempt[];
  failedActions: EpisodeAttempt[];
  currentHypotheses: WorkHypothesis[];
  availableGuidance: KnowledgeReference[];
  procedures: ProcedureInterpretation[];
  missingEvidence: MissingEvidence[];
  /** True when nothing authoritative is known about the current work. */
  evidenceStarved: boolean;
}

const PENDING_BLOCKER_TYPES = new Set(["waiting_customer", "waiting_internal", "waiting_external"]);

function objectiveFor(env: PortalContextEnvelope): string | undefined {
  const a = env.active;
  if (a.ticket) return `Ticket ${a.ticket.id}${a.ticket.label ? ` — ${a.ticket.label}` : ""}`;
  if (a.dispatch) return `Dispatch session ${a.dispatch.id}`;
  if (a.workItem) return `Work item ${a.workItem.id}${a.workItem.title ? ` — ${a.workItem.title}` : ""}`;
  if (a.account) return `Account ${a.account.id}`;
  return undefined;
}

/** Stable identity for the current work episode. Changing it expires state. */
export function episodeKeyFor(env: PortalContextEnvelope): string {
  const a = env.active;
  const entity =
    (a.ticket && `ticket:${a.ticket.id}`) ||
    (a.dispatch && `dispatch:${a.dispatch.id}`) ||
    (a.workItem && `work:${a.workItem.id}`) ||
    (a.account && `account:${a.account.id}`) ||
    `route:${env.location.routeId}`;
  return `${env.shiftKey}|${entity}`;
}

/**
 * Context identity for invalidation (§47/§48): active entity, blockers,
 * evidence, conflicts and work state. Timers alone never invalidate.
 */
export function contextKeyFor(env: PortalContextEnvelope): string {
  const evidenceKey = env.evidence
    .map((e) => `${e.sourceType}:${e.sourceId}:${e.status ?? ""}:${e.freshness ?? ""}`)
    .sort()
    .join(",");
  const factKey = (env.facts ?? []).map((f) => `${f.id}:${f.status}`).sort().join(",");
  const blockerKey = env.blockers.map((b) => b.id).sort().join(",");
  const conflictKey = (env.evidenceConflicts ?? []).map((c) => c.id).sort().join(",");
  return [
    episodeKeyFor(env),
    env.location.routeId,
    blockerKey,
    conflictKey,
    evidenceKey,
    factKey,
    env.workState.unsavedChanges ? "unsaved" : "clean",
  ].join("|");
}

export function buildWorkProgress(
  env: PortalContextEnvelope,
  episode: WorkEpisodeSignals,
  now = Date.now(),
): WorkProgressState {
  const blockedFingerprints = new Set<string>();
  const procedures = interpretProcedures(env.evidence, {
    completedChecks: episode.completedChecks,
    blockedFingerprints: Array.from(blockedFingerprints),
  });

  const checks: WorkCheck[] = procedures.flatMap((p) =>
    p.steps.map((s) => ({
      fingerprint: s.fingerprint,
      label: s.label,
      status: s.status,
      sourceType: s.sourceType,
      sourceId: s.sourceId,
      verification: s.verification,
    })),
  );

  const facts = env.facts ?? [];
  const verifiedFacts = facts.filter((f) => isSafeForOperationalGuidance(f, { now }));
  const contextOnlyFacts = facts.filter((f) => !isSafeForOperationalGuidance(f, { now }));

  const activeBlockers = env.blockers.filter((b) => !PENDING_BLOCKER_TYPES.has(b.type));
  const pending = env.blockers.filter((b) => PENDING_BLOCKER_TYPES.has(b.type));

  const conflicts = env.evidenceConflicts ?? [];
  const unresolvedQuestions: WorkQuestion[] = [
    ...checks
      .filter((c) => c.status === "remaining")
      .map((c) => ({
        id: `q:${c.fingerprint}`,
        question: c.label,
        reason: "unverified_step" as const,
      })),
    ...conflicts.map((c) => ({
      id: `q:conflict:${c.id}`,
      question: `Which value is authoritative for ${c.subject.type} ${c.subject.id} — ${c.predicate}?`,
      reason: "conflict" as const,
    })),
    ...(env.accountContext?.unavailable ?? []).map((u) => ({
      id: `q:missing:${u}`,
      question: `Current ${u} could not be loaded for this account.`,
      reason: "missing_source" as const,
    })),
    ...activeBlockers.map((b) => ({
      id: `q:blocker:${b.id}`,
      question: `Blocker: ${b.label}`,
      reason: "blocker" as const,
    })),
  ];

  const missingEvidence: MissingEvidence[] = [
    ...checks
      .filter((c) => c.status === "remaining" && c.verification)
      .map((c) => ({ id: `missing:${c.fingerprint}`, label: c.label })),
    ...(env.accountContext?.unavailable ?? []).map((u) => ({
      id: `missing:source:${u}`,
      label: `${u} unavailable — unknown, not empty.`,
    })),
  ];

  const attempted = episode.attempts;
  const successful = attempted.filter((a) => a.outcome === "succeeded");
  const failed = attempted.filter((a) => a.outcome === "failed" || a.outcome === "no_effect");

  return {
    objective: objectiveFor(env),
    episodeKey: episode.episodeKey,
    completedChecks: checks.filter((c) => c.status === "completed"),
    remainingChecks: checks.filter((c) => c.status === "remaining"),
    blockedChecks: checks.filter((c) => c.status === "blocked"),
    verifiedFacts,
    contextOnlyFacts,
    unresolvedQuestions,
    activeBlockers,
    pending,
    attemptedActions: attempted,
    successfulActions: successful,
    failedActions: failed,
    currentHypotheses: buildHypotheses(env, verifiedFacts),
    availableGuidance: procedures.map((p) => ({
      sourceType: p.sourceType,
      sourceId: p.sourceId,
      title: p.title,
      stale: p.stale,
      superseded: p.superseded,
      confidence: p.confidence,
    })),
    procedures,
    missingEvidence,
    evidenceStarved: verifiedFacts.length === 0 && env.evidence.length === 0,
  };
}

/**
 * Transient working hypotheses derived from resolution/memory similarity.
 * Never durable, never promoted by wording alone.
 */
function buildHypotheses(env: PortalContextEnvelope, verifiedFacts: EvidenceFact[]): WorkHypothesis[] {
  const out: WorkHypothesis[] = [];
  const resolutions = env.evidence.filter((e) => e.sourceType === "resolution").slice(0, 3);
  for (const r of resolutions) {
    const supporting = verifiedFacts
      .filter((f) => typeof f.value === "string" && r.summary.toLowerCase().includes(String(f.value).toLowerCase()))
      .map((f) => f.id);
    const conflicting = (env.evidenceConflicts ?? []).map((c) => c.id);
    out.push({
      id: `h:${r.sourceId}`,
      statement: r.title ? `${r.title} may apply to the current work` : `${r.summary} may apply`,
      status: conflicting.length ? "weakened" : supporting.length ? "supported" : "proposed",
      supportingEvidence: supporting,
      conflictingEvidence: conflicting,
      stillNeeded: ["Verify the same condition exists on the current work"],
      transient: true,
    });
  }
  return out;
}