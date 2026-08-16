/**
 * Phase 17 — bounded, in-memory record of recent agent runs.
 *
 * Runs are working state, not knowledge: nothing here is durable Operational
 * Memory, and only bounded run metadata is retained for inspection.
 */

import { useSyncExternalStore } from "react";
import type { AgentRun } from "./agent-contract";

const MAX_RUNS = 20;

let runs: AgentRun[] = [];
const listeners = new Set<() => void>();

function notify(): void {
  for (const fn of listeners) fn();
}

export const agentRunStore = {
  record(run: AgentRun): void {
    runs = [run, ...runs.filter((r) => r.task.id !== run.task.id)].slice(0, MAX_RUNS);
    notify();
  },
  list(): AgentRun[] {
    return runs;
  },
  get(runId: string): AgentRun | undefined {
    return runs.find((r) => r.task.id === runId);
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

export function useAgentRuns(): AgentRun[] {
  return useSyncExternalStore(
    (fn) => agentRunStore.subscribe(fn),
    () => runs,
    () => runs,
  );
}