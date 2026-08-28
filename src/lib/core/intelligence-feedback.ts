import { createPersistedStore, useStoreValue } from "@/lib/settings/_persist";
import { attachCloudSync } from "@/lib/cloud-sync/blob-sync";
import { eventSpine } from "./event-spine";

/**
 * Intelligence feedback (Phase 3, Part 10).
 *
 * Operators teach the system whether a pattern / radar observation is useful or
 * wrong. Feedback is recorded as durable state AND emitted as a durable ledger
 * event (`intelligence.feedback_recorded`) — it is observational learning data
 * for later phases. It never auto-retrains, never mutates prompts, and never
 * changes a canonical record. One click = one recorded fact.
 */

export const FEEDBACK_KINDS = [
  "useful",
  "not_relevant",
  "outdated",
  "incorrect",
  "resolved",
] as const;
export type FeedbackKind = (typeof FEEDBACK_KINDS)[number];

export const FEEDBACK_LABEL: Record<FeedbackKind, string> = {
  useful: "Useful",
  not_relevant: "Not relevant",
  outdated: "Outdated",
  incorrect: "Incorrect",
  resolved: "Resolved",
};

export type FeedbackTargetType = "pattern" | "radar" | "observation" | "resolution_match";

export interface IntelligenceFeedback {
  id: string;
  targetType: FeedbackTargetType;
  targetId: string;
  kind: FeedbackKind;
  accountId?: string;
  patternType?: string;
  at: number;
}

interface FeedbackState {
  /** Latest feedback per target id (one operator, latest wins). */
  byTarget: Record<string, IntelligenceFeedback>;
}

const DEFAULT: FeedbackState = { byTarget: {} };

const store = createPersistedStore<FeedbackState>("aih:core:intel-feedback:v1", DEFAULT);

/** Kinds that mean "stop showing me this" — used to suppress radar/patterns. */
export const SUPPRESSING_FEEDBACK: readonly FeedbackKind[] = [
  "not_relevant",
  "incorrect",
  "outdated",
  "resolved",
];

export function isSuppressed(state: FeedbackState, targetId: string): boolean {
  const fb = state.byTarget[targetId];
  return !!fb && SUPPRESSING_FEEDBACK.includes(fb.kind);
}

/** Ids the operator has suppressed — hand to `buildRadar({ acknowledged })`. */
export function suppressedRadarIds(state: FeedbackState): Set<string> {
  const out = new Set<string>();
  for (const [id, fb] of Object.entries(state.byTarget)) {
    if (SUPPRESSING_FEEDBACK.includes(fb.kind)) out.add(id);
  }
  return out;
}

export const intelligenceFeedback = {
  get: () => store.get(),

  latestFor(targetId: string): IntelligenceFeedback | undefined {
    return store.get().byTarget[targetId];
  },

  /**
   * Record one feedback fact. Persists locally, and emits a durable ledger
   * event (references only — the observation id + feedback class). Best-effort:
   * an emit failure never blocks the click.
   */
  record(input: {
    targetType: FeedbackTargetType;
    targetId: string;
    kind: FeedbackKind;
    accountId?: string;
    patternType?: string;
  }): IntelligenceFeedback {
    const fb: IntelligenceFeedback = {
      id: input.targetId,
      targetType: input.targetType,
      targetId: input.targetId,
      kind: input.kind,
      ...(input.accountId ? { accountId: input.accountId } : {}),
      ...(input.patternType ? { patternType: input.patternType } : {}),
      at: Date.now(),
    };
    store.update((s) => ({ byTarget: { ...s.byTarget, [fb.targetId]: fb } }));
    try {
      eventSpine.emit({
        type: "intelligence.feedback_recorded",
        source: "intelligence",
        ...(input.accountId ? { accountId: input.accountId } : {}),
        metadata: {
          observationId: input.targetId,
          feedbackKind: input.kind,
          ...(input.patternType ? { patternType: input.patternType } : {}),
        },
      });
    } catch (err) {
      console.warn("[intelligence-feedback] emit failed", err);
    }
    return fb;
  },

  clear(targetId: string): void {
    store.update((s) => {
      const next = { ...s.byTarget };
      delete next[targetId];
      return { byTarget: next };
    });
  },
};

export function useIntelligenceFeedback(): FeedbackState {
  return useStoreValue(store, DEFAULT);
}

// Cross-device durability via the shared blob store.
if (typeof window !== "undefined") {
  attachCloudSync<FeedbackState>({
    storeKey: "intel-feedback",
    subscribe: store.subscribe,
    getSnapshot: () => store.get(),
    applyServerSnapshot: (next) => store.applyServerSnapshot(next),
    isEmpty: (s) => Object.keys(s.byTarget).length === 0,
  });
}
