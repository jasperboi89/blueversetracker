import type { AwarenessItem, AwarenessSeverity } from "./awareness";
import { formatDuration, severityRank } from "./awareness";
import type { ShiftBlocker } from "./shift-context";
import type { ShiftStatus } from "@/lib/shift";

/**
 * Intelligence Core — Focus Workspace projection (Phase 9).
 *
 * Pure and deterministic: authoritative state in, UI-ready CURRENT / NEXT /
 * WATCH / BLOCKED out. No stores, no clocks, no AI, no retrieval. This layer
 * never becomes a state owner — everything here is derived on read from the
 * Shift Working Context, Awareness, the Night Plan and tracked work.
 *
 * Privacy: labels and identifiers only. Never ticket bodies, conversations,
 * caller data, account instructions, prompts or model output.
 */

export type FocusSource =
  | "shift_context"
  | "night_plan"
  | "awareness"
  | "account_context"
  | "work"
  | "handoff";

/** Named rules — kept explicit instead of an opaque productivity score. */
export type FocusReason =
  | "MUST_PRIORITY"
  | "IMPORTANT_PRIORITY"
  | "SHIFT_END_HANDOFF"
  | "ACTIVE_WORK_FOLLOW_UP"
  | "AWARENESS_CONDITION"
  | "WAITING_RESPONSE"
  | "RECORDED_BLOCKER"
  | "ACTION_OUTCOME_UNCERTAIN";

export type FocusSeverity = AwarenessSeverity;

export type FocusEntityType =
  | "ticket"
  | "account"
  | "work"
  | "dispatch"
  | "night_plan"
  | "handoff"
  | "coverage"
  | "action";

export interface FocusEntityRef {
  type: FocusEntityType;
  id: string;
}

export interface FocusAction {
  id: string;
  label: string;
  /** Navigation and dismissal only — writes must go through the Phase 4 executor. */
  kind: "navigate" | "dismiss" | "find_similar";
  to?: string;
  params?: Record<string, string>;
  /** Awareness dedupe key, so dismissal keeps its existing semantics. */
  dedupeKey?: string;
}

export interface FocusItem {
  id: string;
  label: string;
  detail?: string;
  severity: FocusSeverity;
  source: FocusSource;
  reason: FocusReason;
  entity?: FocusEntityRef;
  actions: FocusAction[];
  /** Lower sorts first. Derived from the named rules below. */
  rank: number;
}

export interface FocusCurrent {
  kind: "ticket" | "dispatch" | "additional";
  id: string;
  label: string;
  entity: FocusEntityRef;
  accountId?: string;
  accountName?: string;
  ticketId?: string;
  running: boolean;
  elapsedMs: number;
  elapsedLabel: string;
  source: FocusSource;
  actions: FocusAction[];
}

export interface FocusShift {
  shiftKey: string;
  status: ShiftStatus;
  nearEnd: boolean;
  mustRemaining: number;
  activeTimers: number;
  unresolvedWork: number;
}

export interface FocusAccountSummary {
  accountNumber: string;
  name?: string;
  activeTickets: number;
  verifiedResolutions: number;
  coverageLabel?: string;
}

export interface FocusWorkspaceState {
  current?: FocusCurrent;
  next: FocusItem[];
  watch: FocusItem[];
  blocked: FocusItem[];
  shift: FocusShift;
  /** warning + critical only — informational items must not raise alarm. */
  actionableWatchCount: number;
  infoWatchCount: number;
  account?: FocusAccountSummary;
  generatedAt: string;
}

export const FOCUS_LIMITS = { next: 3, watch: 5, blocked: 3 } as const;

/** Tracked work as the active-work store knows it (a real session, not a view). */
export interface FocusTrackedWork {
  kind: "ticket" | "dispatch" | "additional";
  id: string;
  label: string;
  running: boolean;
  elapsedMs: number;
  to?: string;
  params?: Record<string, string>;
  accountNumber?: string;
  accountName?: string;
}

export interface FocusNightPlanItem {
  id: string;
  task: string;
  priority: "must" | "important" | "normal";
  active: boolean;
}

export interface FocusTicket {
  id: string;
  number: string;
  status: "working" | "waiting-cs" | "waiting-prog" | "completed";
  updatedAt: number;
  accountNumber: string;
}

