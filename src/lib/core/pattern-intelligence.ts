/**
 * Pattern Intelligence engine (Phase 3, Part 5) — conservative, deterministic,
 * interpretable. This is NOT predictive modeling and NOT causal inference.
 *
 * It detects interpretable REPETITION and TEMPORAL ASSOCIATION over the durable
 * ledger + canonical facts, and describes them in strictly non-causal language.
 * Every observation is pure output of the inputs (same in → same out) and
 * carries its supporting evidence, a confidence CLASS (not an invented
 * probability), a window, and a recalculation horizon.
 *
 * LANGUAGE CONTRACT (enforced by tests): observations never say "caused",
 * "will happen again", or "root cause". Temporal proximity is described as
 * "occurred after" / "temporal association", repetition as "recurring" /
 * "observed pattern", and resolutions as "relevant previous resolution".
 */

export const CONFIDENCE_CLASSES = ["verified", "supported", "inferred", "insufficient"] as const;
export type ConfidenceClass = (typeof CONFIDENCE_CLASSES)[number];

export const PATTERN_TYPES = [
  "repeated_issue",
  "repeated_work",
  "change_incident_proximity",
  "resolution_reuse",
  "escalation",
  "reopen",
] as const;
export type PatternType = (typeof PATTERN_TYPES)[number];

export type PatternSeverity = "info" | "notice" | "elevated";

export type PatternEvidenceType = "ticket" | "account" | "work" | "change" | "resolution" | "event";

export interface PatternEvidenceRef {
  type: PatternEvidenceType;
  id: string;
}

export interface PatternObservation {
  id: string;
  schemaVersion: number;
  patternType: PatternType;
  accountId: string;
  title: string;
  /** Careful, non-causal description. */
  description: string;
  windowDays: number;
  supportingEventIds: string[];
  sourceCount: number;
  evidenceRefs: PatternEvidenceRef[];
  confidence: ConfidenceClass;
  firstObservedAt: string;
  lastObservedAt: string;
  severity: PatternSeverity;
  /** Recalculate/expire after this many ms from generatedAt. */
  recalcAfterMs: number;
  generatedAt: string;
}

export const PATTERN_SCHEMA_VERSION = 1;

/** Tunable, documented thresholds — conservative by default. */
export const PATTERN_CONFIG = {
  repeatedIssueWindowDays: 90,
  repeatedIssueMin: 3,
  repeatedWorkWindowDays: 30,
  repeatedWorkMin: 3,
  /** Incidents opened within this many days AFTER a change → temporal association only. */
  changeProximityDays: 3,
  resolutionReuseWindowDays: 120,
  resolutionReuseMin: 2,
  escalationWindowDays: 45,
  escalationMin: 2,
  reopenWindowDays: 60,
  reopenMin: 2,
  recalcAfterMs: 6 * 60 * 60 * 1000,
} as const;

const DAY_MS = 24 * 60 * 60 * 1000;

/* ------------------------------------------------------------------ */
/* Inputs — bounded facts, ids/labels/timestamps only                  */
/* ------------------------------------------------------------------ */

export interface PatternLedgerRef {
  id: string;
  type: string;
  ticketId?: string;
  workItemId?: string;
  atMs: number;
}

export interface PatternTicketFact {
  id: string;
  number?: string;
  status: string;
  classification?: string;
  createdAtMs?: number;
  updatedAtMs?: number;
  reopened?: boolean;
  escalated?: boolean;
}

export interface PatternChangeFact {
  id: string;
  title?: string;
  appliedAtMs?: number;
}

export interface PatternWorkFact {
  id: string;
  kind?: string;
  label?: string;
  atMs?: number;
}

export interface PatternResolutionFact {
  id: string;
  affectedArea?: string;
  confidence: string;
  /** How many times this resolution has been matched/reused (from ledger/UI). */
  reuseCount?: number;
  lastUsedAtMs?: number;
}

