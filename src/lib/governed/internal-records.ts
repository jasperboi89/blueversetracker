/**
 * Governed Actions — internal record stores.
 *
 * Two small, local-only stores that governed actions may write to:
 * shift summary DRAFTS and script fix FINDINGS. Both are internal: nothing
 * here reaches an external system, and nothing is written except through a
 * confirmed governed action's Safe Action handler.
 */

import { useSyncExternalStore } from "react";

export interface ShiftSummaryDraft {
  id: string;
  shiftKey: string;
  title: string;
  body: string;
  createdAt: number;
  createdBy: string;
}

export interface ScriptFixFinding {
  id: string;
  accountNumber: string;
  summary: string;
  detail: string;
  ticketNumber?: string;
  createdAt: number;
  createdBy: string;
}

interface State {
  drafts: ShiftSummaryDraft[];
  findings: ScriptFixFinding[];
}

const KEY = "acc:governed:internal-records:v1";
const MAX = 200;

let state: State = { drafts: [], findings: [] };
let loaded = false;
const listeners = new Set<() => void>();

function ensure(): void {
  if (loaded || typeof window === "undefined") return;
  loaded = true;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<State>;
      state = {
        drafts: Array.isArray(parsed.drafts) ? parsed.drafts : [],
        findings: Array.isArray(parsed.findings) ? parsed.findings : [],
      };
    }
  } catch {
    /* corrupt storage is treated as empty, never as an error the operator must fix */
  }
}

function persist(): void {
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(KEY, JSON.stringify(state));
    } catch {
      /* storage full — the in-memory record still stands */
    }
  }
  listeners.forEach((fn) => fn());
}

function id(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

export const internalRecords = {
  subscribe(fn: () => void): () => void {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
  get(): State {
    ensure();
    return state;
  },
  addShiftSummaryDraft(input: {
    shiftKey: string;
    title: string;
    body: string;
    createdBy?: string;
  }): ShiftSummaryDraft {
    ensure();
    const draft: ShiftSummaryDraft = {
      id: id("ssd"),
      shiftKey: input.shiftKey,
      title: input.title,
      body: input.body,
      createdAt: Date.now(),
      createdBy: input.createdBy ?? "operator",
    };
    state = { ...state, drafts: [draft, ...state.drafts].slice(0, MAX) };
    persist();
    return draft;
  },
  addScriptFixFinding(input: {
    accountNumber: string;
    summary: string;
    detail?: string;
    ticketNumber?: string;
    createdBy?: string;
  }): ScriptFixFinding {
    ensure();
    const finding: ScriptFixFinding = {
      id: id("sff"),
      accountNumber: input.accountNumber,
      summary: input.summary,
      detail: input.detail ?? "",
      ...(input.ticketNumber ? { ticketNumber: input.ticketNumber } : {}),
      createdAt: Date.now(),
      createdBy: input.createdBy ?? "operator",
    };
    state = { ...state, findings: [finding, ...state.findings].slice(0, MAX) };
    persist();
    return finding;
  },
  clear(): void {
    loaded = true;
    state = { drafts: [], findings: [] };
    persist();
  },
};

export function useInternalRecords(): State {
  return useSyncExternalStore(
    internalRecords.subscribe,
    () => internalRecords.get(),
    () => ({ drafts: [], findings: [] }) as State,
  );
}