export interface FocusSnapshot {
  now: number;
  shiftKey: string;
  shiftStatus: ShiftStatus;
  /** 0..1 across the shift window. */
  shiftProgress: number;
  /** Tracked work — null when nothing is actually being worked. */
  activeWork: FocusTrackedWork | null;
  context: {
    activeTicket?: { id: string; label?: string; accountId?: string } | undefined;
    activeAccount?: { id: string; name?: string } | undefined;
    activeDispatch?: { id: string } | undefined;
    blockers: ShiftBlocker[];
  };
  nightPlan: FocusNightPlanItem[];
  awareness: AwarenessItem[];
  tickets: FocusTicket[];
  /** Optional bounded account facts — never the whole Account Context Pack. */
  account?: FocusAccountSummary | undefined;
}

const SHIFT_END_PROGRESS = 0.8;

export function isNearShiftEnd(status: ShiftStatus, progress: number): boolean {
  if (status === "near-end") return true;
  return status === "active" && progress >= SHIFT_END_PROGRESS;
}

/** Tracked work = a started session, never a `work.opened` page view. */
function isTracked(w: FocusTrackedWork | null): w is FocusTrackedWork {
  return !!w && (w.running || w.elapsedMs > 0);
}

function navAction(
  id: string,
  label: string,
  to?: string,
  params?: Record<string, string>,
): FocusAction[] {
  if (!to) return [];
  return [{ id, label, kind: "navigate", to, params: params ?? {} }];
}

/* ---------------------------------------------------------------- */
/* CURRENT                                                           */
/* ---------------------------------------------------------------- */

function buildCurrent(s: FocusSnapshot): FocusCurrent | undefined {
  const w = s.activeWork;
  if (!isTracked(w)) return undefined;
  const entity: FocusEntityRef =
    w.kind === "ticket"
      ? { type: "ticket", id: w.id }
      : w.kind === "dispatch"
        ? { type: "dispatch", id: w.id }
        : { type: "work", id: w.id };
  const accountId = w.accountNumber || s.context.activeAccount?.id;
  return {
    kind: w.kind,
    id: w.id,
    label: w.label,
    entity,
    accountId: accountId || undefined,
    accountName: w.accountName ?? s.context.activeAccount?.name,
    ticketId: w.kind === "ticket" ? w.id : s.context.activeTicket?.id,
    running: w.running,
    elapsedMs: w.elapsedMs,
    elapsedLabel: formatDuration(w.elapsedMs),
    source: "shift_context",
    actions: [
      ...navAction(
        "open",
        w.kind === "ticket" ? "Open Ticket" : w.kind === "dispatch" ? "Open Dispatch" : "Open Work",
        w.to,
        w.params,
      ),
      ...(accountId
        ? navAction("open-account", "Open Account", "/accounts/$accountNumber", {
            accountNumber: accountId,
          })
        : []),
      { id: "find-similar", label: "Find Similar Prior Work", kind: "find_similar" },
    ],
  };
}

/* ---------------------------------------------------------------- */
/* NEXT                                                              */
/* ---------------------------------------------------------------- */

/**
 * Deterministic order:
 *   explicit Must work > active-work follow-up > important queued work
 *
 * Shift Handoff was removed as a product feature (Command Center Phase 1), so
 * the former shift-end "Prepare shift handoff" NEXT item is no longer emitted.
 * The `handoff` FocusSource / `SHIFT_END_HANDOFF` FocusReason members remain in
 * the type unions above as dormant values for rollback compatibility; nothing
 * produces them. Near-shift-end urgency is still conveyed by the Must-item and
 * follow-up rules below plus the shift status header.
 */
