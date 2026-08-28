/**
 * Phase 5 — Anomaly detectors.
 *
 * Each detector is pure and returns either an anomaly signal, an explicit
 * "insufficient_baseline" signal, or nothing at all. None of them mutate state,
 * call AI, or reach the network.
 *
 * Every description is written in deviation / temporal-association language.
 * No detector may claim a cause, and none may claim what happens next.
 */

import {
  ANOMALY_CONFIG,
  ANOMALY_DAY_MS,
  ANOMALY_SCHEMA_VERSION,
  type AnomalySeverity,
  type AnomalySignal,
  type AnomalyType,
  type AutonomyLevel,
  type InsufficientReason,
} from "./anomaly-contract";
import {
  buildBaseline,
  dailyBuckets,
  intervalsMs,
  median,
  ratioToBaseline,
  robustZ,
  type Baseline,
} from "./baseline-engine";
import type { ConfidenceClass, PatternEvidenceRef } from "./pattern-intelligence";

/* ------------------------------------------------------------------ */
/* Inputs — bounded facts only (ids, classes, timestamps, counts)       */
/* ------------------------------------------------------------------ */

export interface AnomalyEventFact {
  id: string;
  type: string;
  ticketId?: string;
  atMs: number;
}

export interface AnomalyTicketFact {
  id: string;
  classification?: string;
  status?: string;
  createdAtMs?: number;
  updatedAtMs?: number;
  reopened?: boolean;
  escalated?: boolean;
}

export interface AnomalyChangeFact {
  id: string;
  title?: string;
  appliedAtMs?: number;
}

export interface AnomalyDurationFact {
  id: string;
  label?: string;
  durationMs: number;
  atMs: number;
}

/** Structural facts from Phase 4 script analysis — never script source. */
export interface AnomalyScriptFact {
  scriptId: string;
  title: string;
  coverage: number;
  versionCount: number;
  unresolvedCount: number;
  structuralRevisions: number;
  recognitionTrend: "stable" | "improving" | "degrading";
}

export interface AnomalyInput {
  accountId: string;
  now: number;
  events: AnomalyEventFact[];
  tickets: AnomalyTicketFact[];
  changes: AnomalyChangeFact[];
  durations: AnomalyDurationFact[];
  scripts?: AnomalyScriptFact[];
}

/* ------------------------------------------------------------------ */
/* Shared builders                                                      */
/* ------------------------------------------------------------------ */

const iso = (ms: number) => new Date(ms).toISOString();
const cfg = ANOMALY_CONFIG;

function severityFromZ(z: number | null): AnomalySeverity {
  if (z == null) return "info";
  const a = Math.abs(z);
  if (a >= cfg.robustZElevated) return "elevated";
  if (a >= cfg.robustZThreshold) return "notice";
  return "info";
}

function confidenceFromBaseline(baseline: Baseline, z: number | null): ConfidenceClass {
  if (!baseline.established) return "insufficient";
  const strongHistory = baseline.summary.nonZeroCount >= cfg.minActivePeriods * 2;
  const strongSignal = z != null && Math.abs(z) >= cfg.robustZElevated;
  return strongHistory && strongSignal ? "supported" : "inferred";
}

interface SignalDraft {
  type: AnomalyType;
  accountId: string;
  now: number;
  title: string;
  description: string;
  baseline: Baseline;
  observed: number;
  z: number | null;
  windowDays: number;
  sourceCount: number;
  evidenceRefs: PatternEvidenceRef[];
  firstObservedMs: number;
  lastObservedMs: number;
  autonomy: AutonomyLevel;
  severityOverride?: AnomalySeverity;
  idSuffix?: string;
}

function anomalySignal(d: SignalDraft): AnomalySignal {
  return {
    id: `anom:${d.type}:${d.accountId}${d.idSuffix ? `:${d.idSuffix}` : ""}`,
    schemaVersion: ANOMALY_SCHEMA_VERSION,
    anomalyType: d.type,
    accountId: d.accountId,
    state: "anomaly",
    title: d.title,
    description: d.description,
    baseline: d.baseline.summary,
    deviation: {
      observed: d.observed,
      robustZ: d.z,
      ratio: ratioToBaseline(d.observed, d.baseline),
    },
    severity: d.severityOverride ?? severityFromZ(d.z),
    confidence: confidenceFromBaseline(d.baseline, d.z),
    windowDays: d.windowDays,
    sourceCount: d.sourceCount,
    evidenceRefs: d.evidenceRefs,
    autonomy: d.autonomy,
    firstObservedAt: iso(d.firstObservedMs),
    lastObservedAt: iso(d.lastObservedMs),
    generatedAt: iso(d.now),
    recalcAfterMs: cfg.recalcAfterMs,
  };
}

