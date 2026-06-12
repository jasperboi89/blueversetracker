import { useSyncExternalStore } from "react";
import { useDemoMode } from "./settings/demo-mode-store";

export type AdditionalWorkStatus = "working" | "completed";
export type AddWorkIssueClassification = "Scripting Issue" | "Client Change" | "Other";

export type AddWorkSnipCategory =
  | "Email / Request"
  | "Before Change"
  | "After Change"
  | "Testing Result"
  | "Error / Issue"
  | "Other";

export const ADDWORK_SNIP_CATEGORIES: AddWorkSnipCategory[] = [
  "Email / Request",
  "Before Change",
  "After Change",
  "Testing Result",
  "Error / Issue",
  "Other",
];

export interface AddWorkNote {
  id: string;
  text: string;
  createdAt: number;
  editedAt?: number;
  initials: string;
}

export interface AddWorkSnip {
  id: string;
  name: string;
  label?: string;
  category: AddWorkSnipCategory;
  dataUrl?: string;
  isImage: boolean;
  createdAt: number;
  initials: string;
}

export interface AdditionalWork {
  id: string;
  title: string;
  accountNumber?: string;
  accountName?: string;
  whatNeedsDone: string;
  notes: string;
  programmingStatusNotes: string;
  issueClassification?: AddWorkIssueClassification;
  status: AdditionalWorkStatus;
  createdAt: number;
  updatedAt: number;
  completedAt?: number;
  completedBy?: string;
  completionSummary?: string;
  completionFinalNotes?: string;
  nightPlanItemId?: string;
  snips: AddWorkSnip[];
  notesList: AddWorkNote[];
  /** Seed/demo flag — hidden when Demo Mode is OFF */
  isDemo?: boolean;
}

interface State {
  items: AdditionalWork[];
}

const KEY = "aih:addwork:v1";

let state: State = { items: [] };
let initialized = false;
const listeners = new Set<() => void>();

function newId(p = "id") {
  return `${p}-${Math.random().toString(36).slice(2, 9)}`;
}

function seed(): AdditionalWork[] {
  const now = Date.now();
  const m = 60_000;
  const h = 60 * m;
  const d = 24 * h;
  const mk = (over: Partial<AdditionalWork>): AdditionalWork => ({
    id: newId("aw"),
    title: "",
    whatNeedsDone: "",
    notes: "",
    programmingStatusNotes: "",
    status: "working",
    createdAt: now,
    updatedAt: now,
    snips: [],
    notesList: [],
    ...over,
  });
  return [
    mk({
      title: "Email Riverbend on revised overnight rotation",
      accountNumber: "1042",
      accountName: "Riverbend Family Clinic",
      whatNeedsDone:
        "Send confirmation email to Riverbend with the rotation update plus revised on-call grid.",
      notes: "Pull rotation grid attachment from ticket 30182 before sending.",
      programmingStatusNotes: "",
      updatedAt: now - 35 * m,
    }),
    mk({
      title: "Supervisor follow-up: weekend coverage exceptions",
      whatNeedsDone:
        "Document the weekend coverage exception list for Mark and send a quick recap.",
      notes: "No account linked — supervisor task.",
      updatedAt: now - 90 * m,
    }),
    mk({
      title: "Add Dr. Reyes to Cedar Oaks backup list",
      accountNumber: "4821",
      accountName: "Cedar Oaks Veterinary",
      whatNeedsDone:
        "Update Cedar Oaks backup contact list to include Dr. Reyes for weekend overnight backup.",
      notes: "",
      status: "completed",
      completedAt: now - 8 * h,
      completedBy: "LTP",
      completionSummary: "Added Dr. Reyes to weekend backup. Confirmed with CS via Slack.",
      updatedAt: now - 8 * h,
    }),
    mk({
      title: "Reach out to client re: holiday hours change",
      whatNeedsDone: "Email client about holiday hours change.",
      notes: "",
      status: "completed",
      completedAt: now - 1 * d,
      completedBy: "LTP",
      completionSummary: "Email sent. Awaiting confirmation.",
      updatedAt: now - 1 * d,
    }),
    mk({
      title: "Carry over: walk through new dispatcher script edits",
      accountNumber: "2188",
      accountName: "Northstar Pediatrics",
      whatNeedsDone:
        "Review dispatcher script edits with overnight team before next shift.",
      notes: "Originally a Night Plan item — converted to Additional Work.",
      nightPlanItemId: "np-mock-converted",
      updatedAt: now - 3 * h,
    }),
  ].map((w) => ({ ...w, isDemo: true }));
}

function loadInitial(): State {
  if (typeof window === "undefined") return { items: [] };
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const p = JSON.parse(raw) as State;
      if (Array.isArray(p?.items)) return runAddWorkDemoMigration(p);
    }
  } catch {}
  return { items: seed() };
}

