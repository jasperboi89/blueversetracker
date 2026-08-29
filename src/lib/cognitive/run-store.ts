/**
 * Phase 9 — bounded, in-session record of orchestrated cognitive runs.
 *
 * Runs are OBSERVABILITY, not knowledge. Nothing here is durable Operational
 * Memory and nothing here is persisted server-side: the buffer is bounded,
 * rotates oldest-first, and is discarded when the session ends. That is the
 * retention policy — the Inspector does not create a second audit system.
 */

import { useSyncExternalStore } from "react";
import type { CognitiveRun, WorkerId } from "./worker-contract";

/** Retention bound: newest runs only, oldest rotated out. */
export const MAX_RETAINED_RUNS = 30;

let runs: CognitiveRun[] = [];
const listeners = new Set<() => void>();

function notify(): void {
  for (const fn of listeners) fn();
}

export const cognitiveRunStore = {
  record(run: CognitiveRun): void {
    runs = [run, ...runs.filter((r) => r.correlationId !== run.correlationId)].slice(0, MAX_RETAINED_RUNS);
    notify();
  },
  list(): CognitiveRun[] {
    return runs;
  },
  get(correlationId: string): CognitiveRun | undefined {
    return runs.find((r) => r.correlationId === correlationId);
  },
  clear(): void {
    runs = [];
    notify();
  },
  subscribe(fn: () => void): () => void {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
};

export function useCognitiveRuns(): CognitiveRun[] {
  return useSyncExternalStore(
    (fn) => cognitiveRunStore.subscribe(fn),
    () => runs,
    () => runs,
  );
}

/* ------------------------------------------------------------------ */
/* Authorization                                                       */
/* ------------------------------------------------------------------ */

/**
 * Operator isolation. An admin may inspect any run recorded in this session;
 * everyone else sees only their own. There is no cross-operator sharing.
 */
export function visibleRuns(all: CognitiveRun[], operatorRef: string, isAdmin: boolean): CognitiveRun[] {
  return isAdmin ? all : all.filter((r) => r.operatorRef === operatorRef);
}

export function canInspectRun(run: CognitiveRun, operatorRef: string, isAdmin: boolean): boolean {
  return isAdmin || run.operatorRef === operatorRef;
}

/* ------------------------------------------------------------------ */
/* Bounded summaries (the run LIST never hydrates contributions)       */
/* ------------------------------------------------------------------ */

export interface CognitiveRunSummary {
  correlationId: string;
  startedAt: string;
  endedAt?: string;
  durationMs: number;
  intent: string;
  intentClass: string;
  accountId?: string;
  operatorRef: string;
  route: string;
  workers: WorkerId[];
  guardianDecision?: string;
  guardianAvailable?: boolean;
  state: CognitiveRun["state"];
  stopReason: string;
  cognitionTier: string;
  criticUsed: boolean;
  revisions: number;
}

export function summarizeRun(run: CognitiveRun): CognitiveRunSummary {
  const workers = run.participation.map((p) => p.workerId);
  return {
    correlationId: run.correlationId,
    startedAt: run.startedAt,
    ...(run.endedAt ? { endedAt: run.endedAt } : {}),
    durationMs: run.usage.elapsedMs,
    intent: run.intent,
    intentClass: run.intentClass,
    ...(run.accountId ? { accountId: run.accountId } : {}),
    operatorRef: run.operatorRef,
    route: run.plan.direct ? "DIRECT RESPONSE" : workers.map((w) => w.toUpperCase()).join(" → ") || "GOVERNANCE",
    workers,
    ...(run.guardian ? { guardianDecision: run.guardian.decision, guardianAvailable: run.guardian.available } : {}),
    state: run.state,
    stopReason: run.stopReason ?? "completed",
    cognitionTier: run.cognitionTier,
    criticUsed: run.critiques.length > 0,
    revisions: run.usage.revisions,
  };
}

/* ------------------------------------------------------------------ */
/* Filters + search                                                    */
/* ------------------------------------------------------------------ */

export interface RunFilters {
  status?: string;
  worker?: string;
  intentClass?: string;
  guardianDecision?: string;
  accountId?: string;
  stopReason?: string;
  tier?: string;
  /** Free text over correlation id, account id, worker id and status only. */
  query?: string;
  sinceMs?: number;
}

export function filterRuns(list: CognitiveRunSummary[], f: RunFilters, nowMs = Date.now()): CognitiveRunSummary[] {
  const q = f.query?.trim().toLowerCase();
  return list.filter((r) => {
    if (f.status && r.state !== f.status) return false;
    if (f.worker && !r.workers.includes(f.worker as WorkerId)) return false;
    if (f.intentClass && r.intentClass !== f.intentClass) return false;
    if (f.guardianDecision && r.guardianDecision !== f.guardianDecision) return false;
    if (f.accountId && r.accountId !== f.accountId) return false;
    if (f.stopReason && r.stopReason !== f.stopReason) return false;
    if (f.tier && r.cognitionTier !== f.tier) return false;
    if (f.sinceMs && nowMs - new Date(r.startedAt).getTime() > f.sinceMs) return false;
    if (q) {
      const hay = [r.correlationId, r.accountId ?? "", r.workers.join(" "), r.state, r.stopReason]
        .join(" ")
        .toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

/** Operator-facing status vocabulary, derived from canonical run state. */
export function runStatusLabel(state: CognitiveRun["state"]): string {
  switch (state) {
    case "completed":
      return "COMPLETED";
    case "partial":
      return "PARTIAL";
    case "blocked":
      return "BLOCKED";
    case "failed":
      return "FAILED";
    case "cancelled":
      return "CANCELLED";
    default:
      return state.toUpperCase();
  }
}
