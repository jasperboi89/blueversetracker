/**
 * Intelligence Core — Phase 11: Reality Boundary policy.
 *
 * The single place that decides truth semantics: which origin applies, how
 * fresh a fact is for its domain, whether a promotion/demotion is legal, and
 * how a fact is labelled for humans and for the model. Deterministic only —
 * no AI call ever decides any of this.
 */

import { classifyFreshness, FRESHNESS_THRESHOLDS_MS } from "./context-reality";
import type {
  EvidenceConfidence,
  EvidenceFact,
  EvidenceFreshness,
  EvidenceOrigin,
  EvidenceSourceType,
  EvidenceStatus,
  EvidenceValue,
} from "./evidence-contract";

/* ------------------------------------------------------------------ */
/* Freshness: shared model with domain-specific overrides              */
/* ------------------------------------------------------------------ */

type Thresholds = { current: number; recent: number; stale: number };

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

/**
 * A ticket status goes stale in minutes; a training procedure stays current
 * for months. Domains that need no override inherit the shared model.
 */
const DOMAIN_THRESHOLDS: Partial<Record<EvidenceSourceType, Thresholds>> = {
  freshdesk: { current: 15 * MIN, recent: 4 * HOUR, stale: 7 * DAY },
  account_context: { current: 6 * HOUR, recent: 3 * DAY, stale: 45 * DAY },
  knowledge_vault: { current: 90 * DAY, recent: 180 * DAY, stale: 730 * DAY },
  resolution_memory: { current: 30 * DAY, recent: 120 * DAY, stale: 365 * DAY },
  similar_prior_work: { current: 7 * DAY, recent: 30 * DAY, stale: 180 * DAY },
};

export function freshnessFor(
  sourceType: EvidenceSourceType,
  at: string | undefined,
  now = Date.now(),
  state?: { superseded?: boolean; historical?: boolean },
): EvidenceFreshness {
  const t = DOMAIN_THRESHOLDS[sourceType];
  if (!t) return classifyFreshness(at, now, state);
  if (state?.superseded) return "superseded";
  if (state?.historical) return "historical";
  if (!at) return "stale";
  const parsed = Date.parse(at);
  if (!Number.isFinite(parsed)) return "stale";
  const age = Math.max(0, now - parsed);
  if (age <= t.current) return "current";
  if (age <= t.recent) return "recent";
  if (age <= t.stale) return "stale";
  return "historical";
}

export const SHARED_FRESHNESS_THRESHOLDS = FRESHNESS_THRESHOLDS_MS;

/* ------------------------------------------------------------------ */
/* Labels                                                              */
/* ------------------------------------------------------------------ */

export const ORIGIN_DESCRIPTION: Record<EvidenceOrigin, string> = {
  observed: "read directly from current authoritative state",
  operator_confirmed: "explicitly confirmed by the operator",
  retrieved: "read from a stored record, not from live state",
  inferred: "derived by logic or AI reasoning",
  generated: "AI-authored and not yet verified",
  simulated: "hypothetical or test scenario",
  uncertain: "origin could not be resolved",
};

/** `[VERIFIED | OBSERVED | CURRENT]` — the model must not infer this from prose. */
export function realityLabel(fact: EvidenceFact): string {
  const parts = [fact.confidence.toUpperCase(), fact.origin.toUpperCase()];
  if (fact.status === "superseded") parts.push("SUPERSEDED");
  else if (fact.status === "disputed") parts.push("CONFLICTED");
  else if (fact.status === "historical") parts.push("HISTORICAL");
  else parts.push((fact.freshness ?? "stale").toUpperCase());
  return `[${parts.join(" | ")}]`;
}

/* ------------------------------------------------------------------ */
/* Promotion / demotion                                                */
/* ------------------------------------------------------------------ */

export interface PromotionResult {
  fact: EvidenceFact;
  changed: boolean;
  reason: string;
}

/**
 * Operator confirmation is the ONLY path that reaches verified from generated
 * or inferred material. Saving AI output never promotes it by itself.
 */
export function promoteByOperator(fact: EvidenceFact, at = new Date().toISOString()): PromotionResult {
  if (fact.origin === "simulated") {
    return { fact, changed: false, reason: "simulated evidence cannot be promoted" };
  }
  if (fact.origin === "operator_confirmed" && fact.confidence === "verified") {
    return { fact, changed: false, reason: "already operator confirmed" };
  }
  return {
    fact: {
      ...fact,
      origin: "operator_confirmed",
      confidence: "verified",
      status: fact.status === "superseded" ? "superseded" : "active",
      recordedAt: at,
      observedAt: fact.observedAt ?? at,
    },
    changed: true,
    reason: "operator confirmation",
  };
}

export function rejectByOperator(fact: EvidenceFact, at = new Date().toISOString()): PromotionResult {
  return {
    fact: { ...fact, confidence: "unknown", status: "disputed", recordedAt: at },
    changed: true,
    reason: "operator rejected",
  };
}

/** Supersession never deletes: the old fact becomes history and stays queryable. */
export function supersede(
  older: EvidenceFact,
  newer: EvidenceFact,
  at = new Date().toISOString(),
): { older: EvidenceFact; newer: EvidenceFact } {
  return {
    older: {
      ...older,
      status: "superseded",
      freshness: "superseded",
      validUntil: older.validUntil ?? at,
      supersededBy: Array.from(new Set([...(older.supersededBy ?? []), newer.id])),
    },
    newer: {
      ...newer,
      supersedes: Array.from(new Set([...(newer.supersedes ?? []), older.id])),
    },
  };
}

/** Legal transitions. Anything else is a bug, not a silent overwrite. */
const ALLOWED_STATUS: Record<EvidenceStatus, EvidenceStatus[]> = {
  active: ["active", "historical", "superseded", "disputed"],
  historical: ["historical", "superseded", "disputed"],
  superseded: ["superseded", "disputed"],
  disputed: ["disputed", "active", "superseded", "historical"],
};

export function canTransition(from: EvidenceStatus, to: EvidenceStatus): boolean {
  return ALLOWED_STATUS[from].includes(to);
}

/* ------------------------------------------------------------------ */
/* Privacy boundary                                                    */
/* ------------------------------------------------------------------ */

const VALUE_MAX = 240;

/** Patterns that must never enter a generic evidence fact. */
const SENSITIVE = [
  /\b\d{3}[-. ]?\d{3}[-. ]?\d{4}\b/, // phone
  /[\w.+-]+@[\w-]+\.[\w.]+/, // email
  /\b\d{3}-\d{2}-\d{4}\b/, // ssn
  /\b(?:password|api[_ -]?key|secret|bearer|authorization)\b/i,
];

export function containsSensitive(text: string): boolean {
  return SENSITIVE.some((re) => re.test(text));
}

/**
 * Bound and scrub a fact value. Returns null when the value cannot be made
 * safe — the caller must then drop the fact rather than store a redacted blob.
 */
export function sanitizeEvidenceValue(value: EvidenceValue): EvidenceValue | null {
  if (typeof value !== "string") return value;
  const clean = value.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  if (!clean) return null;
  if (containsSensitive(clean)) return null;
  return clean.length > VALUE_MAX ? `${clean.slice(0, VALUE_MAX - 1)}…` : clean;
}

export function confidenceAtMost(
  a: EvidenceConfidence,
  b: EvidenceConfidence,
): EvidenceConfidence {
  const rank: Record<EvidenceConfidence, number> = { verified: 0, probable: 1, unknown: 2 };
  return rank[a] >= rank[b] ? a : b;
}