function buildNext(s: FocusSnapshot): FocusItem[] {
  const out: FocusItem[] = [];
  const mustItems = s.nightPlan.filter((i) => i.active && i.priority === "must");

  for (const item of mustItems) {
    out.push({
      id: `focus:np:${item.id}`,
      label: item.task,
      detail: "Night Plan · Must",
      severity: "info",
      source: "night_plan",
      reason: "MUST_PRIORITY",
      entity: { type: "night_plan", id: item.id },
      actions: navAction("open-night-plan", "Open Night Plan", "/"),
      rank: 10,
    });
  }

  const current = s.activeWork;
  if (isTracked(current) && !current.running) {
    out.push({
      id: `focus:resume:${current.id}`,
      label: `Finish ${current.label}`,
      detail: "Current work · Follow-up",
      severity: "info",
      source: "work",
      reason: "ACTIVE_WORK_FOLLOW_UP",
      entity: { type: current.kind === "dispatch" ? "dispatch" : current.kind === "ticket" ? "ticket" : "work", id: current.id },
      actions: navAction("open", "Open Work", current.to, current.params),
      rank: 20,
    });
  }

  for (const item of s.nightPlan.filter((i) => i.active && i.priority === "important")) {
    out.push({
      id: `focus:np:${item.id}`,
      label: item.task,
      detail: "Night Plan · Important",
      severity: "info",
      source: "night_plan",
      reason: "IMPORTANT_PRIORITY",
      entity: { type: "night_plan", id: item.id },
      actions: navAction("open-night-plan", "Open Night Plan", "/"),
      rank: 30,
    });
  }

  return out.sort((a, b) => a.rank - b.rank).slice(0, FOCUS_LIMITS.next);
}

/* ---------------------------------------------------------------- */
/* WATCH                                                             */
/* ---------------------------------------------------------------- */

/** Awareness conditions already represented elsewhere in Focus. */
const WATCH_EXCLUDED_TYPES = new Set(["must_items_remaining", "handoff_risk"]);

function buildWatch(s: FocusSnapshot): FocusItem[] {
  return s.awareness
    .filter((a) => !WATCH_EXCLUDED_TYPES.has(a.type))
    .map<FocusItem>((a) => ({
      id: `focus:aw:${a.id}`,
      label: a.title,
      detail: a.message,
      severity: a.severity,
      source: "awareness",
      reason: "AWARENESS_CONDITION",
      entity: a.entity ? { type: a.entity.type as FocusEntityType, id: a.entity.id } : undefined,
      actions: (a.actions ?? []).map<FocusAction>((act) => ({
        id: act.id,
        label: act.label,
        kind: act.kind,
        to: act.to,
        params: act.params,
        dedupeKey: a.dedupeKey,
      })),
      rank: 100 - severityRank(a.severity) * 10,
    }))
    .sort((x, y) => {
      const bySeverity = y.severity === x.severity ? 0 : severityRank(y.severity) - severityRank(x.severity);
      return bySeverity || x.rank - y.rank;
    })
    .slice(0, FOCUS_LIMITS.watch);
}

/* ---------------------------------------------------------------- */
/* BLOCKED                                                           */
/* ---------------------------------------------------------------- */

const WAITING_LABEL: Record<string, string> = {
  "waiting-cs": "Waiting on Customer Service",
  "waiting-prog": "Waiting on Programming",
};

function buildBlocked(s: FocusSnapshot): FocusItem[] {
  const out: FocusItem[] = [];
  // Explicit blockers win. Ticket entities they already cover are recorded so
  // the compatibility fallback below can't produce a duplicate BLOCKED row.
  const coveredTickets = new Set<string>();

  for (const b of s.context.blockers) {
    if (b.entity?.type === "ticket") coveredTickets.add(b.entity.id);
    if (b.ticketId) coveredTickets.add(b.ticketId);
    const isAction = b.entity?.type === "action";
    const entityId = b.entity?.id ?? b.ticketId;
    out.push({
      id: `focus:blk:${b.id}`,
      label: isAction ? `Action ${(entityId ?? "").slice(0, 8)}` : b.ticketId ? `Ticket ${b.ticketId}` : b.label,
      detail: b.safeLabel ?? b.label,
      severity: b.type === "action_uncertain" ? "warning" : "info",
      source: "shift_context",
      reason: b.type === "action_uncertain" ? "ACTION_OUTCOME_UNCERTAIN" : "RECORDED_BLOCKER",
      entity: b.entity
        ? { type: b.entity.type as FocusEntityType, id: b.entity.id }
        : b.ticketId
          ? { type: "ticket", id: b.ticketId }
          : undefined,
      actions: b.ticketId
        ? navAction("open", "Open Ticket", "/freshdesk-tickets/$ticketId/work", {
            ticketId: b.ticketId,
          })
        : [],
      rank: 0,
    });
  }

  // Compatibility fallback (Phase 9.5): waiting tickets are now emitted as
  // first-class blockers by the reconciler. This path only covers the moment
  // before reconciliation lands and dedupes against explicit blockers. Remove
  // once emitter coverage is verified in production use.
  for (const t of s.tickets) {
    const label = WAITING_LABEL[t.status];
    if (!label) continue;
    if (coveredTickets.has(t.id)) continue;
    out.push({
      id: `focus:wait:${t.id}`,
      label: `Ticket #${t.number}`,
      detail: label,
      severity: "info",
      source: "work",
      reason: "WAITING_RESPONSE",
      entity: { type: "ticket", id: t.id },
      actions: navAction("open", "Open Ticket", "/freshdesk-tickets/$ticketId/work", {
        ticketId: t.id,
      }),
      rank: 10,
    });
  }

  return out
    .sort((a, b) => a.rank - b.rank || b.severity.localeCompare(a.severity))
    .slice(0, FOCUS_LIMITS.blocked);
}

