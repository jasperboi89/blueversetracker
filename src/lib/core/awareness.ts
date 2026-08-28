import { getShiftProgress, getShiftStatus, type ShiftStatus } from "@/lib/shift";

/**
 * Intelligence Core — Awareness 2.0 (deterministic rules).
 *
 * Everything in this file is pure: a snapshot in, awareness conditions out.
 * No stores, no clocks, no AI. Detection is rules-first; the reasoning layer
 * (Copilot) reads these items rather than re-deriving them.
 *
 * Privacy: awareness items carry entity ids plus short operational labels
 * only — never ticket bodies, notes, conversations, prompts, or caller data.
 */

export type AwarenessSeverity = "info" | "warning" | "critical";

export type AwarenessType =
  | "long_running_work"
  | "stale_waiting_ticket"
  | "must_items_remaining"
  | "work_without_timer"
  | "timer_without_work"
  | "recurring_account"
  | "handoff_risk";

export type AwarenessEntityType =
  | "ticket"
  | "account"
  | "work"
  | "dispatch"
  | "night_plan"
  | "change"
  | "coverage"
  | "handoff";

export interface AwarenessAction {
  id: string;
  label: string;
  /** Phase 3 is navigation-only. State-changing actions land with the Phase 4 executor. */
  kind: "navigate" | "dismiss";
  to?: string;
  params?: Record<string, string>;
}

export interface AwarenessItem {
  id: string;
  type: AwarenessType;
  severity: AwarenessSeverity;
  title: string;
  message: string;
  entity?: { type: AwarenessEntityType; id: string };
  createdAt: string;
  actions?: AwarenessAction[];
  dedupeKey: string;
  /** Notification cooldown — the item stays visible, re-alerting waits. */
  cooldownUntil?: string;
  /** Bumped when the condition materially worsens (drives re-alerting). */
  updatedAt: string;
}

/** A rule's output before dedupe/cooldown/dismissal state is applied. */
export interface AwarenessCondition {
  type: AwarenessType;
  severity: AwarenessSeverity;
  title: string;
  message: string;
  dedupeKey: string;
  entity?: { type: AwarenessEntityType; id: string };
  actions?: AwarenessAction[];
  /** How long to wait before re-alerting on the same condition. */
  cooldownMs?: number;
}

/* ------------------------------------------------------------------ */
/* Snapshot                                                            */
/* ------------------------------------------------------------------ */

export interface AwarenessWork {
  kind: "ticket" | "dispatch" | "additional";
  id: string;
  label: string;
  /** True only while a timer segment is actually running. */
  running: boolean;
  /** Tracked elapsed ms (banked + running segment). */
  elapsedMs: number;
  to?: string;
  params?: Record<string, string>;
  accountNumber?: string;
}

export interface AwarenessTicket {
  id: string;
  number: string;
  status: "working" | "waiting-cs" | "waiting-prog" | "completed";
  updatedAt: number;
  accountNumber: string;
}

export interface AwarenessSnapshot {
  now: number;
  shiftKey: string;
  shiftStatus: ShiftStatus;
  /** 0..1 across the 10pm–6am window. */
  shiftProgress: number;
  /** Tracked work from active-work-store — null when nothing is tracked. */
  activeWork: AwarenessWork | null;
  /**
   * Shift Working Context's view of the tracked work item. `startedAt` is only
   * set once work actually started, so `work.opened` alone can't trigger rules.
   */
  contextWorkItem?: { id: string; startedAt?: string } | undefined;
  contextTicketId?: string | undefined;
  tickets: AwarenessTicket[];
  mustItemsRemaining: number;
  recurringAccounts: Array<{ accountNumber: string; rollingCount: number }>;
}

/* ------------------------------------------------------------------ */
/* Thresholds                                                          */
/* ------------------------------------------------------------------ */

export const AWARENESS_THRESHOLDS = {
  /** Tracked work duration ladder. 2+ hours stays warning; critical is reserved for compound operational risk. */
  longWorkInfoMs: 20 * 60 * 1000,
  longWorkWarnMs: 45 * 60 * 1000,
  longWorkVeryLongMs: 120 * 60 * 1000,
  /** Waiting tickets idle beyond this are stale (matches the existing rule). */
  staleWaitingMs: 2 * 24 * 60 * 60 * 1000,

  /** "Near shift end" for Must items / handoff — the last ~20% of the window. */
  shiftEndProgress: 0.8,
  /** Most stale-waiting tickets surfaced at once (anti-spam). */
  maxStaleWaiting: 3,
  /** A timer must be running this long before a mismatch counts as real. */
  mismatchGraceMs: 60 * 1000,
  /** Default re-alert cooldown. */
  defaultCooldownMs: 15 * 60 * 1000,
} as const;

