/**
 * Phase 6 — Comparable-state engine.
 *
 * CURRENT STATE → FIND HISTORICALLY COMPARABLE STATES → OBSERVE WHAT HAPPENED
 * AFTERWARD → SUMMARISE THE OUTCOME DISTRIBUTION.
 *
 * Everything here is pure and deterministic. Two invariants matter most:
 *
 *  TEMPORAL INTEGRITY. `extractStateFeatures(input, t)` may only read facts
 *  timestamped at or before `t`. Outcome observation may only read facts
 *  strictly after `t`. No target-outcome event can ever appear in the feature
 *  set that produced the forecast. `forecast-leakage.test.ts` enforces this.
 *
 *  STRUCTURED COMPARISON. States are compared through operational features
 *  (activity band, issue family, recurrence, recent change, workload, script
 *  revision state) — never raw text similarity.
 *
 * Same-account history only. Cross-account comparable states are deliberately
 * deferred (see docs/COMPARABLE_STATE_ENGINE.md).
 */

import { FORECAST_CONFIG, HORIZON_DAYS, type ComparableQuality, type ComparableState, type ComparableOutcomeSummary, type ForecastHorizon, type ForecastType } from "./forecast-contract";
import { median, quantile } from "./baseline-engine";
import { ANOMALY_DAY_MS as DAY_MS } from "./anomaly-contract";

/* ------------------------------------------------------------------ */
/* Inputs — bounded operational facts (ids, classes, counts, times)     */
/* ------------------------------------------------------------------ */

export interface ForecastEventFact {
  id: string;
  type: string;
  ticketId?: string;
  atMs: number;
}

export interface ForecastTicketFact {
  id: string;
  classification?: string;
  status?: string;
  createdAtMs?: number;
  updatedAtMs?: number;
  reopened?: boolean;
  escalated?: boolean;
}

export interface ForecastChangeFact {
  id: string;
  title?: string;
  appliedAtMs?: number;
}

export interface ForecastWorkFact {
  id: string;
  kind?: string;
  label?: string;
  durationMs: number;
  startedAtMs: number;
  endedAtMs: number;
}

/** Structural facts from Phase 4 — never script source. */
export interface ForecastScriptFact {
  scriptId: string;
  title: string;
  coverage: number;
  versionCount: number;
  unresolvedCount: number;
  structuralRevisions: number;
  lastRevisionAtMs?: number;
}

export interface ForecastAnomalyFact {
  id: string;
  anomalyType: string;
  severity: string;
  confidence: string;
  state: string;
}

export interface ForecastPatternFact {
  id: string;
  patternType: string;
}

export interface ForecastInput {
  accountId: string;
  now: number;
  events: ForecastEventFact[];
  tickets: ForecastTicketFact[];
  changes: ForecastChangeFact[];
  work: ForecastWorkFact[];
  scripts?: ForecastScriptFact[];
  anomalies?: ForecastAnomalyFact[];
  patterns?: ForecastPatternFact[];
  /** Verified reusable fixes on file — evidence, never destiny (Part 21). */
  verifiedResolutions?: number;
}

/* ------------------------------------------------------------------ */
/* State features                                                       */
/* ------------------------------------------------------------------ */

export type ActivityBand = "none" | "low" | "normal" | "high";
export type WorkloadBand = "none" | "light" | "moderate" | "heavy";

export interface StateFeatures {
  /** Anchor time these features describe. */
  atMs: number;
  activityCount: number;
  activityBand: ActivityBand;
  ticketCount: number;
  workloadBand: WorkloadBand;
  /** Dominant issue classification in the family window (lowercased), or "". */
  issueFamily: string;
  familyDominant: boolean;
  recurringFamily: boolean;
  recentChange: boolean;
  reopenOrEscalation: boolean;
  scriptRevisionRecent: boolean;
  /** Longest completed session in the state window, in ms (0 when none). */
  longestSessionMs: number;
}

const WORK_EVENT_TYPES = new Set([
  "ticket.pulled",
  "ticket.status_changed",
  "ticket.completed",
  "work.started",
  "work.completed",
  "dispatch.retested",
  "dispatch.completed",
]);

function bandFromRatio(count: number, typical: number): ActivityBand {
  if (count === 0) return "none";
  if (typical <= 0) return count >= 3 ? "high" : "low";
  const r = count / typical;
  if (r >= 1.75) return "high";
  if (r >= 0.6) return "normal";
  return "low";
}

