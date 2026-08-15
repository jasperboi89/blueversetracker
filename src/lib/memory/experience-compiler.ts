/**
 * Intelligence Core — Phase 12: Experience Compiler.
 *
 * Compresses raw Event Spine activity into a small number of meaningful state
 * transitions and turns those into an episodic memory plus (optional) learning
 * candidates. Everything here is PURE and DETERMINISTIC: same events in, same
 * memory out. No AI decides what happened — a model may later re-word the
 * narrative, but never invent an action, finding or outcome.
 */

import type { AccEvent, AccEventType } from "@/lib/core/events";
import { containsSensitive, sanitizeEvidenceValue } from "@/lib/core/reality-boundary";
import type { EvidenceEntityRef } from "@/lib/core/evidence-contract";
import {
  memoryFingerprint,
  memoryId,
  type MemoryEpisode,
  type MemoryEvidenceRef,
  type MemoryScope,
  type MemoryTransition,
  type MemoryTrigger,
  type OperationalMemory,
} from "./memory-contract";

export const COMPILER_VERSION = "experience-compiler@1";

/** Events that close an episode, and the trigger they map to. */
export const CLOSING_EVENTS: Partial<Record<AccEventType, MemoryTrigger>> = {
  "work.completed": "work_completed",
  "ticket.completed": "ticket_completed",
  "dispatch.completed": "dispatch_completed",
  "change.verified": "change_verified",
  "handoff.published": "shift_handoff",
};

/** Noise that never earns a line in an experience record on its own. */
const IGNORED: AccEventType[] = ["account.opened", "work.opened", "ticket.opened", "dispatch.opened"];

const ACTION_EVENTS: AccEventType[] = [
  "work.started",
  "work.paused",
  "change.created",
  "change.applied",
  "dispatch.started",
  "dispatch.retested",
  "knowledge.created",
  "knowledge.updated",
  "night_plan.item_added",
  "timer.started",
  "timer.stopped",
];

const FINDING_EVENTS: AccEventType[] = [
  "blocker.created",
  "blocker.updated",
  "coverage.expiring",
  "ticket.status_changed",
  "resolution.superseded",
];

const OUTCOME_EVENTS: AccEventType[] = [
  "work.completed",
  "ticket.completed",
  "dispatch.completed",
  "change.verified",
  "blocker.resolved",
  "resolution.created",
  "resolution.updated",
  "night_plan.item_completed",
  "handoff.published",
];

function labelFor(e: AccEvent): string {
  const md = e.metadata ?? {};
  const raw =
    (typeof md["label"] === "string" && md["label"]) ||
    (typeof md["safeLabel"] === "string" && md["safeLabel"]) ||
    (typeof md["reasonCode"] === "string" && md["reasonCode"]) ||
    (typeof md["status"] === "string" && `status ${md["status"]}`) ||
    "";
  const safe = raw ? sanitizeEvidenceValue(String(raw)) : null;
  return typeof safe === "string" && safe ? safe : e.type.replace(/[._]/g, " ");
}

/**
 * Collapse the raw stream into transitions: drop navigation noise, merge
 * identical consecutive events, and cap the result so an episode stays a
 * summary rather than a log replay.
 */
export function compressEvents(events: AccEvent[], max = 24): MemoryTransition[] {
  const ordered = [...events].sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));
  const out: MemoryTransition[] = [];
  for (const e of ordered) {
    if (IGNORED.includes(e.type)) continue;
    const label = labelFor(e);
    const prev = out[out.length - 1];
    if (prev && prev.type === e.type && prev.label === label) {
      prev.repeats = (prev.repeats ?? 1) + 1;
      prev.at = e.timestamp;
      continue;
    }
    out.push({ at: e.timestamp, type: e.type, label });
  }
  return out.length > max ? [...out.slice(0, max - 1), out[out.length - 1]!] : out;
}

function bucket(events: AccEvent[], types: AccEventType[], limit: number): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const e of events) {
    if (!types.includes(e.type)) continue;
    const line = `${e.type.replace(/[._]/g, " ")}: ${labelFor(e)}`;
    if (seen.has(line)) continue;
    seen.add(line);
    out.push(line);
    if (out.length >= limit) break;
  }
  return out;
}

function unresolvedFrom(events: AccEvent[]): string[] {
  const open = new Map<string, string>();
  for (const e of events) {
    const id = typeof e.metadata?.["blockerId"] === "string" ? e.metadata["blockerId"] : e.id;
    if (e.type === "blocker.created" || e.type === "blocker.updated") open.set(id, labelFor(e));
    if (e.type === "blocker.resolved") open.delete(id);
  }
  return [...open.values()].slice(0, 5);
}

