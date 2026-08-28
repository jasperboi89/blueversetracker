import type { AnomalySignal } from "./anomaly-contract";
import type {
  ConfidenceClass,
  PatternEvidenceRef,
  PatternObservation,
} from "./pattern-intelligence";

/**
 * Operational Radar (Phase 3, Part 6) — a SMALL, ranked set of grounded
 * observations, not a dashboard. Pure and deterministic: it maps existing
 * pattern observations (and optional workload/system signals) into a bounded,
 * transparently-ranked radar. Avoids alert fatigue by capping the count and
 * suppressing acknowledged items.
 *
 * It invents nothing: every radar item points back at real evidence. When there
 * is nothing meaningful, it returns [] and the UI shows a calm empty state.
 */

export type RadarCategory =
  | "recurring"
  | "change_followup"
  | "resolution_match"
  | "workload"
  | "anomaly"
  | "system";

export type RadarSeverity = "info" | "notice" | "elevated";

export interface RadarItem {
  id: string;
  category: RadarCategory;
  accountId?: string;
  title: string;
  detail: string;
  severity: RadarSeverity;
  confidence?: ConfidenceClass;
  sourceCount: number;
  evidenceRefs: PatternEvidenceRef[];
  /** Links back to a persisted observation for feedback/inspection. */
  observationId?: string;
  generatedAt: string;
}

/**
 * Map Phase 5 anomaly signals onto radar items. Only established-baseline
 * anomalies are mapped: "insufficient baseline" is a state of the system, not
 * something that belongs on an attention surface.
 */
export function anomaliesToRadar(signals: readonly AnomalySignal[]): RadarItem[] {
  return signals
    .filter((a) => a.state === "anomaly")
    .map((a) => ({
      id: `radar:${a.id}`,
      category: "anomaly" as const,
      accountId: a.accountId,
      title: a.title,
      detail: `observed ${a.deviation.observed} vs typical ${a.baseline.median} ${a.baseline.metric}`,
      severity: a.severity,
      confidence: a.confidence,
      sourceCount: a.sourceCount,
      evidenceRefs: a.evidenceRefs,
      observationId: a.id,
      generatedAt: a.generatedAt,
    }));
}

/** Extra, non-pattern signals the caller may fold in. */
export interface RadarWorkloadSignal {
  accountId: string;
  activeWork: number;
  blockingWork: number;
}

export interface RadarSystemSignal {
  id: string;
  title: string;
  detail: string;
  severity: RadarSeverity;
}

export interface RadarInput {
  now: number;
  observations: PatternObservation[];
  workload?: RadarWorkloadSignal[];
  system?: RadarSystemSignal[];
  /** Acknowledged/dismissed radar item ids to suppress. */
  acknowledged?: ReadonlySet<string>;
}

/** Keep the radar small — this is the anti-fatigue guarantee. */
export const MAX_RADAR_ITEMS = 6;

const SEVERITY_RANK: Record<RadarSeverity, number> = { elevated: 0, notice: 1, info: 2 };
const CONF_RANK: Record<ConfidenceClass, number> = {
  verified: 0,
  supported: 1,
  inferred: 2,
  insufficient: 3,
};

const PATTERN_TO_RADAR: Record<string, RadarCategory> = {
  repeated_issue: "recurring",
  repeated_work: "recurring",
  escalation: "recurring",
  reopen: "recurring",
  change_incident_proximity: "change_followup",
  resolution_reuse: "resolution_match",
};

function observationToRadar(o: PatternObservation): RadarItem {
  return {
    id: `radar:${o.id}`,
    category: PATTERN_TO_RADAR[o.patternType] ?? "recurring",
    accountId: o.accountId,
    title: o.title,
    detail: `${o.sourceCount} related event${o.sourceCount === 1 ? "" : "s"} / ${o.windowDays} days`,
    severity: o.severity,
    confidence: o.confidence,
    sourceCount: o.sourceCount,
    evidenceRefs: o.evidenceRefs,
    observationId: o.id,
    generatedAt: new Date(o.generatedAt).toISOString(),
  };
}

/**
 * Build the radar. Ranking is transparent: severity, then confidence class,
 * then source count, then recency. Bounded to MAX_RADAR_ITEMS.
 */
export function buildRadar(input: RadarInput): RadarItem[] {
  const ack = input.acknowledged ?? new Set<string>();
  const items: RadarItem[] = [];

  for (const o of input.observations) items.push(observationToRadar(o));

  for (const w of input.workload ?? []) {
    if (w.blockingWork <= 0 && w.activeWork < 4) continue;
    items.push({
      id: `radar:workload:${w.accountId}`,
      category: "workload",
      accountId: w.accountId,
      title: `Workload building on ${w.accountId}`,
      detail: `${w.activeWork} active${w.blockingWork ? `, ${w.blockingWork} blocking` : ""}`,
      severity: w.blockingWork > 0 ? "elevated" : "notice",
      sourceCount: w.activeWork,
      evidenceRefs: [{ type: "account", id: w.accountId }],
      generatedAt: new Date(input.now).toISOString(),
    });
  }

  for (const s of input.system ?? []) {
    items.push({
      id: `radar:system:${s.id}`,
      category: "system",
      title: s.title,
      detail: s.detail,
      severity: s.severity,
      sourceCount: 1,
      evidenceRefs: [],
      generatedAt: new Date(input.now).toISOString(),
    });
  }

  return rankRadar(items, ack);
}

/**
 * Rank + bound a set of radar items. Transparent ordering: severity, then
 * confidence class, then source count, then recency. Suppresses acknowledged
 * ids and caps to MAX_RADAR_ITEMS. Exposed so callers that assemble radar items
 * from multiple sources (e.g. the Command Center) share one ranking rule.
 */
export function rankRadar(items: RadarItem[], acknowledged?: ReadonlySet<string>): RadarItem[] {
  const ack = acknowledged ?? new Set<string>();
  return items
    .filter((i) => !ack.has(i.id))
    .sort(
      (a, b) =>
        SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] ||
        CONF_RANK[a.confidence ?? "supported"] - CONF_RANK[b.confidence ?? "supported"] ||
        b.sourceCount - a.sourceCount ||
        b.generatedAt.localeCompare(a.generatedAt),
    )
    .slice(0, MAX_RADAR_ITEMS);
}
