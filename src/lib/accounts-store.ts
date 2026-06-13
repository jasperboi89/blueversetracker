import { useSyncExternalStore } from "react";
import { getShiftKey } from "./shift";
import { attachCloudSync } from "./cloud-sync/blob-sync";

export type AccountStatus = "active" | "archived";

export interface Account {
  number: string;
  name: string;
  status: AccountStatus;
  createdAt: number;
  updatedAt: number;
}

export interface AccountNote {
  id: string;
  accountNumber: string;
  text: string;
  createdAt: number;
  editedAt?: number;
  initials: string;
}

export type AccountTemplateType = "routine" | "urgent" | "blank";

export interface AccountTemplate {
  id: string;
  accountNumber: string;
  name: string;
  type: AccountTemplateType;
  expectedFlow: string;
  notes?: string;
  archived: boolean;
  order: number;
}

interface State {
  accounts: Account[];
  notes: AccountNote[];
  templates: AccountTemplate[];
  recent: Record<string, string[]>;
}

const KEY = "aih:accounts:v2";

let state: State = { accounts: [], notes: [], templates: [], recent: {} };
let initialized = false;
const listeners = new Set<() => void>();

function newId(p = "id") {
  return `${p}-${Math.random().toString(36).slice(2, 9)}`;
}

function seedAccounts(): Account[] {
  const now = Date.now();
  return [
    {
      number: "7431",
      name: "Sheboygan Internal Medicine",
      status: "active",
      createdAt: now,
      updatedAt: now,
    },
  ];
}

function loadInitial(): State {
  if (typeof window === "undefined") {
    return { accounts: [], notes: [], templates: [], recent: {} };
  }
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const p = JSON.parse(raw) as State;
      if (p && Array.isArray(p.accounts)) {
        return {
          accounts: p.accounts,
          notes: p.notes ?? [],
          templates: p.templates ?? [],
          recent: p.recent ?? {},
        };
      }
    }
  } catch {}
  return {
    accounts: seedAccounts(),
    notes: [],
    templates: [],
    recent: {},
  };
}

function ensureLoaded() {
  if (!initialized && typeof window !== "undefined") {
    state = loadInitial();
    initialized = true;
  }
}

function persist() {
  if (typeof window !== "undefined") {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch {}
  }
  listeners.forEach((l) => l());
}