/* ---------------------------------------------------------------- */
/* Projection                                                        */
/* ---------------------------------------------------------------- */

export function buildFocusWorkspace(s: FocusSnapshot): FocusWorkspaceState {
  const nearEnd = isNearShiftEnd(s.shiftStatus, s.shiftProgress);
  const watch = buildWatch(s);
  return {
    current: buildCurrent(s),
    next: buildNext(s),
    watch,
    blocked: buildBlocked(s),
    shift: {
      shiftKey: s.shiftKey,
      status: s.shiftStatus,
      nearEnd,
      mustRemaining: s.nightPlan.filter((i) => i.active && i.priority === "must").length,
      activeTimers: isTracked(s.activeWork) && s.activeWork.running ? 1 : 0,
      unresolvedWork: s.tickets.filter((t) => t.status !== "completed").length,
    },
    actionableWatchCount: watch.filter((w) => w.severity !== "info").length,
    infoWatchCount: watch.filter((w) => w.severity === "info").length,
    account: s.account,
    generatedAt: new Date(s.now).toISOString(),
  };
}

/* ---------------------------------------------------------------- */
/* Copilot projection                                                */
/* ---------------------------------------------------------------- */

const COPILOT_MAX_CHARS = 900;

/** Bounded, deterministic Focus evidence for Copilot. No history, no bodies. */
export function toCopilotFocusContext(f: FocusWorkspaceState): string {
  const lines: string[] = ["FOCUS (deterministic, no model involved)"];
  lines.push(
    f.current
      ? `Current: ${f.current.label}${f.current.accountId ? ` · account ${f.current.accountId}` : ""} · ${f.current.running ? "running" : "paused"} ${f.current.elapsedLabel}`
      : "Current: no tracked work active",
  );
  lines.push(
    `Shift: ${f.shift.status}${f.shift.nearEnd ? " (near end)" : ""} · ${f.shift.mustRemaining} Must remaining · ${f.shift.unresolvedWork} unresolved`,
  );
  if (f.next.length) {
    lines.push("Next:");
    for (const n of f.next.slice(0, 3)) lines.push(`- ${n.label}${n.detail ? ` (${n.detail})` : ""}`);
  }
  if (f.watch.length) {
    lines.push("Watch:");
    for (const w of f.watch.slice(0, 3)) lines.push(`- [${w.severity}] ${w.label}`);
  }
  if (f.blocked.length) {
    lines.push("Blocked:");
    for (const b of f.blocked.slice(0, 3)) lines.push(`- ${b.label}${b.detail ? ` — ${b.detail}` : ""}`);
  }
  if (f.account) {
    lines.push(
      `Account ${f.account.accountNumber}: ${f.account.activeTickets} active ticket(s), ${f.account.verifiedResolutions} verified resolution(s)${f.account.coverageLabel ? `, ${f.account.coverageLabel}` : ""}`,
    );
  }
  const out = lines.join("\n");
  return out.length > COPILOT_MAX_CHARS ? `${out.slice(0, COPILOT_MAX_CHARS)}\n…(truncated)` : out;
}
