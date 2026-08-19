import { useSyncExternalStore } from "react";
import type { ShiftWindow } from "./shift-window";
import { windowsKey as makeWindowsKey, combinedWindowsLabel } from "./shift-window";

export type EmailVersionLabel =
  | "Generated"
  | "User Edited"
  | "Final Sent / Marked Sent";

export interface EmailVersion {
  id: string;
  label: EmailVersionLabel;
  body: string;
  createdAt: number;
  sentAt?: number;
  initials: string;
}

export interface EmailDraft {
  id: string;
  windowKey: string; // identifies window (kind:current or custom-range)
  windowLabel: string;
  windowTimeLabel: string;
  windowStartMs: number;
  windowEndMs: number;
  /** When multiple shifts are combined into one email. Single-shift drafts leave this empty. */
  windowKeys?: string[];
  attentionIds: string[];           // explicitly selected attention items (kind:id)
  hiddenSectionKeys: string[];      // section keys hidden by user
  /** Concise-mode: per-item AI/edited summaries keyed by `${kind}:${recordId}`. */
  conciseSummaries?: Record<string, { issue: string; changes: string; notes: string }>;
  /** Concise-mode: item keys the operator removed from the email. */
  conciseExcluded?: string[];
  /** Preferred email style for this draft. */
  mode?: "concise" | "detailed";
  versions: EmailVersion[];
  sentAt?: number;
  updatedAt: number;
  createdAt: number;
}

interface State {
  drafts: EmailDraft[];
}

const KEY = "aih:prog-email:v1";

let state: State = { drafts: [] };
let initialized = false;
const listeners = new Set<() => void>();

function load(): State {
  if (typeof window === "undefined") return { drafts: [] };
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const p = JSON.parse(raw) as State;
      if (Array.isArray(p.drafts)) return p;
    }
  } catch {}
  return { drafts: [] };
}
function ensureLoaded() {
  if (!initialized && typeof window !== "undefined") {
    state = load();
    initialized = true;
  }
}
function persist() {
  if (typeof window !== "undefined") {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch {}
  }
  listeners.forEach((l) => l());
}
function newId(p = "id") { return `${p}-${Math.random().toString(36).slice(2, 9)}`; }

export function windowKey(w: ShiftWindow): string {
  return `${w.kind}:${w.start.getTime()}:${w.end.getTime()}`;
}

function patch(id: string, fn: (d: EmailDraft) => EmailDraft) {
  state = {
    drafts: state.drafts.map((d) =>
      d.id === id ? { ...fn(d), updatedAt: Date.now() } : d,
    ),
  };
  persist();
}

export const progEmailStore = {
  subscribe(l: () => void) { listeners.add(l); return () => listeners.delete(l); },
  getState(): State { ensureLoaded(); return state; },

  findOrCreate(w: ShiftWindow): EmailDraft {
    ensureLoaded();
    const key = windowKey(w);
    const existing = state.drafts.find((d) => d.windowKey === key && !d.sentAt);
    if (existing) return existing;
    const now = Date.now();
    const draft: EmailDraft = {
      id: newId("pem"),
      windowKey: key,
      windowLabel: w.label,
      windowTimeLabel: w.timeLabel,
      windowStartMs: w.start.getTime(),
      windowEndMs: w.end.getTime(),
      attentionIds: [],
      hiddenSectionKeys: [],
      versions: [],
      createdAt: now,
      updatedAt: now,
    };
    state = { drafts: [draft, ...state.drafts] };
    persist();
    return draft;
  },

  findOrCreateMulti(ws: ShiftWindow[]): EmailDraft {
    ensureLoaded();
    if (ws.length === 1) return this.findOrCreate(ws[0]);
    const key = makeWindowsKey(ws);
    const existing = state.drafts.find((d) => d.windowKey === key && !d.sentAt);
    if (existing) return existing;
    const now = Date.now();
    const sorted = [...ws].sort((a, b) => a.start.getTime() - b.start.getTime());
    const draft: EmailDraft = {
      id: newId("pem"),
      windowKey: key,
      windowKeys: ws.map((w) => windowKey(w)),
      windowLabel: combinedWindowsLabel(ws),
      windowTimeLabel: `${ws.length} shifts combined`,
      windowStartMs: sorted[0].start.getTime(),
      windowEndMs: sorted[sorted.length - 1].end.getTime(),
      attentionIds: [],
      hiddenSectionKeys: [],
      versions: [],
      createdAt: now,
      updatedAt: now,
    };
    state = { drafts: [draft, ...state.drafts] };
    persist();
    return draft;
  },

  get(id: string): EmailDraft | undefined {
    ensureLoaded();
    return state.drafts.find((d) => d.id === id);
  },

  setAttention(id: string, ids: string[]) {
    patch(id, (d) => ({ ...d, attentionIds: ids }));
  },

  toggleSectionHidden(id: string, key: string) {
    patch(id, (d) => {
      const has = d.hiddenSectionKeys.includes(key);
      return {
        ...d,
        hiddenSectionKeys: has
          ? d.hiddenSectionKeys.filter((k) => k !== key)
          : [...d.hiddenSectionKeys, key],
      };
    });
  },

  setMode(id: string, mode: "concise" | "detailed") {
    patch(id, (d) => ({ ...d, mode }));
  },

  setConciseSummaries(
    id: string,
    summaries: Record<string, { issue: string; changes: string; notes: string }>,
  ) {
    patch(id, (d) => ({ ...d, conciseSummaries: summaries }));
  },

  setConciseSummary(
    id: string,
    key: string,
    summary: { issue: string; changes: string; notes: string },
  ) {
    patch(id, (d) => ({
      ...d,
      conciseSummaries: { ...(d.conciseSummaries ?? {}), [key]: summary },
    }));
  },

  toggleConciseExcluded(id: string, key: string) {
    patch(id, (d) => {
      const cur = d.conciseExcluded ?? [];
      return {
        ...d,
        conciseExcluded: cur.includes(key) ? cur.filter((k) => k !== key) : [...cur, key],
      };
    });
  },

  saveVersion(id: string, label: EmailVersionLabel, body: string) {
    patch(id, (d) => {
      const v: EmailVersion = {
        id: newId("ev"),
        label,
        body,
        createdAt: Date.now(),
        initials: "LTP",
      };
      return { ...d, versions: [v, ...d.versions] };
    });
  },

  markSent(id: string, body: string) {
    patch(id, (d) => {
      const v: EmailVersion = {
        id: newId("ev"),
        label: "Final Sent / Marked Sent",
        body,
        createdAt: Date.now(),
        sentAt: Date.now(),
        initials: "LTP",
      };
      return { ...d, versions: [v, ...d.versions], sentAt: Date.now() };
    });
  },

  restoreVersion(id: string, versionId: string): string | undefined {
    ensureLoaded();
    const d = state.drafts.find((x) => x.id === id);
    const v = d?.versions.find((x) => x.id === versionId);
    return v?.body;
  },
};

export function useProgEmail() {
  return useSyncExternalStore(
    progEmailStore.subscribe,
    () => progEmailStore.getState(),
    () => ({ drafts: [] as EmailDraft[] }),
  );
}