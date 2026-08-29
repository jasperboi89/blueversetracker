/**
 * Phase 10 — global execution control (kill switch + safe mode).
 *
 * Fails CLOSED by intent: when execution is disabled, the engine refuses
 * before any reservation, provider call or state change. Planning, preview and
 * confirmation UX continue to work, so an operator can still see exactly what
 * would have happened.
 *
 * Activation 8 — the control is now DURABLE and AUDITED:
 *   - the mode survives a page reload / crash, so an emergency stop stays
 *     stopped until a human turns it back on;
 *   - every mode change keeps a bounded local trail (who, when, why) so a
 *     stop and a restart can be reconstructed after the fact.
 * Persistence never widens permission: a corrupt or unreadable record falls
 * back to `disabled`, not to `enabled`.
 */

export type ExecutionMode = "enabled" | "safe_mode" | "disabled";

export interface ControlChange {
  mode: ExecutionMode;
  reason: string;
  actor: string;
  at: string;
}

interface ControlState {
  mode: ExecutionMode;
  reason: string;
  changedAt: string;
  actor: string;
  /** Bounded local trail of mode changes, newest first. */
  history: ControlChange[];
}

const STORAGE_KEY = "aih:exec:control:v1";
const MAX_HISTORY = 50;
const MODES: ExecutionMode[] = ["enabled", "safe_mode", "disabled"];

const INITIAL: ControlState = {
  mode: "enabled",
  reason: "",
  changedAt: new Date(0).toISOString(),
  actor: "",
  history: [],
};

let state: ControlState = { ...INITIAL };
let loaded = false;
const listeners = new Set<() => void>();

function load(): void {
  if (loaded) return;
  loaded = true;
  if (typeof window === "undefined") return;
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return; // storage unreadable — stay with the in-memory default
  }
  if (!raw) return;
  try {
    const parsed = JSON.parse(raw) as Partial<ControlState>;
    if (!parsed || typeof parsed !== "object" || !MODES.includes(parsed.mode as ExecutionMode)) {
      // A damaged record must never be read as "execution is fine".
      state = {
        mode: "disabled",
        reason: "The saved execution-control record was unreadable, so execution stayed switched off.",
        changedAt: new Date().toISOString(),
        actor: "system",
        history: [],
      };
      return;
    }
    state = {
      mode: parsed.mode as ExecutionMode,
      reason: typeof parsed.reason === "string" ? parsed.reason : "",
      changedAt: typeof parsed.changedAt === "string" ? parsed.changedAt : new Date().toISOString(),
      actor: typeof parsed.actor === "string" ? parsed.actor : "",
      history: Array.isArray(parsed.history) ? parsed.history.slice(0, MAX_HISTORY) : [],
    };
  } catch {
    state = {
      mode: "disabled",
      reason: "The saved execution-control record was unreadable, so execution stayed switched off.",
      changedAt: new Date().toISOString(),
      actor: "system",
      history: [],
    };
  }
}

function persist(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Storage full or blocked: the in-memory mode still governs this session.
  }
}

function set(mode: ExecutionMode, reason: string, actor: string): void {
  load();
  const change: ControlChange = { mode, reason, actor, at: new Date().toISOString() };
  state = {
    mode,
    reason,
    actor,
    changedAt: change.at,
    history: [change, ...state.history].slice(0, MAX_HISTORY),
  };
  persist();
  for (const fn of listeners) fn();
}

export const executionControl = {
  get(): ControlState {
    load();
    return state;
  },
  mode(): ExecutionMode {
    load();
    return state.mode;
  },
  disable(reason: string, actor = "operator"): void {
    set("disabled", reason, actor);
  },
  /** Safe mode: only reversible, low-risk operations may execute. */
  safeMode(reason: string, actor = "operator"): void {
    set("safe_mode", reason, actor);
  },
  enable(actor = "operator"): void {
    set("enabled", "", actor);
  },
  /** Change trail, newest first. Local and bounded — not a substitute for the ledger. */
  history(): ControlChange[] {
    load();
    return state.history;
  },
  /** Test-only: wipe in-memory + stored state. */
  _resetForTests(): void {
    state = { ...INITIAL, history: [] };
    loaded = true;
    if (typeof window !== "undefined") {
      try { window.localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
    }
    for (const fn of listeners) fn();
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
  load();
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