/** Deterministic significance: more real work and more outcomes matter more. */
export function scoreImportance(input: {
  durationMs: number;
  actions: number;
  outcomes: number;
  findings: number;
  unresolved: number;
}): number {
  const minutes = input.durationMs / 60_000;
  const raw =
    Math.min(minutes / 45, 1) * 0.3 +
    Math.min(input.actions / 6, 1) * 0.2 +
    Math.min(input.outcomes / 3, 1) * 0.3 +
    Math.min(input.findings / 3, 1) * 0.1 +
    Math.min(input.unresolved / 2, 1) * 0.1;
  return Math.round(Math.min(1, raw) * 100) / 100;
}

function subjectFor(scope: MemoryScope): EvidenceEntityRef {
  if (scope.ticketId) return { type: "ticket", id: scope.ticketId };
  if (scope.dispatchId) return { type: "dispatch", id: scope.dispatchId };
  if (scope.workItemId) return { type: "work_record", id: scope.workItemId };
  if (scope.accountNumber) return { type: "account", id: scope.accountNumber };
  return { type: "shift", id: scope.shiftKey ?? "current" };
}

function evidenceRefs(scope: MemoryScope, extra: MemoryEvidenceRef[] = []): MemoryEvidenceRef[] {
  const refs: MemoryEvidenceRef[] = [{ sourceType: "event_spine" }];
  if (scope.ticketId) refs.push({ sourceType: "freshdesk", sourceId: scope.ticketId });
  if (scope.accountNumber) refs.push({ sourceType: "account_context", sourceId: scope.accountNumber });
  for (const e of extra) refs.push(e);
  return refs.slice(0, 8);
}

export interface CompileInput {
  events: AccEvent[];
  scope: MemoryScope;
  trigger: MemoryTrigger;
  now?: number;
  /** Extra pointers back at authoritative records (resolution ids, notes…). */
  evidence?: MemoryEvidenceRef[];
  /** Minimum activity before an episode is worth remembering. */
  minTransitions?: number;
}

const NARRATIVE_MAX = 900;

/**
 * Compile one episode. Returns null when the activity was too thin to be a
 * meaningful experience — the portal must not accumulate empty memories.
 */
export function compileEpisode(input: CompileInput): OperationalMemory | null {
  const now = input.now ?? Date.now();
  const events = [...input.events].sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));
  if (!events.length) return null;

  const transitions = compressEvents(events);
  const actions = bucket(events, ACTION_EVENTS, 6);
  const findings = bucket(events, FINDING_EVENTS, 5);
  const outcomes = bucket(events, OUTCOME_EVENTS, 5);
  const unresolved = unresolvedFrom(events);

  const minTransitions = input.minTransitions ?? 2;
  if (transitions.length < minTransitions && !outcomes.length) return null;

  const startedAt = events[0]!.timestamp;
  const endedAt = events[events.length - 1]!.timestamp;
  const durationMs = Math.max(0, Date.parse(endedAt) - Date.parse(startedAt));

  const subject = subjectFor(input.scope);
  const headline =
    input.scope.ticketId
      ? `Ticket ${input.scope.ticketId}`
      : input.scope.dispatchId
        ? `Dispatch ${input.scope.dispatchId}`
        : input.scope.workItemId
          ? `Work item ${input.scope.workItemId}`
          : input.scope.accountNumber
            ? `Account ${input.scope.accountNumber}`
            : `Shift ${input.scope.shiftKey ?? ""}`.trim();

  const narrativeRaw = [
    `${headline}: ${transitions.length} tracked step(s) over ${Math.round(durationMs / 60_000)} min, closed by ${input.trigger.replace(/_/g, " ")}.`,
    actions.length ? `Actions — ${actions.join("; ")}.` : "",
    findings.length ? `Findings — ${findings.join("; ")}.` : "",
    outcomes.length ? `Outcome — ${outcomes.join("; ")}.` : "",
    unresolved.length ? `Still open — ${unresolved.join("; ")}.` : "",
  ]
    .filter(Boolean)
    .join(" ");

  // Privacy: the compiler drops anything that looks sensitive instead of
  // storing a redacted blob (Phase 11 rule, reused verbatim).
  if (containsSensitive(narrativeRaw)) return null;
  const narrative = narrativeRaw.slice(0, NARRATIVE_MAX);

  const episode: MemoryEpisode = {
    narrative,
    actions,
    findings,
    outcomes,
    unresolved,
    transitions,
    startedAt,
    endedAt,
    durationMs,
    eventCount: events.length,
    closedBy: input.trigger,
  };

  const fingerprint = memoryFingerprint({
    cls: "episodic",
    subject,
    key: `${input.trigger}|${startedAt}`,
    scope: input.scope,
  });

  return {
    id: memoryId(fingerprint, endedAt),
    class: "episodic",
    title: `${headline} — ${input.trigger.replace(/_/g, " ")}`,
    summary: narrative,
    subject,
    scope: input.scope,
    episode,
    evidence: evidenceRefs(input.scope, input.evidence),
    // We watched it happen; we did not verify the conclusions drawn from it.
    origin: "observed",
    confidence: "probable",
    status: "active",
    importance: scoreImportance({
      durationMs,
      actions: actions.length,
      outcomes: outcomes.length,
      findings: findings.length,
      unresolved: unresolved.length,
    }),
    tags: Array.from(
      new Set(
        [
          input.trigger,
          input.scope.accountNumber ? `account:${input.scope.accountNumber}` : "",
          unresolved.length ? "unresolved" : "",
        ].filter(Boolean),
      ),
    ) as string[],
    occurredAt: endedAt,
    recordedAt: new Date(now).toISOString(),
    fingerprint,
    compiler: COMPILER_VERSION,
  };
}

