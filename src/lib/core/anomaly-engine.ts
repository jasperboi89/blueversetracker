/**
 * Phase 5 — Anomaly engine (orchestrator).
 *
 * Runs every detector, isolates failures, ranks the results, and separates the
 * two states so downstream surfaces cannot accidentally present a
 * "still learning" signal as a finding.
 *
 * Pure and deterministic. It composes existing canonical inputs (durable event
 * ledger, account context facts, Phase 4 script structure) — it owns no data.
 */

import {
  ANOMALY_CONFIG,
  FORBIDDEN_ANOMALY_PHRASES,
  type AnomalySeverity,
  type AnomalySignal,
} from "./anomaly-contract";
import { ANOMALY_DETECTORS, type AnomalyInput } from "./anomaly-detectors";
import type { ConfidenceClass } from "./pattern-intelligence";

export type { AnomalyInput } from "./anomaly-detectors";

const SEVERITY_RANK: Record<AnomalySeverity, number> = { elevated: 0, notice: 1, info: 2 };
const CONF_RANK: Record<ConfidenceClass, number> = {
  verified: 0,
  supported: 1,
  inferred: 2,
  insufficient: 3,
};

/** Keep the anomaly surface small for the same anti-fatigue reason as radar. */
export const MAX_ANOMALIES = 6;
export const MAX_BASELINE_GAPS = 4;

export interface AnomalyResult {
  /** Real deviations against established baselines, ranked and bounded. */
  anomalies: AnomalySignal[];
  /** First-class "not enough history yet" states — never presented as findings. */
  baselineGaps: AnomalySignal[];
  generatedAt: string;
}

/** Run every detector. A throwing detector never suppresses the others. */
export function detectAnomalies(input: AnomalyInput): AnomalyResult {
  const all: AnomalySignal[] = [];
  for (const detect of ANOMALY_DETECTORS) {
    try {
      all.push(...detect(input));
    } catch (err) {
      console.warn("[anomaly-engine] detector failed", err);
    }
  }

  const anomalies = all
    .filter((s) => s.state === "anomaly")
    .sort(rankAnomalies)
    .slice(0, MAX_ANOMALIES);

  const baselineGaps = all
    .filter((s) => s.state === "insufficient_baseline")
    .sort((a, b) => a.anomalyType.localeCompare(b.anomalyType) || a.id.localeCompare(b.id))
    .slice(0, MAX_BASELINE_GAPS);

  return { anomalies, baselineGaps, generatedAt: new Date(input.now).toISOString() };
}

/** Transparent ordering: severity, then confidence, then deviation magnitude. */
export function rankAnomalies(a: AnomalySignal, b: AnomalySignal): number {
  return (
    SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] ||
    CONF_RANK[a.confidence] - CONF_RANK[b.confidence] ||
    Math.abs(b.deviation.robustZ ?? 0) - Math.abs(a.deviation.robustZ ?? 0) ||
    b.sourceCount - a.sourceCount ||
    a.id.localeCompare(b.id)
  );
}

/**
 * Dev/test guard: no signal may make a causal or predictive assertion.
 * Returns the offending phrases (empty when clean).
 */
export function violatesLanguageContract(s: AnomalySignal): string[] {
  const hay = `${s.title} ${s.description}`.toLowerCase();
  return FORBIDDEN_ANOMALY_PHRASES.filter((p) => hay.includes(p));
}

/**
 * The autonomy ceiling for Phase 5. Nothing here may execute a change; even
 * "prepare" means assembling a proposal for the Safe Action Executor, which
 * still requires operator confirmation.
 */
export function maxAutonomy(): "prepare" {
  return "prepare";
}

export { ANOMALY_CONFIG };
