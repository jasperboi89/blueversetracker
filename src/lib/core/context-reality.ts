/**
 * Intelligence Core — thin Reality Boundary vocabulary (Phase 10).
 *
 * `origin` answers "how do we know this?"; Resolution Memory `confidence`
 * answers "how sure is the operator that the fix works?". They are deliberately
 * separate fields: an AI conclusion can be `inferred` + `uncertain`, while a
 * resolution can be `operator_confirmed` + `verified`. Never collapse them.
 *
 * Phase 11 (Reality Boundary / Evidence Graph) will extend this module; nothing
 * here assumes a graph yet.
 */

export const CONTEXT_ORIGINS = [
  "observed",
  "retrieved",
  "operator_confirmed",
  "inferred",
  "generated",
  "uncertain",
] as const;
export type ContextOrigin = (typeof CONTEXT_ORIGINS)[number];

export const ORIGIN_LABEL: Record<ContextOrigin, string> = {
  observed: "Observed",
  retrieved: "Retrieved",
  operator_confirmed: "Operator confirmed",
  inferred: "Inferred",
  generated: "Generated",
  uncertain: "Uncertain",
};

/** Evidence confidence reuses Resolution Memory's vocabulary unchanged. */
export type EvidenceConfidence = "verified" | "probable" | "unknown";

export const FRESHNESS_STATES = [
  "current",
  "recent",
  "stale",
  "historical",
  "superseded",
] as const;
export type ContextFreshness = (typeof FRESHNESS_STATES)[number];

/**
 * The one place freshness thresholds live. Shift work is nightly, so "current"
 * is a shift, "recent" is a work week, and anything past a quarter is history.
 */
export const FRESHNESS_THRESHOLDS_MS = {
  current: 24 * 60 * 60 * 1000,
  recent: 7 * 24 * 60 * 60 * 1000,
  stale: 90 * 24 * 60 * 60 * 1000,
} as const;

/**
 * Classify an evidence timestamp. `superseded`/`historical` are record states,
 * not clock states, so callers pass them explicitly — age never overrides them.
 */
export function classifyFreshness(
  observedAt: string | undefined,
  now: number,
  state?: { superseded?: boolean; historical?: boolean },
): ContextFreshness {
  if (state?.superseded) return "superseded";
  if (state?.historical) return "historical";
  if (!observedAt) return "stale";
  const at = Date.parse(observedAt);
  if (!Number.isFinite(at)) return "stale";
  const age = Math.max(0, now - at);
  if (age <= FRESHNESS_THRESHOLDS_MS.current) return "current";
  if (age <= FRESHNESS_THRESHOLDS_MS.recent) return "recent";
  if (age <= FRESHNESS_THRESHOLDS_MS.stale) return "stale";
  return "historical";
}

/** True when the item must never outrank live information. */
export function isBackwardLooking(freshness: ContextFreshness): boolean {
  return freshness === "historical" || freshness === "superseded";
}