export function formatDuration(ms: number): string {
  const mins = Math.max(0, Math.round(ms / 60000));
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

const SEVERITY_RANK: Record<AwarenessSeverity, number> = {
  info: 0,
  warning: 1,
  critical: 2,
};

export function severityRank(s: AwarenessSeverity): number {
  return SEVERITY_RANK[s];
}

function workEntity(w: AwarenessWork): { type: AwarenessEntityType; id: string } {
  if (w.kind === "ticket") return { type: "ticket", id: w.id };
  if (w.kind === "dispatch") return { type: "dispatch", id: w.id };
  return { type: "work", id: w.id };
}

function openAction(w: AwarenessWork): AwarenessAction[] {
  if (!w.to) return [];
  return [
    {
      id: "open",
      label: w.kind === "ticket" ? "Open Ticket" : "Open Work",
      kind: "navigate",
      to: w.to,
      params: w.params ?? {},
    },
  ];
}

function nearShiftEnd(s: AwarenessSnapshot): boolean {
  if (s.shiftStatus === "near-end") return true;
  return s.shiftStatus === "active" && s.shiftProgress >= AWARENESS_THRESHOLDS.shiftEndProgress;
}

/** Tracked work = a real work session, not a `work.opened` view. */
function isTracked(w: AwarenessWork | null): w is AwarenessWork {
  return !!w && (w.running || w.elapsedMs > 0);
}

/* ------------------------------------------------------------------ */
/* Rules                                                               */
/* ------------------------------------------------------------------ */

function ruleLongRunningWork(s: AwarenessSnapshot): AwarenessCondition[] {
  const w = s.activeWork;
  if (!isTracked(w) || !w.running) return [];
  const ms = w.elapsedMs;
  const t = AWARENESS_THRESHOLDS;
  if (ms < t.longWorkInfoMs) return [];
  const atWarning = ms >= t.longWorkWarnMs;
  const veryLong = ms >= t.longWorkVeryLongMs;
  const severity: AwarenessSeverity = atWarning ? "warning" : "info";
  const entity = workEntity(w);
  return [
    {
      type: "long_running_work",
      severity,
      title: veryLong ? "Long-running work — extended" : "Long-running work",
      message: veryLong
        ? `${w.label} has been active for ${formatDuration(ms)}. Consider wrapping up, delegating, or documenting the next step.`
        : `${w.label} has been active for ${formatDuration(ms)}.`,
      dedupeKey: `long-work:${entity.type}:${entity.id}`,
      entity,
      actions: openAction(w),
      cooldownMs: 20 * 60 * 1000,
    },
  ];
}


function ruleStaleWaiting(s: AwarenessSnapshot): AwarenessCondition[] {
  const t = AWARENESS_THRESHOLDS;
  return s.tickets
    .filter(
      (x) =>
        (x.status === "waiting-cs" || x.status === "waiting-prog") &&
        s.now - x.updatedAt > t.staleWaitingMs,
    )
    .sort((a, b) => a.updatedAt - b.updatedAt)
    .slice(0, t.maxStaleWaiting)
    .map((x) => ({
      type: "stale_waiting_ticket" as const,
      severity: "warning" as const,
      title: "Waiting ticket is stale",
      message: `Ticket #${x.number} has been waiting for ${formatDuration(s.now - x.updatedAt)}.`,
      dedupeKey: `stale-waiting:ticket:${x.id}`,
      entity: { type: "ticket" as const, id: x.id },
      actions: [
        {
          id: "open",
          label: "Open Ticket",
          kind: "navigate" as const,
          to: "/freshdesk-tickets/$ticketId/work",
          params: { ticketId: x.id },
        },
      ],
      cooldownMs: 6 * 60 * 60 * 1000,
    }));
}

function ruleMustItems(s: AwarenessSnapshot): AwarenessCondition[] {
  if (!nearShiftEnd(s) || s.mustItemsRemaining <= 0) return [];
  const n = s.mustItemsRemaining;
  return [
    {
      type: "must_items_remaining",
      severity: "warning",
      title: "Must items remain",
      message: `${n} Must item${n === 1 ? "" : "s"} remain${n === 1 ? "s" : ""} before shift end.`,
      dedupeKey: `must-items:shift:${s.shiftKey}`,
      entity: { type: "night_plan", id: s.shiftKey },
      actions: [{ id: "open", label: "Open Night Plan", kind: "navigate", to: "/" }],
      cooldownMs: 30 * 60 * 1000,
    },
  ];
}

function ruleWorkWithoutTimer(s: AwarenessSnapshot): AwarenessCondition[] {
  const w = s.activeWork;
  // Only real tracked work counts — a view-only open never banks time.
  if (!isTracked(w) || w.running) return [];
  const entity = workEntity(w);
  return [
    {
      type: "work_without_timer",
      severity: "info",
      title: "Timer is paused",
      message: `${w.label} is still open but its timer is paused.`,
      dedupeKey: `work-no-timer:${entity.type}:${entity.id}`,
      entity,
      actions: openAction(w),
      cooldownMs: 30 * 60 * 1000,
    },
  ];
}

function ruleTimerWithoutWork(s: AwarenessSnapshot): AwarenessCondition[] {
  const w = s.activeWork;
  if (!w?.running) return [];
  const ctx = s.contextWorkItem;
  const consistent = !!ctx && ctx.id === w.id && !!ctx.startedAt;
  if (consistent) return [];
  // Grace period: the context reducer runs on the next event tick.
  if (w.elapsedMs < AWARENESS_THRESHOLDS.mismatchGraceMs) return [];
  const entity = workEntity(w);
  return [
    {
      type: "timer_without_work",
      severity: "warning",
      title: "Timer / work state mismatch",
      message: `A timer is running for ${w.label} but no matching tracked work is registered.`,
      dedupeKey: `timer-mismatch:${entity.type}:${entity.id}`,
      entity,
      actions: openAction(w),
      cooldownMs: 60 * 60 * 1000,
    },
  ];
}

function ruleRecurringAccount(s: AwarenessSnapshot): AwarenessCondition[] {
  const ticketId = s.contextTicketId ?? (s.activeWork?.kind === "ticket" ? s.activeWork.id : undefined);
  if (!ticketId) return [];
  const ticket = s.tickets.find((t) => t.id === ticketId);
  if (!ticket) return [];
  const rec = s.recurringAccounts.find((r) => r.accountNumber === ticket.accountNumber);
  if (!rec) return [];
  return [
    {
      type: "recurring_account",
      severity: "info",
      title: "Recurring account",
      message: `Account ${ticket.accountNumber} has ${rec.rollingCount} related issues in 30 days — check history before changing.`,
      dedupeKey: `recurring:account:${ticket.accountNumber}`,
      entity: { type: "account", id: ticket.accountNumber },
      actions: [
        {
          id: "open",
          label: "Open Account",
          kind: "navigate",
          to: "/accounts/$accountNumber",
          params: { accountNumber: ticket.accountNumber },
        },
      ],
      cooldownMs: 4 * 60 * 60 * 1000,
    },
  ];
}

// Shift Handoff was removed as a product feature (Command Center Phase 1). The
// former `ruleHandoffRisk` (an "Unfinished work near shift end → Open Handoff"
// alert) no longer runs. The `handoff_risk` / `handoff` type members are kept in
// the unions above as dormant, unreferenced values for rollback compatibility;
// nothing emits them. Long-running-work and Must-items rules still cover the
// genuinely useful "wrap up before shift end" signal without handoff framing.

const RULES: Array<(s: AwarenessSnapshot) => AwarenessCondition[]> = [
  ruleLongRunningWork,
  ruleStaleWaiting,
  ruleMustItems,
  ruleWorkWithoutTimer,
  ruleTimerWithoutWork,
  ruleRecurringAccount,
];

/** Run every deterministic rule. Pure — a rule throwing never kills the rest. */
export function evaluateAwareness(s: AwarenessSnapshot): AwarenessCondition[] {
  const out: AwarenessCondition[] = [];
  for (const rule of RULES) {
    try {
      out.push(...rule(s));
    } catch (err) {
      console.warn("[awareness] rule failed", err);
    }
  }
  // Stable order: severity first, then rule order.
  return out.sort((a, b) => severityRank(b.severity) - severityRank(a.severity));
}

/* ------------------------------------------------------------------ */
/* Dedupe / cooldown / dismissal                                       */
/* ------------------------------------------------------------------ */

export interface AwarenessRecord {
  firstSeenAt: string;
  lastSeenAt: string;
  /** Highest severity surfaced so far for this condition. */
  peakSeverity: AwarenessSeverity;
  /** Set when the operator dismissed it, with the severity at that moment. */
  dismissedAt?: string;
  dismissedSeverity?: AwarenessSeverity;
  /** Suppresses re-alerting (not visibility) until this time. */
  cooldownUntil?: string;
}

export interface AwarenessState {
  shiftKey: string;
  records: Record<string, AwarenessRecord>;
}

export const EMPTY_AWARENESS_STATE: AwarenessState = { shiftKey: "", records: {} };

export interface MergeResult {
  items: AwarenessItem[];
  state: AwarenessState;
}

/**
 * Fold rule output into persistent per-condition state.
 *
 * - Same dedupeKey updates the existing item (createdAt is preserved) instead
 *   of producing a second copy.
 * - Dismissal hides the condition until it materially worsens (severity rises).
 * - Conditions that stop firing drop their record, so the next genuine
 *   occurrence behaves like new.
 */
export function mergeAwareness(
  conditions: AwarenessCondition[],
  prev: AwarenessState,
  now: number,
  shiftKey: string,
): MergeResult {
  // Shift rollover wipes all shift-scoped awareness state.
  const base: AwarenessState =
    prev.shiftKey === shiftKey ? prev : { shiftKey, records: {} };
  const nowIso = new Date(now).toISOString();
  const records: Record<string, AwarenessRecord> = {};
  const items: AwarenessItem[] = [];
  const seen = new Set<string>();

  for (const c of conditions) {
    if (seen.has(c.dedupeKey)) continue;
    seen.add(c.dedupeKey);
    const old = base.records[c.dedupeKey];
    const peakSeverity: AwarenessSeverity =
      old && severityRank(old.peakSeverity) > severityRank(c.severity)
        ? old.peakSeverity
        : c.severity;

    // Dismissed: stay hidden unless the condition got worse than when dismissed.
    const escalated =
      !!old?.dismissedSeverity &&
      severityRank(c.severity) > severityRank(old.dismissedSeverity);
    if (old?.dismissedAt && !escalated) {
      records[c.dedupeKey] = { ...old, lastSeenAt: nowIso, peakSeverity };
      continue;
    }

    const cooldownMs = c.cooldownMs ?? AWARENESS_THRESHOLDS.defaultCooldownMs;
    const prevCooldown = old?.cooldownUntil ? Date.parse(old.cooldownUntil) : 0;
    // A fresh condition, or one that escalated, re-arms the alert immediately.
    const rearm = !old || old.dismissedAt || severityRank(c.severity) > severityRank(old.peakSeverity);
    const cooldownUntil = rearm
      ? new Date(now + cooldownMs).toISOString()
      : prevCooldown > now
        ? old.cooldownUntil
        : new Date(now + cooldownMs).toISOString();

    const record: AwarenessRecord = {
      firstSeenAt: old && !old.dismissedAt ? old.firstSeenAt : nowIso,
      lastSeenAt: nowIso,
      peakSeverity,
      cooldownUntil,
    };
    records[c.dedupeKey] = record;

    items.push({
      id: c.dedupeKey,
      type: c.type,
      severity: c.severity,
      title: c.title,
      message: c.message,
      entity: c.entity,
      actions: c.actions,
      dedupeKey: c.dedupeKey,
      createdAt: record.firstSeenAt,
      updatedAt: nowIso,
      cooldownUntil: rearm ? undefined : record.cooldownUntil,
    });
  }

  return { items, state: { shiftKey, records } };
}

/** Mark a condition dismissed for the current shift. */
export function dismissAwareness(
  state: AwarenessState,
  dedupeKey: string,
  severity: AwarenessSeverity,
  now: number,
): AwarenessState {
  const nowIso = new Date(now).toISOString();
  const old = state.records[dedupeKey];
  return {
    ...state,
    records: {
      ...state.records,
      [dedupeKey]: {
        firstSeenAt: old?.firstSeenAt ?? nowIso,
        lastSeenAt: nowIso,
        peakSeverity: old?.peakSeverity ?? severity,
        dismissedAt: nowIso,
        dismissedSeverity: severity,
      },
    },
  };
}

/** Convenience for callers that only have a clock. */
export function shiftFieldsFor(now: Date): { shiftStatus: ShiftStatus; shiftProgress: number } {
  return { shiftStatus: getShiftStatus(now), shiftProgress: getShiftProgress(now) };
}