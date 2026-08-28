import { createPersistedStore, useStoreValue } from "@/lib/settings/_persist";
import { attachCloudSync } from "@/lib/cloud-sync/blob-sync";
import type { ConfidenceClass, PatternObservation, PatternType } from "./pattern-intelligence";

/**
 * Account Cortex persisted intelligence state (Phase 3, Part 11).
 *
 * Phase 2's Cortex was derived-on-read. This adds a careful persistence layer
 * for INTELLIGENCE STATE — the last evaluation, active observations (ids +
 * evidence ids + confidence), and a bounded history of resolved/expired ones,
 * plus room for human feedback. It deliberately does NOT persist a giant
 * AI-generated summary: canonical facts stay in their canonical stores, and this
 * record only projects and connects them.
 */

export const CORTEX_CALC_VERSION = 1;

export type ObservationStatus = "active" | "resolved" | "expired";

export interface PersistedObservation {
  id: string;
  patternType: PatternType;
  title: string;
  confidence: ConfidenceClass;
  severity: string;
  /** Evidence reference ids (not content). */
  evidenceIds: string[];
  firstObservedAt: string;
  lastObservedAt: string;
  status: ObservationStatus;
  recordedAt: string;
  recalcAfterMs: number;
}

export interface CortexHistoryEntry {
  id: string;
  status: "resolved" | "expired";
  at: string;
}

export interface AccountCortexRecord {
  accountId: string;
  lastEvaluatedAt: string;
  calcVersion: number;
  observations: PersistedObservation[];
  history: CortexHistoryEntry[];
}

interface CortexState {
  byAccount: Record<string, AccountCortexRecord>;
}

const DEFAULT: CortexState = { byAccount: {} };
const HISTORY_MAX = 100;

const store = createPersistedStore<CortexState>("aih:core:account-cortex:v1", DEFAULT);

function toPersisted(
  o: PatternObservation,
  prev: PersistedObservation | undefined,
  nowIso: string,
): PersistedObservation {
  return {
    id: o.id,
    patternType: o.patternType,
    title: o.title,
    confidence: o.confidence,
    severity: o.severity,
    evidenceIds: o.evidenceRefs.map((r) => `${r.type}:${r.id}`),
    firstObservedAt: prev?.firstObservedAt ?? o.firstObservedAt,
    lastObservedAt: o.lastObservedAt,
    status: "active",
    recordedAt: prev?.recordedAt ?? nowIso,
    recalcAfterMs: o.recalcAfterMs,
  };
}

/**
 * Reconcile a fresh evaluation against the persisted record. Pure: same inputs
 * → same output. Observations still firing stay active (keeping their first-seen
 * / recorded timestamps); ones that stopped firing move to history as resolved.
 */
export function reconcileObservations(
  prev: AccountCortexRecord | undefined,
  current: PatternObservation[],
  accountId: string,
  now: number,
): AccountCortexRecord {
  const nowIso = new Date(now).toISOString();
  const prevActive = new Map((prev?.observations ?? []).map((o) => [o.id, o] as const));
  const currentIds = new Set(current.map((o) => o.id));

  const observations = current.map((o) => toPersisted(o, prevActive.get(o.id), nowIso));

  const newlyResolved: CortexHistoryEntry[] = [];
  for (const [id] of prevActive) {
    if (!currentIds.has(id)) newlyResolved.push({ id, status: "resolved", at: nowIso });
  }

  const history = [...newlyResolved, ...(prev?.history ?? [])].slice(0, HISTORY_MAX);

  return {
    accountId,
    lastEvaluatedAt: nowIso,
    calcVersion: CORTEX_CALC_VERSION,
    observations,
    history,
  };
}

export const accountCortexStore = {
  get: (accountId: string): AccountCortexRecord | undefined => store.get().byAccount[accountId],

  /** Persist a fresh evaluation for an account (reconciled). */
  evaluate(
    accountId: string,
    current: PatternObservation[],
    now: number = Date.now(),
  ): AccountCortexRecord {
    const next = reconcileObservations(store.get().byAccount[accountId], current, accountId, now);
    store.update((s) => ({ byAccount: { ...s.byAccount, [accountId]: next } }));
    return next;
  },

  getState: () => store.get(),
};

/** Reactive view of all persisted per-account intelligence state. */
export function useAccountCortexState(): CortexState {
  return useStoreValue(store, DEFAULT);
}

// Cross-device durability via the shared blob store.
if (typeof window !== "undefined") {
  attachCloudSync<CortexState>({
    storeKey: "account-cortex",
    subscribe: store.subscribe,
    getSnapshot: () => store.get(),
    applyServerSnapshot: (next) => store.applyServerSnapshot(next),
    isEmpty: (s) => Object.keys(s.byAccount).length === 0,
  });
}
