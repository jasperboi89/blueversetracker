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

/** Operator-facing queue state. Never collapses proposed with executed. */
export type QueueStatus =
  | "proposed"
  | "confirmed"
  | "executed"
  | "verified"
  | "cancelled"
  | "failed";

export interface ExecutionEntry {
  plan: ExecutionPlan;
  status: "awaiting_confirmation" | "running" | "done" | "cancelled";
  /** Why this change is being proposed, in the operator's own terms. */
  reason?: string;
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
  propose(plan: ExecutionPlan, operatorRef: string, reason?: string): void {
    upsert({
      plan,
      status: "awaiting_confirmation",
      operatorRef,
      ...(reason ? { reason } : {}),
      updatedAt: new Date().toISOString(),
    });
  },
  cancel(planId: string): void {
    const existing = entries.find((e) => e.plan.id === planId);
    if (!existing || existing.status === "done") return;
    upsert({ ...existing, status: "cancelled", updatedAt: new Date().toISOString() });
  },
  markRunning(plan: ExecutionPlan, confirmation: ConfirmationProof, operatorRef: string): void {
    const existing = entries.find((e) => e.plan.id === plan.id);
    upsert({
      ...existing,
      plan,
      status: "running",
      confirmation,
      operatorRef,
      updatedAt: new Date().toISOString(),
    });
  },
  complete(plan: ExecutionPlan, receipt: ExecutionReceipt, operatorRef: string): void {
    const existing = entries.find((e) => e.plan.id === plan.id);
    upsert({
      ...existing,
      plan,
      status: "done",
      receipt,
      operatorRef,
      updatedAt: new Date().toISOString(),
    });
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

/**
 * The queue state an operator sees. VERIFIED is only ever reported when
 * verification actually confirmed the effect.
 */
export function queueStatus(entry: ExecutionEntry): QueueStatus {
  if (entry.status === "cancelled") return "cancelled";
  if (entry.status === "awaiting_confirmation") return "proposed";
  if (entry.status === "running") return "confirmed";
  const receipt = entry.receipt;
  if (!receipt) return "confirmed";
  if (receipt.status === "succeeded") {
    return receipt.verification.status === "verified" ? "verified" : "executed";
  }
  if (receipt.status === "uncertain" || receipt.status === "compensation_available") {
    return "executed";
  }
  return "failed";
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
