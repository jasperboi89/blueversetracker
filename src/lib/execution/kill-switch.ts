/**
 * Phase 10 — global execution control (kill switch + safe mode).
 *
 * Fails CLOSED by intent: when execution is disabled, the engine refuses
 * before any reservation, provider call or state change. Planning, preview and
 * confirmation UX continue to work, so an operator can still see exactly what
 * would have happened.
 */

export type ExecutionMode = "enabled" | "safe_mode" | "disabled";

interface ControlState {
  mode: ExecutionMode;
  reason: string;
  changedAt: string;
}

let state: ControlState = { mode: "enabled", reason: "", changedAt: new Date(0).toISOString() };
const listeners = new Set<() => void>();

function set(next: ControlState): void {
  state = next;
  for (const fn of listeners) fn();
}

export const executionControl = {
  get(): ControlState {
    return state;
  },
  mode(): ExecutionMode {
    return state.mode;
  },
  disable(reason: string): void {
    set({ mode: "disabled", reason, changedAt: new Date().toISOString() });
  },
  /** Safe mode: only reversible, low-risk operations may execute. */
  safeMode(reason: string): void {
    set({ mode: "safe_mode", reason, changedAt: new Date().toISOString() });
  },
  enable(): void {
    set({ mode: "enabled", reason: "", changedAt: new Date().toISOString() });
  },
  subscribe(fn: () => void): () => void {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
};

export interface ControlCheck {
  allowed: boolean;
  message: string;
}

export function checkExecutionControl(input: {
  operationClass: string;
  riskClass: string;
  reversibility: string;
}): ControlCheck {
  if (state.mode === "disabled") {
    return {
      allowed: false,
      message: state.reason
        ? `Execution is currently switched off (${state.reason}).`
        : "Execution is currently switched off.",
    };
  }
  if (state.mode === "safe_mode") {
    const safe = input.reversibility === "reversible" && input.riskClass === "low";
    if (!safe) {
      return {
        allowed: false,
        message: "Safe mode is on: only low-risk, reversible changes can be applied right now.",
      };
    }
  }
  return { allowed: true, message: "" };
}