/* ------------------------------------------------------------------ */
/* Candidates                                                          */
/* ------------------------------------------------------------------ */

/**
 * Propose reusable knowledge from an episode. Everything produced here is a
 * CANDIDATE: unverified, non-binding, and invisible to operational guidance
 * until an operator promotes it.
 */
export function deriveCandidates(memory: OperationalMemory, now = Date.now()): OperationalMemory[] {
  const ep = memory.episode;
  if (!ep) return [];
  const out: OperationalMemory[] = [];
  const recordedAt = new Date(now).toISOString();

  const base = {
    subject: memory.subject,
    scope: memory.scope,
    evidence: [...memory.evidence, { sourceType: "operator_input" as const }].slice(0, 8),
    origin: "inferred" as const,
    confidence: "unknown" as const,
    status: "candidate" as const,
    tags: memory.tags,
    occurredAt: memory.occurredAt,
    recordedAt,
    compiler: COMPILER_VERSION,
    supersedes: [] as string[],
  };

  // Semantic: an outcome reached on a specific account is a proposed fact.
  if (ep.outcomes.length && memory.scope.accountNumber) {
    const key = ep.outcomes[0]!;
    const fp = memoryFingerprint({ cls: "semantic_candidate", subject: memory.subject, key });
    out.push({
      ...base,
      id: memoryId(fp, recordedAt),
      class: "semantic_candidate",
      title: `Learned: ${key}`.slice(0, 120),
      summary: `On account ${memory.scope.accountNumber}, this work ended with: ${key}. Proposed as a durable fact — unverified until reviewed.`,
      importance: Math.min(1, memory.importance + 0.1),
      fingerprint: fp,
    });
  }

  // Procedural: an ordered action sequence that ended in an outcome.
  if (ep.actions.length >= 2 && ep.outcomes.length) {
    const key = ep.actions.slice(0, 4).join(" -> ");
    const fp = memoryFingerprint({ cls: "procedural_candidate", subject: memory.subject, key });
    out.push({
      ...base,
      id: memoryId(fp, recordedAt),
      class: "procedural_candidate",
      title: `Workflow that worked: ${ep.actions[0]}`.slice(0, 120),
      summary: `Sequence ${key} preceded ${ep.outcomes[0]}. Proposed workflow lesson — one occurrence is not a rule.`,
      importance: memory.importance,
      fingerprint: fp,
    });
  }

  // Reflection: work that ended with something still open.
  if (ep.unresolved.length) {
    const key = ep.unresolved.join("; ");
    const fp = memoryFingerprint({ cls: "reflection_candidate", subject: memory.subject, key });
    out.push({
      ...base,
      id: memoryId(fp, recordedAt),
      class: "reflection_candidate",
      title: "Left unresolved at close",
      summary: `This work closed with unresolved items: ${key}. Worth a follow-up or a checklist change.`,
      importance: Math.min(1, memory.importance + 0.15),
      fingerprint: fp,
    });
  }

  // Relational: the association between account and ticket that was observed.
  if (memory.scope.accountNumber && memory.scope.ticketId) {
    const key = `ticket ${memory.scope.ticketId} worked on account ${memory.scope.accountNumber}`;
    const fp = memoryFingerprint({ cls: "relational", subject: memory.subject, key });
    out.push({
      ...base,
      id: memoryId(fp, recordedAt),
      class: "relational",
      status: "active",
      origin: "observed",
      confidence: "probable",
      title: "Ticket / account association",
      summary: key,
      importance: 0.2,
      fingerprint: fp,
    });
  }

  return out.filter((m) => !containsSensitive(m.summary));
}