function workloadBand(count: number): WorkloadBand {
  if (count === 0) return "none";
  if (count <= 2) return "light";
  if (count <= 5) return "moderate";
  return "heavy";
}

/**
 * Reconstruct the operational state of an account AS OF `atMs`.
 * Only facts at or before `atMs` are read — this is the leakage boundary.
 */
export function extractStateFeatures(input: ForecastInput, atMs: number): StateFeatures {
  const cfg = FORECAST_CONFIG;
  const winStart = atMs - cfg.stateWindowDays * DAY_MS;
  const famStart = atMs - cfg.familyWindowDays * DAY_MS;
  const priorStart = atMs - (cfg.stateWindowDays + 28) * DAY_MS;

  const events = input.events.filter((e) => e.atMs > 0 && e.atMs <= atMs);
  const inWindow = events.filter((e) => e.atMs > winStart);
  const prior = events.filter((e) => e.atMs > priorStart && e.atMs <= winStart);
  // Typical events per state-window, from the 28 days BEFORE the window.
  const priorWeeks = Math.max(1, Math.round(28 / cfg.stateWindowDays));
  const typical = median(
    Array.from({ length: priorWeeks }, (_, i) => {
      const hi = winStart - i * cfg.stateWindowDays * DAY_MS;
      const lo = hi - cfg.stateWindowDays * DAY_MS;
      return prior.filter((e) => e.atMs > lo && e.atMs <= hi).length;
    }),
  );

  const ticketsAt = input.tickets.filter((t) => (t.createdAtMs ?? t.updatedAtMs ?? 0) <= atMs);
  const ticketsWindow = ticketsAt.filter(
    (t) => (t.createdAtMs ?? t.updatedAtMs ?? 0) > winStart,
  );
  const famTickets = ticketsAt.filter((t) => (t.createdAtMs ?? t.updatedAtMs ?? 0) > famStart);

  const counts = new Map<string, number>();
  for (const t of famTickets) {
    const c = (t.classification ?? "").trim().toLowerCase();
    if (!c) continue;
    counts.set(c, (counts.get(c) ?? 0) + 1);
  }
  let issueFamily = "";
  let familyCount = 0;
  for (const [c, n] of [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))) {
    issueFamily = c;
    familyCount = n;
    break;
  }
  const famTotal = famTickets.length;

  const recentChange = input.changes.some(
    (c) =>
      typeof c.appliedAtMs === "number" &&
      c.appliedAtMs <= atMs &&
      c.appliedAtMs > atMs - cfg.recentChangeDays * DAY_MS,
  );

  const reopenOrEscalation = ticketsAt.some(
    (t) => (t.reopened || t.escalated) && (t.updatedAtMs ?? 0) > winStart && (t.updatedAtMs ?? 0) <= atMs,
  );

  const scriptRevisionRecent = (input.scripts ?? []).some(
    (s) =>
      typeof s.lastRevisionAtMs === "number" &&
      s.lastRevisionAtMs <= atMs &&
      s.lastRevisionAtMs > atMs - cfg.stateWindowDays * DAY_MS,
  );

  const sessions = input.work.filter((w) => w.endedAtMs > 0 && w.endedAtMs <= atMs);
  const longestSessionMs = sessions
    .filter((w) => w.endedAtMs > winStart)
    .reduce((m, w) => Math.max(m, w.durationMs), 0);

  return {
    atMs,
    activityCount: inWindow.length,
    activityBand: bandFromRatio(inWindow.length, typical),
    ticketCount: ticketsWindow.length,
    workloadBand: workloadBand(ticketsWindow.length),
    issueFamily,
    familyDominant: famTotal > 0 && familyCount / famTotal >= 0.5 && familyCount >= 2,
    recurringFamily: familyCount >= 2,
    recentChange,
    reopenOrEscalation,
    scriptRevisionRecent,
    longestSessionMs,
  };
}

/* ------------------------------------------------------------------ */
/* Similarity                                                           */
/* ------------------------------------------------------------------ */

interface Dimension {
  key: string;
  weight: number;
  label: string;
  match: (a: StateFeatures, b: StateFeatures) => boolean;
}

