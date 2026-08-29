/**
 * Activation 7 — portal-wide evidence-state vocabulary.
 *
 * A single, honest vocabulary for "how much do we actually know about this?".
 * The UI renders these with text + icon + colour, NEVER colour alone
 * (accessibility) and NEVER as fake certainty — green means *genuinely
 * verified*, not merely "present". This is a presentation vocabulary; it does
 * not change any engine, threshold, autonomy level, or capability.
 *
 * Ordering (best-known → least-known) is deliberate and drives sort/emphasis:
 *   verified > observed > partial > inferred > insufficient_history > unknown > unsupported
 */

export const EVIDENCE_STATES = [
  "verified",
  "observed",
  "partial",
  "inferred",
  "insufficient_history",
  "unknown",
  "unsupported",
] as const;

export type EvidenceState = (typeof EVIDENCE_STATES)[number];

export interface EvidenceStateMeta {
  /** Short, human label for chips/badges. */
  label: string;
  /** One sentence an operator can trust — what this state means. */
  help: string;
  /**
   * Semantic tone the theme maps to colour. `positive` is reserved for
   * genuinely verified facts; everything uncertain is `neutral`/`caution`.
   * Colour is never the sole signal — pair with `label` + an icon name.
   */
  tone: "positive" | "informational" | "neutral" | "caution" | "muted";
  /** Lucide icon name the badge pairs with the colour, for non-colour signal. */
  icon: string;
  /** Best-known (0) → least-known (6). Stable sort key. */
  rank: number;
}

export const EVIDENCE_STATE_META: Record<EvidenceState, EvidenceStateMeta> = {
  verified: {
    label: "Verified",
    help: "Confirmed against real evidence. Safe to rely on.",
    tone: "positive",
    icon: "shield-check",
    rank: 0,
  },
  observed: {
    label: "Observed",
    help: "Seen directly in a real artifact, but not independently confirmed.",
    tone: "informational",
    icon: "eye",
    rank: 1,
  },
  partial: {
    label: "Partial",
    help: "Some of this is understood; coverage is incomplete.",
    tone: "neutral",
    icon: "circle-dashed",
    rank: 2,
  },
  inferred: {
    label: "Inferred",
    help: "Derived by reasoning, not directly observed. Treat as a hypothesis.",
    tone: "caution",
    icon: "sparkles",
    rank: 3,
  },
  insufficient_history: {
    label: "Insufficient history",
    help: "Not enough real operating history yet. Gathering evidence.",
    tone: "muted",
    icon: "hourglass",
    rank: 4,
  },
  unknown: {
    label: "Unknown",
    help: "Not established either way. No claim is made.",
    tone: "muted",
    icon: "circle-help",
    rank: 5,
  },
  unsupported: {
    label: "Unsupported",
    help: "Outside what this system can currently interpret.",
    tone: "caution",
    icon: "ban",
    rank: 6,
  },
};

export function evidenceMeta(state: EvidenceState): EvidenceStateMeta {
  return EVIDENCE_STATE_META[state];
}

/** True only for `verified` — the one state allowed to read as "true". */
export function isTrustworthy(state: EvidenceState): boolean {
  return state === "verified";
}

/**
 * Combine several evidence states into one summary for a parent surface. The
 * summary is never MORE confident than its weakest meaningful part: a screen
 * whose branch behaviour is `unknown` cannot summarise as `verified`.
 */
export function weakestEvidence(states: readonly EvidenceState[]): EvidenceState {
  if (states.length === 0) return "unknown";
  return states.reduce((worst, s) =>
    EVIDENCE_STATE_META[s].rank > EVIDENCE_STATE_META[worst].rank ? s : worst,
  );
}

/** Sort helper: best-known first. */
export function byEvidenceRank(a: EvidenceState, b: EvidenceState): number {
  return EVIDENCE_STATE_META[a].rank - EVIDENCE_STATE_META[b].rank;
}
