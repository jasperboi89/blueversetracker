/**
 * Phase 10 — the Action Center's bounded, in-session execution record.
 *
 * Observability, not a second audit system: the durable audit lives in the
 * server-side action ledger. This buffer exists so the operator can see what
 * is awaiting confirmation, what ran, and what needs verification right now.
 */

import { useSyncExternalStore } from "react";
import type { ConfirmationProof, ExecutionPlan, ExecutionReceipt } from "./execution-contract";

export const MAX_RETAINED_EXECUTIONS = 40;

export interface ExecutionEntry {
  plan: ExecutionPlan;
  status: "awaiting_confirmation" | "running" | "done";
  confirmation?: ConfirmationProof;
  receipt?: ExecutionReceipt;
  operatorRef: string;
  updatedAt: string;
}

let entries: ExecutionEntry[] = [];
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((fn) => fn());

function upsert(entry: ExecutionEntry): void {
  entries = [entry, ...entries.filter((e) => e.plan.id !== entry.plan.id)].slice(
    0,
    MAX_RETAINED_EXECUTIONS,
  );
  notify();
}

export const executionStore = {
  propose(plan: ExecutionPlan, operatorRef: string): void {
    upsert({ plan, status: "awaiting_confirmation", operatorRef, updatedAt: new Date().toISOString() });
  },
  markRunning(plan: ExecutionPlan, confirmation: ConfirmationProof, operatorRef: string): void {
    upsert({ plan, status: "running", confirmation, operatorRef, updatedAt: new Date().toISOString() });
  },
  complete(plan: ExecutionPlan, receipt: ExecutionReceipt, operatorRef: string): void {
    upsert({ plan, status: "done", receipt, operatorRef, updatedAt: new Date().toISOString() });
  },
  list(): ExecutionEntry[] {
    return entries;
  },
  get(planId: string): ExecutionEntry | undefined {
    return entries.find((e) => e.plan.id === planId);
  },
  clear(): void {
    entries = [];
    notify();
  },
  subscribe(fn: () => void): () => void {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
};

export function useExecutions(): ExecutionEntry[] {
  return useSyncExternalStore(
    (fn) => executionStore.subscribe(fn),
    () => entries,
    () => entries,
  );
}

/** Operator isolation: admins see the session's runs, everyone else sees theirs. */
export function visibleExecutions(
  all: ExecutionEntry[],
  operatorRef: string,
  isAdmin: boolean,
): ExecutionEntry[] {
  return isAdmin ? all : all.filter((e) => e.operatorRef === operatorRef);
}

/** Outcomes that still need an operator decision. */
export function needsAttention(all: ExecutionEntry[]): ExecutionEntry[] {
  return all.filter(
    (e) =>
      e.status === "awaiting_confirmation" ||
      e.receipt?.status === "uncertain" ||
      e.receipt?.status === "compensation_available",
  );
}