export const accountsStore = {
  subscribe(l: () => void) { listeners.add(l); return () => listeners.delete(l); },
  getState(): State { ensureLoaded(); return state; },
  clearAll() {
    ensureLoaded();
    state = { accounts: [], notes: [], templates: [], recent: {} };
    persist();
  },
  get(num: string): Account | undefined {
    ensureLoaded();
    return state.accounts.find((a) => a.number === num);
  },
  search(query: string, opts: { includeArchived?: boolean } = {}): Account[] {
    ensureLoaded();
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return state.accounts
      .filter((a) => (opts.includeArchived ? true : a.status === "active"))
      .filter((a) => a.number.includes(q) || a.name.toLowerCase().includes(q))
      .sort((a, b) => {
        const aExact = a.number === query.trim() ? 0 : 1;
        const bExact = b.number === query.trim() ? 0 : 1;
        return aExact - bExact;
      })
      .slice(0, 8);
  },

  create(input: { number: string; name: string; status?: AccountStatus }): Account {
    ensureLoaded();
    const num = input.number.trim();
    if (!num) throw new Error("Account number required.");
    if (state.accounts.some((a) => a.number === num)) {
      throw new Error("Account already exists.");
    }
    const now = Date.now();
    const a: Account = {
      number: num,
      name: input.name.trim(),
      status: input.status ?? "active",
      createdAt: now,
      updatedAt: now,
    };
    state = { ...state, accounts: [a, ...state.accounts] };
    persist();
    return a;
  },

  update(num: string, patch: Partial<Pick<Account, "name" | "status">>) {
    ensureLoaded();
    state = {
      ...state,
      accounts: state.accounts.map((a) =>
        a.number === num ? { ...a, ...patch, updatedAt: Date.now() } : a,
      ),
    };
    persist();
  },

  archive(num: string) { this.update(num, { status: "archived" }); },
  restore(num: string) { this.update(num, { status: "active" }); },

  changeNumber(oldNum: string, newNum: string): { ok: boolean; error?: string } {
    ensureLoaded();
    const trimmed = newNum.trim();
    if (!trimmed) return { ok: false, error: "Account number required." };
    if (state.accounts.some((a) => a.number === trimmed)) {
      return { ok: false, error: "Account number already exists." };
    }
    state = {
      ...state,
      accounts: state.accounts.map((a) =>
        a.number === oldNum ? { ...a, number: trimmed, updatedAt: Date.now() } : a,
      ),
      notes: state.notes.map((n) =>
        n.accountNumber === oldNum ? { ...n, accountNumber: trimmed } : n,
      ),
      templates: state.templates.map((t) =>
        t.accountNumber === oldNum ? { ...t, accountNumber: trimmed } : t,
      ),
    };
    persist();
    return { ok: true };
  },

  addNote(num: string, text: string) {
    ensureLoaded();
    const note: AccountNote = {
      id: newId("an"), accountNumber: num, text, createdAt: Date.now(), initials: "LTP",
    };
    state = { ...state, notes: [note, ...state.notes] };
    persist();
  },
  editNote(noteId: string, text: string) {
    ensureLoaded();
    state = {
      ...state,
      notes: state.notes.map((n) =>
        n.id === noteId ? { ...n, text, editedAt: Date.now() } : n,
      ),
    };
    persist();
  },
  deleteNote(noteId: string) {
    ensureLoaded();
    state = { ...state, notes: state.notes.filter((n) => n.id !== noteId) };
    persist();
  },
  notesFor(num: string) {
    ensureLoaded();
    return state.notes
      .filter((n) => n.accountNumber === num)
      .sort((a, b) => b.createdAt - a.createdAt);
  },

  addTemplate(t: Omit<AccountTemplate, "id" | "order" | "archived">) {
    ensureLoaded();
    const order =
      state.templates.filter((x) => x.accountNumber === t.accountNumber).length;
    const tpl: AccountTemplate = { ...t, id: newId("tpl"), order, archived: false };
    state = { ...state, templates: [...state.templates, tpl] };
    persist();
  },
  updateTemplate(id: string, patch: Partial<AccountTemplate>) {
    ensureLoaded();
    state = {
      ...state,
      templates: state.templates.map((t) => (t.id === id ? { ...t, ...patch } : t)),
    };
    persist();
  },
  duplicateTemplate(id: string) {
    ensureLoaded();
    const t = state.templates.find((x) => x.id === id);
    if (!t) return;
    const order =
      state.templates.filter((x) => x.accountNumber === t.accountNumber).length;
    const dup: AccountTemplate = { ...t, id: newId("tpl"), name: `${t.name} (copy)`, order };
    state = { ...state, templates: [...state.templates, dup] };
    persist();
  },
  archiveTemplate(id: string) { this.updateTemplate(id, { archived: true }); },
  restoreTemplate(id: string) { this.updateTemplate(id, { archived: false }); },
  reorderTemplate(id: string, dir: -1 | 1) {
    ensureLoaded();
    const t = state.templates.find((x) => x.id === id);
    if (!t) return;
    const peers = state.templates
      .filter((x) => x.accountNumber === t.accountNumber)
      .sort((a, b) => a.order - b.order);
    const idx = peers.findIndex((x) => x.id === id);
    const swapIdx = idx + dir;
    if (swapIdx < 0 || swapIdx >= peers.length) return;
    const swap = peers[swapIdx];
    state = {
      ...state,
      templates: state.templates.map((x) =>
        x.id === t.id ? { ...x, order: swap.order } :
        x.id === swap.id ? { ...x, order: t.order } : x,
      ),
    };
    persist();
  },
  templatesFor(num: string, opts: { includeArchived?: boolean } = {}) {
    ensureLoaded();
    return state.templates
      .filter((t) => t.accountNumber === num)
      .filter((t) => (opts.includeArchived ? true : !t.archived))
      .sort((a, b) => a.order - b.order);
  },

  touchRecent(num: string) {
    ensureLoaded();
    const sk = getShiftKey();
    const prev = state.recent[sk] ?? [];
    const next = [num, ...prev.filter((n) => n !== num)].slice(0, 5);
    state = { ...state, recent: { ...state.recent, [sk]: next } };
    persist();
  },
  getRecent(): Account[] {
    ensureLoaded();
    const sk = getShiftKey();
    const ids = state.recent[sk] ?? [];
    return ids.map((n) => state.accounts.find((a) => a.number === n)).filter(Boolean) as Account[];
  },
};

export function useAccounts() {
  return useSyncExternalStore(
    accountsStore.subscribe,
    () => accountsStore.getState(),
    () => ({ accounts: [], notes: [], templates: [], recent: {} } as State),
  );
}

attachCloudSync<State>({
  storeKey: "accounts",
  subscribe: (cb) => {
    listeners.add(cb);
    return () => { listeners.delete(cb); };
  },
  getSnapshot: () => { ensureLoaded(); return state; },
  applyServerSnapshot: (next) => {
    state = {
      accounts: next.accounts ?? [],
      notes: next.notes ?? [],
      templates: next.templates ?? [],
      recent: next.recent ?? {},
    };
    initialized = true;
    persist();
  },
  isEmpty: (s) => (s.accounts?.length ?? 0) === 0 && (s.notes?.length ?? 0) === 0 && (s.templates?.length ?? 0) === 0,
});