export interface PatternInput {
  accountId: string;
  now: number;
  ledger: PatternLedgerRef[];
  tickets: PatternTicketFact[];
  changes: PatternChangeFact[];
  work: PatternWorkFact[];
  resolutions: PatternResolutionFact[];
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

const iso = (ms: number) => new Date(ms).toISOString();
const within = (ms: number | undefined, now: number, days: number) =>
  typeof ms === "number" && now - ms >= 0 && now - ms <= days * DAY_MS;

const SEVERITY_RANK: Record<PatternSeverity, number> = { elevated: 0, notice: 1, info: 2 };
const CONF_RANK: Record<ConfidenceClass, number> = {
  verified: 0,
  supported: 1,
  inferred: 2,
  insufficient: 3,
};

/* ------------------------------------------------------------------ */
/* Detectors                                                           */
/* ------------------------------------------------------------------ */

function detectRepeatedIssue(input: PatternInput): PatternObservation[] {
  const cfg = PATTERN_CONFIG;
  const recent = input.tickets.filter((t) =>
    within(t.createdAtMs ?? t.updatedAtMs, input.now, cfg.repeatedIssueWindowDays),
  );
  const groups = new Map<string, PatternTicketFact[]>();
  for (const t of recent) {
    const key = (t.classification ?? "").trim().toLowerCase();
    if (!key) continue;
    (groups.get(key) ?? groups.set(key, []).get(key)!).push(t);
  }
  const out: PatternObservation[] = [];
  for (const [key, group] of groups) {
    if (group.length < cfg.repeatedIssueMin) continue;
    const times = group.map((t) => t.createdAtMs ?? t.updatedAtMs ?? input.now);
    out.push({
      id: `pat:repeated_issue:${input.accountId}:${key}`,
      schemaVersion: PATTERN_SCHEMA_VERSION,
      patternType: "repeated_issue",
      accountId: input.accountId,
      title: `Recurring "${group[0]!.classification}" issues`,
      description: `Observed pattern: ${group.length} tickets classified "${group[0]!.classification}" in the last ${cfg.repeatedIssueWindowDays} days. Recurring behavior worth investigating — not a diagnosis of a single cause.`,
      windowDays: cfg.repeatedIssueWindowDays,
      supportingEventIds: [],
      sourceCount: group.length,
      evidenceRefs: group.map((t) => ({ type: "ticket" as const, id: t.id })),
      confidence: "supported",
      firstObservedAt: iso(Math.min(...times)),
      lastObservedAt: iso(Math.max(...times)),
      severity: group.length >= cfg.repeatedIssueMin + 2 ? "elevated" : "notice",
      recalcAfterMs: cfg.recalcAfterMs,
      generatedAt: iso(input.now),
    });
  }
  return out;
}

function detectRepeatedWork(input: PatternInput): PatternObservation[] {
  const cfg = PATTERN_CONFIG;
  const recent = input.work.filter((w) => within(w.atMs, input.now, cfg.repeatedWorkWindowDays));
  const groups = new Map<string, PatternWorkFact[]>();
  for (const w of recent) {
    const key = (w.kind ?? "").trim().toLowerCase();
    if (!key) continue;
    (groups.get(key) ?? groups.set(key, []).get(key)!).push(w);
  }
  const out: PatternObservation[] = [];
  for (const [key, group] of groups) {
    if (group.length < cfg.repeatedWorkMin) continue;
    const times = group.map((w) => w.atMs ?? input.now);
    out.push({
      id: `pat:repeated_work:${input.accountId}:${key}`,
      schemaVersion: PATTERN_SCHEMA_VERSION,
      patternType: "repeated_work",
      accountId: input.accountId,
      title: `Recurring ${group[0]!.kind ?? "work"} on this account`,
      description: `Observed pattern: ${group.length} "${group[0]!.kind}" work items in the last ${cfg.repeatedWorkWindowDays} days.`,
      windowDays: cfg.repeatedWorkWindowDays,
      supportingEventIds: [],
      sourceCount: group.length,
      evidenceRefs: group.map((w) => ({ type: "work" as const, id: w.id })),
      confidence: "supported",
      firstObservedAt: iso(Math.min(...times)),
      lastObservedAt: iso(Math.max(...times)),
      severity: "notice",
      recalcAfterMs: cfg.recalcAfterMs,
      generatedAt: iso(input.now),
    });
  }
  return out;
}

function detectChangeIncidentProximity(input: PatternInput): PatternObservation[] {
  const cfg = PATTERN_CONFIG;
  const out: PatternObservation[] = [];
  for (const change of input.changes) {
    if (typeof change.appliedAtMs !== "number") continue;
    const windowEnd = change.appliedAtMs + cfg.changeProximityDays * DAY_MS;
    const after = input.tickets.filter(
      (t) =>
        typeof t.createdAtMs === "number" &&
        t.createdAtMs >= change.appliedAtMs! &&
        t.createdAtMs <= windowEnd,
    );
    if (after.length === 0) continue;
    out.push({
      id: `pat:change_incident_proximity:${input.accountId}:${change.id}`,
      schemaVersion: PATTERN_SCHEMA_VERSION,
      patternType: "change_incident_proximity",
      accountId: input.accountId,
      // CRITICAL: temporal association ONLY. Never asserts causation.
      title: `${after.length} incident${after.length === 1 ? "" : "s"} shortly after a change`,
      description: `Temporal association: ${after.length} ticket${after.length === 1 ? "" : "s"} opened within ${cfg.changeProximityDays} days after the change "${change.title ?? change.id}". This is timing only — it does not establish that the change caused the issue. Worth investigating.`,
      windowDays: cfg.changeProximityDays,
      supportingEventIds: [],
      sourceCount: after.length,
      evidenceRefs: [
        { type: "change", id: change.id },
        ...after.map((t) => ({ type: "ticket" as const, id: t.id })),
      ],
      confidence: "inferred",
      firstObservedAt: iso(change.appliedAtMs),
      lastObservedAt: iso(Math.max(...after.map((t) => t.createdAtMs!))),
      severity: after.length >= 2 ? "elevated" : "notice",
      recalcAfterMs: cfg.recalcAfterMs,
      generatedAt: iso(input.now),
    });
  }
  return out;
}

function detectResolutionReuse(input: PatternInput): PatternObservation[] {
  const cfg = PATTERN_CONFIG;
  const out: PatternObservation[] = [];
  for (const r of input.resolutions) {
    const reuse = r.reuseCount ?? 0;
    if (reuse < cfg.resolutionReuseMin) continue;
    if (!within(r.lastUsedAtMs ?? input.now, input.now, cfg.resolutionReuseWindowDays)) continue;
    out.push({
      id: `pat:resolution_reuse:${input.accountId}:${r.id}`,
      schemaVersion: PATTERN_SCHEMA_VERSION,
      patternType: "resolution_reuse",
      accountId: input.accountId,
      title: `Relevant previous resolution reused ${reuse}×`,
      description: `Recurring behavior: a ${r.confidence} resolution${r.affectedArea ? ` for "${r.affectedArea}"` : ""} has matched ${reuse} related issues in the last ${cfg.resolutionReuseWindowDays} days. Use as investigative evidence, not a blind fix.`,
      windowDays: cfg.resolutionReuseWindowDays,
      supportingEventIds: [],
      sourceCount: reuse,
      evidenceRefs: [{ type: "resolution", id: r.id }],
      confidence: r.confidence === "verified" ? "verified" : "supported",
      firstObservedAt: iso(r.lastUsedAtMs ?? input.now),
      lastObservedAt: iso(r.lastUsedAtMs ?? input.now),
      severity: "info",
      recalcAfterMs: cfg.recalcAfterMs,
      generatedAt: iso(input.now),
    });
  }
  return out;
}

function detectEscalation(input: PatternInput): PatternObservation[] {
  const cfg = PATTERN_CONFIG;
  const esc = input.tickets.filter(
    (t) =>
      t.escalated && within(t.updatedAtMs ?? t.createdAtMs, input.now, cfg.escalationWindowDays),
  );
  if (esc.length < cfg.escalationMin) return [];
  const times = esc.map((t) => t.updatedAtMs ?? t.createdAtMs ?? input.now);
  return [
    {
      id: `pat:escalation:${input.accountId}`,
      schemaVersion: PATTERN_SCHEMA_VERSION,
      patternType: "escalation",
      accountId: input.accountId,
      title: `${esc.length} escalations in ${cfg.escalationWindowDays} days`,
      description: `Observed pattern: ${esc.length} tickets required escalation in the last ${cfg.escalationWindowDays} days.`,
      windowDays: cfg.escalationWindowDays,
      supportingEventIds: [],
      sourceCount: esc.length,
      evidenceRefs: esc.map((t) => ({ type: "ticket" as const, id: t.id })),
      confidence: "supported",
      firstObservedAt: iso(Math.min(...times)),
      lastObservedAt: iso(Math.max(...times)),
      severity: "elevated",
      recalcAfterMs: cfg.recalcAfterMs,
      generatedAt: iso(input.now),
    },
  ];
}

function detectReopen(input: PatternInput): PatternObservation[] {
  const cfg = PATTERN_CONFIG;
  const reopened = input.tickets.filter(
    (t) => t.reopened && within(t.updatedAtMs ?? t.createdAtMs, input.now, cfg.reopenWindowDays),
  );
  if (reopened.length < cfg.reopenMin) return [];
  const times = reopened.map((t) => t.updatedAtMs ?? t.createdAtMs ?? input.now);
  return [
    {
      id: `pat:reopen:${input.accountId}`,
      schemaVersion: PATTERN_SCHEMA_VERSION,
      patternType: "reopen",
      accountId: input.accountId,
      title: `${reopened.length} tickets reopened in ${cfg.reopenWindowDays} days`,
      description: `Observed pattern: ${reopened.length} tickets reopened in the last ${cfg.reopenWindowDays} days. Recurring behavior worth investigating.`,
      windowDays: cfg.reopenWindowDays,
      supportingEventIds: [],
      sourceCount: reopened.length,
      evidenceRefs: reopened.map((t) => ({ type: "ticket" as const, id: t.id })),
      confidence: "supported",
      firstObservedAt: iso(Math.min(...times)),
      lastObservedAt: iso(Math.max(...times)),
      severity: "notice",
      recalcAfterMs: cfg.recalcAfterMs,
      generatedAt: iso(input.now),
    },
  ];
}

const DETECTORS: Array<(i: PatternInput) => PatternObservation[]> = [
  detectRepeatedIssue,
  detectRepeatedWork,
  detectChangeIncidentProximity,
  detectResolutionReuse,
  detectEscalation,
  detectReopen,
];

/**
 * Run every detector. Pure. A throwing detector never suppresses the others.
 * Observations are ordered by severity, then confidence, then most-recent.
 */
export function detectPatterns(input: PatternInput): PatternObservation[] {
  const out: PatternObservation[] = [];
  for (const detect of DETECTORS) {
    try {
      out.push(...detect(input));
    } catch (err) {
      console.warn("[pattern-intelligence] detector failed", err);
    }
  }
  return out.sort(
    (a, b) =>
      SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] ||
      CONF_RANK[a.confidence] - CONF_RANK[b.confidence] ||
      b.lastObservedAt.localeCompare(a.lastObservedAt),
  );
}

/** Forbidden phrasing — used by tests and as a runtime guard in dev. */
export const FORBIDDEN_PATTERN_PHRASES = [
  "caused",
  "will happen again",
  "root cause",
  "because of the change",
  "guaranteed",
] as const;