/**
 * The first-class "still learning" signal. This is NOT an anomaly: severity is
 * always info, confidence is always insufficient, and autonomy never exceeds
 * observe.
 */
function insufficientSignal(args: {
  type: AnomalyType;
  accountId: string;
  now: number;
  baseline: Baseline;
  reason: InsufficientReason;
  observed?: number;
  windowDays: number;
  detail: string;
  idSuffix?: string;
}): AnomalySignal {
  return {
    id: `anom:${args.type}:${args.accountId}${args.idSuffix ? `:${args.idSuffix}` : ""}`,
    schemaVersion: ANOMALY_SCHEMA_VERSION,
    anomalyType: args.type,
    accountId: args.accountId,
    state: "insufficient_baseline",
    title: `Baseline forming — ${args.baseline.summary.metric}`,
    description: args.detail,
    baseline: args.baseline.summary,
    deviation: { observed: args.observed ?? 0, robustZ: null, ratio: null },
    insufficientReason: args.reason,
    severity: "info",
    confidence: "insufficient",
    windowDays: args.windowDays,
    sourceCount: args.baseline.summary.nonZeroCount,
    evidenceRefs: [{ type: "account", id: args.accountId }],
    autonomy: "observe",
    firstObservedAt: iso(args.now),
    lastObservedAt: iso(args.now),
    generatedAt: iso(args.now),
    recalcAfterMs: cfg.recalcAfterMs,
  };
}

/* ------------------------------------------------------------------ */
/* 1. Activity spike                                                    */
/* ------------------------------------------------------------------ */

export function detectActivitySpike(input: AnomalyInput): AnomalySignal[] {
  const times = input.events.map((e) => e.atMs);
  const buckets = dailyBuckets(times, input.now, cfg.baselineWindowDays);
  const observed = buckets[buckets.length - 1] ?? 0;
  const history = buckets.slice(0, -1);
  const baseline = buildBaseline(history, {
    metric: "events/day",
    windowDays: cfg.baselineWindowDays,
  });

  if (!baseline.established) {
    return [
      insufficientSignal({
        type: "activity_spike",
        accountId: input.accountId,
        now: input.now,
        baseline,
        reason: baseline.reason ?? "too_few_samples",
        observed,
        windowDays: cfg.baselineWindowDays,
        detail: `Daily activity for this account cannot be compared yet: ${baseline.summary.nonZeroCount} active day(s) across ${baseline.summary.sampleCount} recorded. Activity is being counted, but no deviation is being claimed.`,
      }),
    ];
  }

  const z = robustZ(observed, baseline);
  if (z == null || z < cfg.robustZThreshold || observed < cfg.minSpikeCount) return [];

  const todayEvents = input.events.filter((e) => input.now - e.atMs <= ANOMALY_DAY_MS);
  const evidence: PatternEvidenceRef[] = [
    { type: "account", id: input.accountId },
    ...uniqueTicketRefs(todayEvents).slice(0, 8),
  ];
  return [
    anomalySignal({
      type: "activity_spike",
      accountId: input.accountId,
      now: input.now,
      title: `Activity above baseline (${observed} today vs ${baseline.summary.median} typical)`,
      description: `Deviation: ${observed} recorded events in the last 24 hours against a typical ${baseline.summary.median}/day over ${baseline.summary.sampleCount} days (robust score ${z}). This describes volume only — it does not explain why.`,
      baseline,
      observed,
      z,
      windowDays: cfg.baselineWindowDays,
      sourceCount: observed,
      evidenceRefs: evidence,
      firstObservedMs: input.now - ANOMALY_DAY_MS,
      lastObservedMs: input.now,
      autonomy: "explain",
    }),
  ];
}