/** Interpretable dimensions — each one is shown to the operator when matched. */
export const COMPARISON_DIMENSIONS: Dimension[] = [
  {
    key: "activity_band",
    weight: 0.24,
    label: "similar activity level vs baseline",
    match: (a, b) => a.activityBand === b.activityBand,
  },
  {
    key: "workload_band",
    weight: 0.12,
    label: "similar open workload",
    match: (a, b) => a.workloadBand === b.workloadBand,
  },
  {
    key: "issue_family",
    weight: 0.18,
    label: "same issue family",
    match: (a, b) => a.issueFamily !== "" && a.issueFamily === b.issueFamily,
  },
  {
    key: "recurrence",
    weight: 0.16,
    label: "same recurrence state",
    match: (a, b) => a.recurringFamily === b.recurringFamily,
  },
  {
    key: "recent_change",
    weight: 0.14,
    label: "same recent-change state",
    match: (a, b) => a.recentChange === b.recentChange,
  },
  {
    key: "reopen_state",
    weight: 0.09,
    label: "same reopen/escalation state",
    match: (a, b) => a.reopenOrEscalation === b.reopenOrEscalation,
  },
  {
    key: "script_state",
    weight: 0.07,
    label: "same script-revision state",
    match: (a, b) => a.scriptRevisionRecent === b.scriptRevisionRecent,
  },
];

export interface SimilarityResult {
  score: number;
  matchedOn: string[];
  quality: ComparableQuality;
}

export function compareStates(current: StateFeatures, past: StateFeatures): SimilarityResult {
  let score = 0;
  const matchedOn: string[] = [];
  for (const d of COMPARISON_DIMENSIONS) {
    if (d.match(current, past)) {
      score += d.weight;
      matchedOn.push(d.label);
    }
  }
  // Recency nudge: same operational world, not a year-old regime.
  const ageDays = (current.atMs - past.atMs) / DAY_MS;
  if (ageDays <= 30) matchedOn.push("recent history");
  const recencyFactor = ageDays <= 30 ? 1 : ageDays <= 60 ? 0.96 : 0.92;
  const rounded = Math.round(score * recencyFactor * 1000) / 1000;
  const quality: ComparableQuality =
    rounded >= FORECAST_CONFIG.strongSimilarity
      ? "strong"
      : rounded >= FORECAST_CONFIG.moderateSimilarity
        ? "moderate"
        : "weak";
  return { score: rounded, matchedOn, quality };
}

/* ------------------------------------------------------------------ */
/* Outcomes                                                             */
/* ------------------------------------------------------------------ */

export type OutcomeResult = "occurred" | "did_not_occur" | "unobserved";

/**
 * Did the target outcome occur in (atMs, atMs + horizon]?
 * Reads ONLY facts strictly after the anchor. Returns "unobserved" when the
 * window has not fully elapsed — censoring is explicit, never guessed.
 */
export function observeOutcome(
  input: ForecastInput,
  type: ForecastType,
  atMs: number,
  horizonDays: number,
  features: StateFeatures,
): OutcomeResult {
  const end = atMs + horizonDays * DAY_MS;
  if (end > input.now) return "unobserved";

  const inWindow = <T>(items: T[], at: (t: T) => number) =>
    items.filter((t) => at(t) > atMs && at(t) <= end);

  const relatedWork =
    inWindow(input.events, (e) => e.atMs).some((e) => WORK_EVENT_TYPES.has(e.type)) ||
    inWindow(input.tickets, (t) => t.createdAtMs ?? 0).length > 0;

  switch (type) {
    case "follow_up_work":
    case "post_change_follow_up":
    case "script_test_gap":
      return relatedWork ? "occurred" : "did_not_occur";

    case "escalation": {
      const hit = inWindow(input.tickets, (t) => t.updatedAtMs ?? 0).some(
        (t) => t.reopened || t.escalated,
      );
      return hit ? "occurred" : "did_not_occur";
    }

    case "recurrence": {
      if (!features.issueFamily) return "did_not_occur";
      const hit = inWindow(input.tickets, (t) => t.createdAtMs ?? 0).some(
        (t) => (t.classification ?? "").trim().toLowerCase() === features.issueFamily,
      );
      return hit ? "occurred" : "did_not_occur";
    }

    case "extended_duration": {
      // Threshold is derived ONLY from sessions completed at or before the
      // anchor, so the outcome definition cannot see its own future.
      const priorDurations = input.work
        .filter((w) => w.endedAtMs > 0 && w.endedAtMs <= atMs && w.durationMs > 0)
        .map((w) => w.durationMs);
      if (priorDurations.length < 4) return "unobserved";
      const threshold = quantile(priorDurations, 0.75);
      if (threshold <= 0) return "unobserved";
      const hit = inWindow(input.work, (w) => w.endedAtMs).some((w) => w.durationMs > threshold);
      return hit ? "occurred" : "did_not_occur";
    }

    default:
      return "unobserved";
  }
}