const DEMO_MIGRATION_KEY = "aih:addwork:demo-recover:v1";
function runAddWorkDemoMigration(s: State): State {
  if (typeof window === "undefined") return s;
  if (localStorage.getItem(DEMO_MIGRATION_KEY)) return s;
  const next: State = {
    items: s.items.map((i) => {
      if (!i.isDemo) return i;
      const hasUserWork =
        (i.notesList?.length ?? 0) > 0 ||
        (i.snips?.length ?? 0) > 0 ||
        (i.completionFinalNotes?.trim()?.length ?? 0) > 0;
      return hasUserWork ? { ...i, isDemo: false } : i;
    }),
  };
  try { localStorage.setItem(DEMO_MIGRATION_KEY, "1"); } catch {}
  return next;
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

function patchItem(id: string, fn: (i: AdditionalWork) => AdditionalWork) {
  state = {
    ...state,
    items: state.items.map((i) => (i.id === id ? { ...fn(i), updatedAt: Date.now() } : i)),
  };
  persist();
}

export const additionalWorkStore = {
  subscribe(l: () => void) { listeners.add(l); return () => listeners.delete(l); },
  getState(): State { ensureLoaded(); return state; },
  clearAll() {
    ensureLoaded();
    state = { items: [] };
    persist();
  },
  get(id: string) { ensureLoaded(); return state.items.find((i) => i.id === id); },
  byAccount(num: string) {
    ensureLoaded();
    return state.items.filter((i) => i.accountNumber === num);
  },

  create(input: Partial<AdditionalWork> & { title: string }): AdditionalWork {
    ensureLoaded();
    const now = Date.now();
    const item: AdditionalWork = {
      id: newId("aw"),
      title: input.title,
      accountNumber: input.accountNumber,
      accountName: input.accountName,
      whatNeedsDone: input.whatNeedsDone ?? "",
      notes: input.notes ?? "",
      programmingStatusNotes: input.programmingStatusNotes ?? "",
      issueClassification: input.issueClassification,
      status: input.status ?? "working",
      createdAt: now,
      updatedAt: now,
      nightPlanItemId: input.nightPlanItemId,
      snips: [],
      notesList: [],
    };
    state = { ...state, items: [item, ...state.items] };
    persist();
    return item;
  },

  update(id: string, patch: Partial<AdditionalWork>) {
    patchItem(id, (i) => ({ ...i, ...patch }));
  },

  addNote(id: string, text: string) {
    const note: AddWorkNote = {
      id: newId("nt"), text, createdAt: Date.now(), initials: "LTP",
    };
    patchItem(id, (i) => ({ ...i, notesList: [note, ...i.notesList] }));
  },
  editNote(id: string, noteId: string, text: string) {
    patchItem(id, (i) => ({
      ...i,
      notesList: i.notesList.map((n) =>
        n.id === noteId ? { ...n, text, editedAt: Date.now() } : n,
      ),
    }));
  },
  deleteNote(id: string, noteId: string) {
    patchItem(id, (i) => ({ ...i, notesList: i.notesList.filter((n) => n.id !== noteId) }));
  },

  addSnip(id: string, snip: Omit<AddWorkSnip, "id" | "createdAt" | "initials">) {
    const s: AddWorkSnip = { ...snip, id: newId("sn"), createdAt: Date.now(), initials: "LTP" };
    patchItem(id, (i) => ({ ...i, snips: [s, ...i.snips] }));
  },
  deleteSnip(id: string, snipId: string) {
    patchItem(id, (i) => ({ ...i, snips: i.snips.filter((s) => s.id !== snipId) }));
  },

  markCompleted(
    id: string,
    opts: { summary?: string; finalNotes?: string } = {},
  ) {
    patchItem(id, (i) => ({
      ...i,
      status: "completed",
      completedAt: Date.now(),
      completedBy: "LTP",
      completionSummary: opts.summary ?? i.completionSummary,
      completionFinalNotes: opts.finalNotes ?? i.completionFinalNotes,
    }));
  },

  fromNightPlan(
    np: { id: string; task: string; notes?: string },
    account?: { number: string; name: string },
  ): AdditionalWork {
    const what = np.notes ? `${np.task}\n\n${np.notes}` : np.task;
    return this.create({
      title: np.task,
      whatNeedsDone: what,
      notes: np.notes ?? "",
      nightPlanItemId: np.id,
      accountNumber: account?.number,
      accountName: account?.name,
    });
  },

  remove(id: string) {
    ensureLoaded();
    state = { ...state, items: state.items.filter((i) => i.id !== id) };
    persist();
  },
  recoverRealWork(): number {
    ensureLoaded();
    let recovered = 0;
    const items = state.items.map((i) => {
      if (!i.isDemo) return i;
      const hasUserWork =
        (i.notesList?.length ?? 0) > 0 ||
        (i.snips?.length ?? 0) > 0 ||
        (i.completionFinalNotes?.trim()?.length ?? 0) > 0;
      if (hasUserWork) { recovered++; return { ...i, isDemo: false }; }
      return i;
    });
    state = { ...state, items };
    persist();
    return recovered;
  },
};

export function useAdditionalWork() {
  const snap = useSyncExternalStore(
    additionalWorkStore.subscribe,
    () => additionalWorkStore.getState(),
    () => ({ items: [] as AdditionalWork[] }),
  );
  const demo = useDemoMode();
  if (demo) return snap;
  return { ...snap, items: snap.items.filter((i) => !i.isDemo) };
}