function uniqueTicketRefs(events: AnomalyEventFact[]): PatternEvidenceRef[] {
  const seen = new Set<string>();
  const out: PatternEvidenceRef[] = [];
  for (const e of events) {
    if (!e.ticketId || seen.has(e.ticketId)) continue;
    seen.add(e.ticketId);
    out.push({ type: "ticket", id: e.ticketId });
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* 2. Issue concentration                                               */
/* ------------------------------------------------------------------ */

export function detectIssueConcentration(input: AnomalyInput): AnomalySignal[] {
  const ticketTime = (t: AnomalyTicketFact) => t.createdAtMs ?? t.updatedAtMs ?? 0;
  const recentCutoff = input.now - cfg.concentrationWindowDays * ANOMALY_DAY_MS;
  const priorCutoff = input.now - cfg.concentrationPriorDays * ANOMALY_DAY_MS;

  const recent = input.tickets.filter((t) => ticketTime(t) >= recentCutoff && !!t.classification);
  const prior = input.tickets.filter((t) => {
    const at = ticketTime(t);
    return at >= priorCutoff && at < recentCutoff && !!t.classification;
  });

  const baseline = buildBaseline(prior.length ? [prior.length] : [], {
    metric: "share of tickets by classification",
    windowDays: cfg.concentrationPriorDays,
    minSamples: 1,
    minActivePeriods: 1,
    allSamplesActive: true,
  });
  // Share comparisons need a prior period with real volume.
  if (prior.length < cfg.concentrationMinPriorTickets) {
    return [
      insufficientSignal({
        type: "issue_concentration",
        accountId: input.accountId,
        now: input.now,
        baseline,
        reason: prior.length === 0 ? "no_prior_history" : "too_few_samples",
        observed: recent.length,
        windowDays: cfg.concentrationWindowDays,
        detail: `Only ${prior.length} classified ticket(s) exist in the prior ${cfg.concentrationPriorDays} days, so a normal mix for this account is not established. Recent classifications are recorded but not compared.`,
      }),
    ];
  }
  if (recent.length < cfg.concentrationMinTickets) return [];

  const counts = groupCount(recent.map((t) => t.classification!.trim().toLowerCase()));
  const priorCounts = groupCount(prior.map((t) => t.classification!.trim().toLowerCase()));
  const [topKey, topCount] = topEntry(counts);
  if (!topKey) return [];

  const share = topCount / recent.length;
  const priorShare = (priorCounts.get(topKey) ?? 0) / prior.length;
  if (share < cfg.concentrationDominance) return [];
  if (priorShare > 0 && share < priorShare * cfg.concentrationLift) return [];

  const label =
    recent.find((t) => t.classification!.trim().toLowerCase() === topKey)?.classification ?? topKey;
  const group = recent.filter((t) => t.classification!.trim().toLowerCase() === topKey);
  const times = group.map(ticketTime).filter(Boolean);

  return [
    anomalySignal({
      type: "issue_concentration",
      accountId: input.accountId,
      now: input.now,
      idSuffix: topKey,
      title: `"${label}" is dominating recent tickets`,
      description: `Deviation in mix: ${topCount} of ${recent.length} tickets in the last ${cfg.concentrationWindowDays} days are classified "${label}" (${pct(share)}), against ${pct(priorShare)} over the prior ${cfg.concentrationPriorDays} days. A shift in composition, not a diagnosis.`,
      baseline,
      observed: topCount,
      z: null,
      windowDays: cfg.concentrationWindowDays,
      sourceCount: topCount,
      evidenceRefs: group.slice(0, 10).map((t) => ({ type: "ticket" as const, id: t.id })),
      firstObservedMs: times.length ? Math.min(...times) : input.now,
      lastObservedMs: times.length ? Math.max(...times) : input.now,
      autonomy: "explain",
      severityOverride: share >= 0.8 ? "elevated" : "notice",
    }),
  ];
}

/* ------------------------------------------------------------------ */
/* 3. Quiet → active shift                                              */
/* ------------------------------------------------------------------ */

export function detectQuietToActive(input: AnomalyInput): AnomalySignal[] {
  const times = input.events.map((e) => e.atMs).filter(Number.isFinite);
  if (times.length === 0) return [];

  const dayAgo = input.now - ANOMALY_DAY_MS;
  const recent = times.filter((t) => t >= dayAgo);
  const older = times.filter((t) => t < dayAgo);

  const baseline = buildBaseline(older.length ? [older.length] : [], {
    metric: "days since previous activity",
    windowDays: cfg.baselineWindowDays,
    minSamples: 1,
    minActivePeriods: 1,
    allSamplesActive: true,
  });

  if (older.length === 0) {
    return [
      insufficientSignal({
        type: "quiet_to_active",
        accountId: input.accountId,
        now: input.now,
        baseline,
        reason: "no_prior_history",
        observed: recent.length,
        windowDays: cfg.quietDays,
        detail:
          "This is the first recorded activity for the account, so there is no quiet period to compare it against.",
      }),
    ];
  }

  if (recent.length < cfg.quietReactivationMin) return [];
  const lastBefore = Math.max(...older);
  const quietDays = Math.floor((dayAgo - lastBefore) / ANOMALY_DAY_MS);
  if (quietDays < cfg.quietDays) return [];

  return [
    anomalySignal({
      type: "quiet_to_active",
      accountId: input.accountId,
      now: input.now,
      title: `Account active again after ${quietDays} quiet days`,
      description: `State change: ${recent.length} events in the last 24 hours following ${quietDays} days with no recorded activity. Worth a look because the account's behavior changed, not because anything is known to be wrong.`,
      baseline,
      observed: recent.length,
      z: null,
      windowDays: quietDays,
      sourceCount: recent.length,
      evidenceRefs: [
        { type: "account", id: input.accountId },
        ...uniqueTicketRefs(input.events.filter((e) => e.atMs >= dayAgo)).slice(0, 6),
      ],
      firstObservedMs: lastBefore,
      lastObservedMs: input.now,
      autonomy: "explain",
      severityOverride: "notice",
    }),
  ];
}

/* ------------------------------------------------------------------ */
/* 4. Duration anomaly                                                  */
/* ------------------------------------------------------------------ */

export function detectDurationAnomaly(input: AnomalyInput): AnomalySignal[] {
  const samples = [...input.durations]
    .filter((d) => Number.isFinite(d.durationMs) && d.durationMs > 0)
    .sort((a, b) => a.atMs - b.atMs);
  if (samples.length === 0) return [];

  const latest = samples[samples.length - 1]!;
  const history = samples.slice(0, -1).map((d) => d.durationMs / 60000);
  const baseline = buildBaseline(history, {
    metric: "work session minutes",
    windowDays: cfg.baselineWindowDays,
    minSamples: cfg.durationMinSamples,
    minActivePeriods: cfg.durationMinSamples,
    allSamplesActive: true,
  });

  if (!baseline.established) {
    return [
      insufficientSignal({
        type: "duration_anomaly",
        accountId: input.accountId,
        now: input.now,
        baseline,
        reason: baseline.reason ?? "too_few_samples",
        observed: Math.round(latest.durationMs / 60000),
        windowDays: cfg.baselineWindowDays,
        detail: `${history.length} completed work session(s) recorded for this account; ${cfg.durationMinSamples} are needed before a typical duration can be established.`,
      }),
    ];
  }

  const observed = Math.round(latest.durationMs / 60000);
  const z = robustZ(observed, baseline);
  if (z == null || Math.abs(z) < cfg.robustZThreshold) return [];

  const direction = z > 0 ? "longer" : "shorter";
  return [
    anomalySignal({
      type: "duration_anomaly",
      accountId: input.accountId,
      now: input.now,
      title: `Work session ran ${direction} than usual (${observed} min)`,
      description: `Deviation: the most recent session took ${observed} minutes against a typical ${baseline.summary.median} minutes across ${baseline.summary.sampleCount} sessions (robust score ${z}). Duration only — it says nothing about the quality of the work.`,
      baseline,
      observed,
      z,
      windowDays: cfg.baselineWindowDays,
      sourceCount: samples.length,
      evidenceRefs: [{ type: "work", id: latest.id }],
      firstObservedMs: latest.atMs,
      lastObservedMs: latest.atMs,
      autonomy: "observe",
    }),
  ];
}

/* ------------------------------------------------------------------ */
/* 5. Reopen / escalation drift                                         */
/* ------------------------------------------------------------------ */

export function detectReopenEscalationDrift(input: AnomalyInput): AnomalySignal[] {
  const at = (t: AnomalyTicketFact) => t.updatedAtMs ?? t.createdAtMs ?? 0;
  const flagged = input.tickets.filter((t) => t.reopened || t.escalated);
  const recentCutoff = input.now - cfg.driftWindowDays * ANOMALY_DAY_MS;
  const priorCutoff = input.now - (cfg.driftWindowDays + cfg.driftPriorDays) * ANOMALY_DAY_MS;

  const recent = flagged.filter((t) => at(t) >= recentCutoff);
  const priorAll = input.tickets.filter((t) => at(t) >= priorCutoff && at(t) < recentCutoff);
  const priorFlagged = flagged.filter((t) => at(t) >= priorCutoff && at(t) < recentCutoff);

  const baseline = buildBaseline(priorAll.length ? [priorFlagged.length] : [], {
    metric: "reopen/escalation rate",
    windowDays: cfg.driftPriorDays,
    minSamples: 1,
    minActivePeriods: 1,
    allSamplesActive: true,
  });

  if (priorAll.length === 0) {
    return [
      insufficientSignal({
        type: "reopen_escalation_drift",
        accountId: input.accountId,
        now: input.now,
        baseline,
        reason: "no_prior_history",
        observed: recent.length,
        windowDays: cfg.driftWindowDays,
        detail: `No ticket history in the prior ${cfg.driftPriorDays} days, so a normal reopen/escalation rate for this account is not established.`,
      }),
    ];
  }
  if (recent.length < cfg.driftMinRecent) return [];

  const recentRate = recent.length / cfg.driftWindowDays;
  const priorRate = priorFlagged.length / cfg.driftPriorDays;
  if (priorRate > 0 && recentRate < priorRate * cfg.driftRateRatio) return [];

  const times = recent.map(at).filter(Boolean);
  return [
    anomalySignal({
      type: "reopen_escalation_drift",
      accountId: input.accountId,
      now: input.now,
      title: `Reopens/escalations rising (${recent.length} in ${cfg.driftWindowDays} days)`,
      description: `Deviation in rate: ${recent.length} reopened or escalated ticket(s) in the last ${cfg.driftWindowDays} days versus ${priorFlagged.length} across the prior ${cfg.driftPriorDays} days. A drift in outcomes worth reviewing; the reasons are not established here.`,
      baseline,
      observed: recent.length,
      z: null,
      windowDays: cfg.driftWindowDays,
      sourceCount: recent.length,
      evidenceRefs: recent.slice(0, 10).map((t) => ({ type: "ticket" as const, id: t.id })),
      firstObservedMs: times.length ? Math.min(...times) : input.now,
      lastObservedMs: times.length ? Math.max(...times) : input.now,
      autonomy: "recommend",
      severityOverride: "elevated",
    }),
  ];
}

/* ------------------------------------------------------------------ */
/* 6. Recurrence acceleration                                           */
/* ------------------------------------------------------------------ */

export function detectRecurrenceAcceleration(input: AnomalyInput): AnomalySignal[] {
  const at = (t: AnomalyTicketFact) => t.createdAtMs ?? t.updatedAtMs ?? 0;
  const groups = new Map<string, AnomalyTicketFact[]>();
  for (const t of input.tickets) {
    const key = (t.classification ?? "").trim().toLowerCase();
    if (!key || !at(t)) continue;
    const list = groups.get(key) ?? [];
    list.push(t);
    groups.set(key, list);
  }

  const out: AnomalySignal[] = [];
  for (const [key, group] of groups) {
    const times = group.map(at).sort((a, b) => a - b);
    const gaps = intervalsMs(times);
    const baseline = buildBaseline(
      gaps.map((g) => g / ANOMALY_DAY_MS),
      {
        metric: "days between recurrences",
        windowDays: cfg.baselineWindowDays,
        minSamples: cfg.recurrenceMinIntervals,
        minActivePeriods: cfg.recurrenceMinIntervals,
        allSamplesActive: true,
      },
    );

    if (gaps.length < cfg.recurrenceMinIntervals) {
      // Only report the gap for classifications that are actually recurring.
      if (gaps.length >= 2) {
        out.push(
          insufficientSignal({
            type: "recurrence_acceleration",
            accountId: input.accountId,
            now: input.now,
            idSuffix: key,
            baseline,
            reason: "too_few_samples",
            observed: gaps.length,
            windowDays: cfg.baselineWindowDays,
            detail: `"${group[0]!.classification}" has recurred ${group.length} times; ${cfg.recurrenceMinIntervals + 1} occurrences are needed before a typical interval can be established.`,
          }),
        );
      }
      continue;
    }

    const historical = median(gaps.slice(0, -1).map((g) => g / ANOMALY_DAY_MS));
    const latest = gaps[gaps.length - 1]! / ANOMALY_DAY_MS;
    if (historical <= 0) continue;
    if (latest > historical * cfg.recurrenceAccelerationRatio) continue;

    out.push(
      anomalySignal({
        type: "recurrence_acceleration",
        accountId: input.accountId,
        now: input.now,
        idSuffix: key,
        title: `"${group[0]!.classification}" is recurring faster`,
        description: `Deviation in interval: the latest gap between "${group[0]!.classification}" tickets was ${latest.toFixed(1)} days against a typical ${historical.toFixed(1)} days over ${gaps.length} intervals. The spacing has tightened; whether it continues is unknown.`,
        baseline,
        observed: Number(latest.toFixed(2)),
        z: null,
        windowDays: cfg.baselineWindowDays,
        sourceCount: group.length,
        evidenceRefs: group.slice(-8).map((t) => ({ type: "ticket" as const, id: t.id })),
        firstObservedMs: times[0]!,
        lastObservedMs: times[times.length - 1]!,
        autonomy: "explain",
        severityOverride: "notice",
      }),
    );
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* 7. Post-change activity                                              */
/* ------------------------------------------------------------------ */

export function detectPostChangeActivity(input: AnomalyInput): AnomalySignal[] {
  const buckets = dailyBuckets(
    input.events.map((e) => e.atMs),
    input.now,
    cfg.baselineWindowDays,
  );
  const baseline = buildBaseline(buckets, {
    metric: "events/day around changes",
    windowDays: cfg.baselineWindowDays,
  });

  const lookbackCutoff = input.now - cfg.postChangeLookbackDays * ANOMALY_DAY_MS;
  const changes = input.changes.filter(
    (c) => typeof c.appliedAtMs === "number" && c.appliedAtMs >= lookbackCutoff,
  );
  if (changes.length === 0) return [];

  if (!baseline.established) {
    return [
      insufficientSignal({
        type: "post_change_activity",
        accountId: input.accountId,
        now: input.now,
        baseline,
        reason: baseline.reason ?? "too_few_samples",
        windowDays: cfg.postChangeWindowDays,
        detail: `A change was applied recently, but this account has no established daily activity level to compare the following days against. The window is recorded, not judged.`,
      }),
    ];
  }

  const out: AnomalySignal[] = [];
  const expected = baseline.summary.median * cfg.postChangeWindowDays;
  for (const change of changes) {
    const start = change.appliedAtMs!;
    const end = start + cfg.postChangeWindowDays * ANOMALY_DAY_MS;
    const after = input.events.filter((e) => e.atMs >= start && e.atMs <= end);
    if (after.length < cfg.postChangeMinCount) continue;
    if (expected > 0 && after.length < expected * cfg.postChangeMultiplier) continue;

    out.push(
      anomalySignal({
        type: "post_change_activity",
        accountId: input.accountId,
        now: input.now,
        idSuffix: change.id,
        // Timing statement ONLY.
        title: `Activity above baseline in the ${cfg.postChangeWindowDays} days after a change`,
        description: `Temporal association: ${after.length} events were recorded within ${cfg.postChangeWindowDays} days after "${change.title ?? change.id}" was applied, against roughly ${expected.toFixed(1)} expected from this account's typical daily level. This is timing and volume only — it does not establish that the change produced the activity.`,
        baseline,
        observed: after.length,
        z: robustZ(after.length / cfg.postChangeWindowDays, baseline),
        windowDays: cfg.postChangeWindowDays,
        sourceCount: after.length,
        evidenceRefs: [
          { type: "change", id: change.id },
          ...uniqueTicketRefs(after).slice(0, 8),
        ],
        firstObservedMs: start,
        lastObservedMs: Math.min(end, input.now),
        autonomy: "recommend",
        severityOverride: "notice",
      }),
    );
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* 8. Script structure drift (gated on recognition coverage)            */
/* ------------------------------------------------------------------ */

export function detectScriptStructureDrift(input: AnomalyInput): AnomalySignal[] {
  const out: AnomalySignal[] = [];
  for (const s of input.scripts ?? []) {
    const baseline = buildBaseline([s.versionCount], {
      metric: "recorded script versions",
      windowDays: cfg.baselineWindowDays,
      minSamples: 1,
      minActivePeriods: 1,
      allSamplesActive: true,
    });

    // HARD GATE: a partial structural reading may never become an anomaly.
    if (s.coverage < cfg.scriptMinCoverage) {
      out.push(
        insufficientSignal({
          type: "script_structure_drift",
          accountId: input.accountId,
          now: input.now,
          idSuffix: s.scriptId,
          baseline,
          reason: "coverage_below_threshold",
          observed: s.unresolvedCount,
          windowDays: cfg.baselineWindowDays,
          detail: `"${s.title}" is analysed at ${Math.round(s.coverage * 100)}% structural coverage, below the ${Math.round(cfg.scriptMinCoverage * 100)}% needed to call a structural change unusual. No structural anomaly is being claimed.`,
        }),
      );
      continue;
    }
    if (s.versionCount < cfg.scriptMinVersions) {
      out.push(
        insufficientSignal({
          type: "script_structure_drift",
          accountId: input.accountId,
          now: input.now,
          idSuffix: s.scriptId,
          baseline,
          reason: "too_few_samples",
          observed: s.structuralRevisions,
          windowDays: cfg.baselineWindowDays,
          detail: `"${s.title}" has ${s.versionCount} recorded version(s); ${cfg.scriptMinVersions} are needed before structural change can be compared to a norm.`,
        }),
      );
      continue;
    }
    if (s.recognitionTrend !== "degrading" && s.unresolvedCount === 0) continue;

    out.push(
      anomalySignal({
        type: "script_structure_drift",
        accountId: input.accountId,
        now: input.now,
        idSuffix: s.scriptId,
        title: `"${s.title}": structure drifting from its recorded shape`,
        description: `Deviation in structure: ${s.unresolvedCount} unresolved target(s) across ${s.structuralRevisions} structural revision(s), recognition trend ${s.recognitionTrend}, at ${Math.round(s.coverage * 100)}% coverage. Structural reading only — no runtime behavior is asserted.`,
        baseline,
        observed: s.unresolvedCount,
        z: null,
        windowDays: cfg.baselineWindowDays,
        sourceCount: s.structuralRevisions,
        evidenceRefs: [{ type: "change", id: s.scriptId }],
        firstObservedMs: input.now,
        lastObservedMs: input.now,
        autonomy: "explain",
        severityOverride: s.unresolvedCount >= 3 ? "elevated" : "notice",
      }),
    );
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Helpers                                                              */
/* ------------------------------------------------------------------ */

function groupCount(keys: string[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const k of keys) m.set(k, (m.get(k) ?? 0) + 1);
  return m;
}

function topEntry(m: Map<string, number>): [string | undefined, number] {
  let bestKey: string | undefined;
  let best = 0;
  for (const [k, v] of m) {
    if (v > best || (v === best && bestKey !== undefined && k < bestKey)) {
      bestKey = k;
      best = v;
    }
  }
  return [bestKey, best];
}

function pct(v: number): string {
  return `${Math.round(v * 100)}%`;
}

export const ANOMALY_DETECTORS: Array<(i: AnomalyInput) => AnomalySignal[]> = [
  detectActivitySpike,
  detectIssueConcentration,
  detectQuietToActive,
  detectDurationAnomaly,
  detectReopenEscalationDrift,
  detectRecurrenceAcceleration,
  detectPostChangeActivity,
  detectScriptStructureDrift,
];