/* ------------------------------------------------------------------ */
/* Comparable-state search                                              */
/* ------------------------------------------------------------------ */

export interface ComparableSearchResult {
  current: StateFeatures;
  comparables: ComparableState[];
  summary: ComparableOutcomeSummary;
  /** Total anchors examined — used for the account base rate. */
  anchorsExamined: number;
  /** Days of recorded history for the account. */
  historyDays: number;
}

function firstEventMs(input: ForecastInput): number {
  let min = Number.POSITIVE_INFINITY;
  for (const e of input.events) if (e.atMs > 0 && e.atMs < min) min = e.atMs;
  for (const t of input.tickets) {
    const at = t.createdAtMs ?? t.updatedAtMs ?? 0;
    if (at > 0 && at < min) min = at;
  }
  return Number.isFinite(min) ? min : 0;
}

/**
 * Build the anchor grid, score each historical state against the current one,
 * and observe what followed. Bounded by `historyWindowDays` / `anchorStrideDays`
 * so a comparable-state search is O(anchors × facts), not a full ledger scan.
 */
export function findComparableStates(
  input: ForecastInput,
  type: ForecastType,
  horizon: ForecastHorizon,
): ComparableSearchResult {
  const cfg = FORECAST_CONFIG;
  const horizonDays = HORIZON_DAYS[horizon];
  const current = extractStateFeatures(input, input.now);

  const first = firstEventMs(input);
  const historyDays = first > 0 ? Math.floor((input.now - first) / DAY_MS) : 0;

  const oldest = Math.max(input.now - cfg.historyWindowDays * DAY_MS, first);
  const strideMs = cfg.anchorStrideDays * DAY_MS;

  const comparables: ComparableState[] = [];
  const periods = new Set<string>();
  let observedCount = 0;
  let occurredCount = 0;
  let unobservedCount = 0;
  let strongCount = 0;

  // Base rate across ALL anchors (not just comparable ones).
  let baseObserved = 0;
  let baseOccurred = 0;
  let anchorsExamined = 0;

  // The most recent anchor whose outcome window has fully elapsed.
  const lastAnchor = input.now - horizonDays * DAY_MS;

  for (let t = lastAnchor; t >= oldest; t -= strideMs) {
    anchorsExamined += 1;
    const past = extractStateFeatures(input, t);
    const outcome = observeOutcome(input, type, t, horizonDays, past);
    if (outcome !== "unobserved") {
      baseObserved += 1;
      if (outcome === "occurred") baseOccurred += 1;
    }

    const sim = compareStates(current, past);
    if (sim.score < cfg.minSimilarity) continue;

    comparables.push({
      atIso: new Date(t).toISOString(),
      similarity: sim.score,
      quality: sim.quality,
      matchedOn: sim.matchedOn,
      outcome,
    });
    periods.add(new Date(t).toISOString().slice(0, 10));
    if (sim.quality === "strong") strongCount += 1;
    if (outcome === "unobserved") unobservedCount += 1;
    else {
      observedCount += 1;
      if (outcome === "occurred") occurredCount += 1;
    }
  }

  const rate = observedCount > 0 ? occurredCount / observedCount : null;
  const baseRate = baseObserved > 0 ? baseOccurred / baseObserved : null;
  const lift = rate != null && baseRate != null && baseRate > 0 ? rate / baseRate : null;

  return {
    current,
    comparables: comparables
      .sort((a, b) => b.similarity - a.similarity || b.atIso.localeCompare(a.atIso))
      .slice(0, 24),
    summary: {
      comparableCount: comparables.length,
      observedCount,
      occurredCount,
      unobservedCount,
      distinctPeriods: periods.size,
      rate,
      baseRate,
      lift,
      strongCount,
    },
    anchorsExamined,
    historyDays,
  };
}
