import { useSyncExternalStore } from "react";
import { getShiftKey } from "./shift";

export type TicketStatus = "working" | "waiting-cs" | "waiting-prog" | "completed";
export type ResultStatus = "passed" | "failed" | "waiting-cs" | "waiting-prog" | "completed";
export type SnipCategory =
  | "Before Change"
  | "After Change"
  | "Testing Result"
  | "Error / Issue"
  | "Other";
export type IssueClassification = "Scripting Issue" | "Client Change" | "Other";

export interface TicketDetails {
  subject: string;
  region: string;
  company: string;
  topic: string;
  type: string;
  priority: string;
  group: string;
  agent: string;
  freshdeskUrl: string;
}

export interface FreshdeskNote {
  id: string;
  author: string;
  createdAt: number;
  body: string;
  freshdeskId?: string;
  source?: "freshdesk" | "hub";
}
export interface HubHistoryEntry {
  id: string;
  initials: string;
  createdAt: number;
  body: string;
  kind: "note" | "system" | "snip";
}
export interface FreshdeskAttachment {
  id: string;
  name: string;
  createdAt: number;
  size?: string;
  freshdeskId?: string;
  url?: string;
  contentType?: string;
  source?: "freshdesk" | "hub";
}
export interface HubSnip {
  id: string;
  name: string;
  category: SnipCategory;
  label?: string;
  createdAt: number;
  initials: string;
  dataUrl?: string; // image data url
  isImage: boolean;
}

export interface Ticket {
  id: string;
  number: string;
  accountNumber: string;
  accountName: string;
  status: TicketStatus;
  priority?: "Low" | "Medium" | "High" | "Urgent";
  dueAt?: number;
  updatedAt: number;
  syncedAt?: number;
  lastSyncFailed?: boolean;
  completedAt?: number;
  issueClassification?: IssueClassification;
  details: TicketDetails;
  freshdeskNotes: FreshdeskNote[];
  hubHistory: HubHistoryEntry[];
  freshdeskAttachments: FreshdeskAttachment[];
  hubSnips: HubSnip[];
  /** Due-date source tracking — Phase 6 */
  dueSource?: "freshdesk" | "hub-manual" | "hub-override";
  dueHistory?: Array<{ prev?: number; next?: number; source: NonNullable<Ticket["dueSource"]>; at: number; initials: string }>;
  /** Seed/demo flag — hidden when Demo Mode is OFF */
  isDemo?: boolean;
}

export interface WorkSession {
  ticketId: string;
  issueText: string;
  changesText: string;
  resultStatus: ResultStatus | null;
  failureReason: string;
  waitingReason: string;
  resultNotes: string;
  generatedNote: string;
  notePosted?: boolean;
  notePostedAt?: number;
  noteVersion: number;
  templateOverride?: NoteTemplate | null;
}

export type NoteTemplate =
  | "Standard Ticket Work Note"
  | "Client Change Note"
  | "Scripting Issue Note";

interface State {
  tickets: Ticket[];
  workSessions: Record<string, WorkSession>;
  recentIds: Record<string, string[]>; // by shift key
}

const KEY = "aih:tickets:v1";

const initialDetails = (over: Partial<TicketDetails> = {}): TicketDetails => ({
  subject: "",
  region: "Central",
  company: "",
  topic: "Account Settings",
  type: "Service Request",
  priority: "Medium",
  group: "Night Operations",
  agent: "Unassigned",
  freshdeskUrl: "https://example.freshdesk.com/a/tickets/0",
  ...over,
});

function seed(): Ticket[] {
  const now = Date.now();
  const m = 60_000;
  const h = 60 * m;
  const items: Ticket[] = [
    {
      id: "t-30182",
      number: "30182",
      accountNumber: "5426",
      accountName: "Riverbend Family Clinic",
      status: "working",
      priority: "High",
      dueAt: now - 45 * m, // overdue
      updatedAt: now - 30 * m,
      syncedAt: now - 25 * m,
      details: initialDetails({
        subject: "Update overnight on-call rotation",
        company: "Riverbend Family Clinic",
        topic: "On-Call Schedule",
        type: "Change Request",
        priority: "High",
        agent: "L. Park",
        freshdeskUrl: "https://example.freshdesk.com/a/tickets/30182",
      }),
      freshdeskNotes: [
        { id: "n1", author: "Customer", createdAt: now - 3 * h, body: "Please rotate Dr. Cole to Monday/Wednesday overnight." },
        { id: "n2", author: "L. Park", createdAt: now - 90 * m, body: "Confirmed. Starting tonight." },
        { id: "n3", author: "Customer", createdAt: now - 55 * m, body: "Thanks — also add Dr. Reyes to weekend backup." },
        { id: "n4", author: "System", createdAt: now - 40 * m, body: "Priority raised to High." },
      ],
      hubHistory: [
        { id: "h1", initials: "LTP", createdAt: now - 28 * m, body: "Pulled into Hub. Reviewing rotation file.", kind: "system" },
        { id: "h2", initials: "LTP", createdAt: now - 20 * m, body: "Confirmed Dr. Cole's schedule with on-call grid.", kind: "note" },
      ],
      freshdeskAttachments: [
        { id: "fa1", name: "rotation-current.pdf", createdAt: now - 3 * h, size: "184 KB" },
        { id: "fa2", name: "after-hours-protocol.png", createdAt: now - 2 * h, size: "212 KB" },
      ],
      hubSnips: [
        { id: "s1", name: "Before — rotation grid", category: "Before Change", createdAt: now - 22 * m, initials: "LTP", isImage: false },
      ],
    },
    {
      id: "t-30191",
      number: "30191",
      accountNumber: "4821",
      accountName: "Cedar Oaks Veterinary",
      status: "waiting-cs",
      priority: "Medium",
      dueAt: now + 4 * h,
      updatedAt: now - 2 * h,
      syncedAt: now - 90 * m,
      details: initialDetails({
        subject: "Add new dispatch contact",
        company: "Cedar Oaks Veterinary",
        topic: "Dispatch List",
        type: "Service Request",
        priority: "Medium",
        agent: "Night CS",
        freshdeskUrl: "https://example.freshdesk.com/a/tickets/30191",
      }),
      freshdeskNotes: [
        { id: "n1", author: "Customer", createdAt: now - 5 * h, body: "Add Dr. Wei to overnight dispatch list." },
        { id: "n2", author: "L. Park", createdAt: now - 2 * h, body: "Need confirmation of after-hours contact #." },
      ],
      hubHistory: [
        { id: "h1", initials: "LTP", createdAt: now - 2 * h, body: "Sent CS clarification request.", kind: "note" },
      ],
      freshdeskAttachments: [],
      hubSnips: [],
    },
    {
      id: "t-30205",
      number: "30205",
      accountNumber: "6610",
      accountName: "Lakeside Cardiology",
      status: "waiting-prog",
      // no priority, no due, never synced
      updatedAt: now - 4 * h,
      details: initialDetails({
        subject: "After-hours auto-routing script issue",
        company: "Lakeside Cardiology",
        topic: "Scripting",
        type: "Bug",
        priority: "Medium",
        agent: "Programming",
        freshdeskUrl: "https://example.freshdesk.com/a/tickets/30205",
      }),
      freshdeskNotes: [
        { id: "n1", author: "L. Park", createdAt: now - 4 * h, body: "Sent to programming — auto-routing skips overnight queue." },
      ],
      hubHistory: [
        { id: "h1", initials: "LTP", createdAt: now - 4 * h, body: "Escalated to programming.", kind: "system" },
      ],
      freshdeskAttachments: [
        { id: "fa1", name: "routing-log.txt", createdAt: now - 4 * h, size: "8 KB" },
      ],
      hubSnips: [],
    },
    {
      id: "t-30199",
      number: "30199",
      accountNumber: "2188",
      accountName: "Northstar Pediatrics",
      status: "working",
      // no due, no priority
      updatedAt: now - 75 * m,
      // never synced
      details: initialDetails({
        subject: "Update greeting script",
        company: "Northstar Pediatrics",
        topic: "Greeting / Scripting",
        type: "Change Request",
        agent: "L. Park",
        freshdeskUrl: "https://example.freshdesk.com/a/tickets/30199",
      }),
      freshdeskNotes: [],
      hubHistory: [],
      freshdeskAttachments: [],
      hubSnips: [],
    },
  ];
  return items.map((t) => ({ ...t, isDemo: true }));
}

function loadInitial(): State {
  if (typeof window === "undefined") {
    return { tickets: [], workSessions: {}, recentIds: {} };
  }
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as State;
      if (parsed?.tickets?.length) return parsed;
    }
  } catch {}
  return { tickets: seed(), workSessions: {}, recentIds: {} };
}

let state: State = { tickets: [], workSessions: {}, recentIds: {} };
let initialized = false;
const listeners = new Set<() => void>();

function ensureLoaded() {
  if (!initialized && typeof window !== "undefined") {
    state = loadInitial();
    initialized = true;
  }
}
function persist() {
  if (typeof window !== "undefined") {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch {}
  }
  listeners.forEach((l) => l());
}

function newId(prefix = "id") {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
}

function defaultSession(ticketId: string): WorkSession {
  return {
    ticketId,
    issueText: "",
    changesText: "",
    resultStatus: null,
    failureReason: "",
    waitingReason: "",
    resultNotes: "",
    generatedNote: "",
    noteVersion: 0,
  };
}

export const ticketsStore = {
  subscribe(l: () => void) {
    listeners.add(l);
    return () => listeners.delete(l);
  },
  getState(): State {
    ensureLoaded();
    return state;
  },
  getTicket(id: string): Ticket | undefined {
    ensureLoaded();
    return state.tickets.find((t) => t.id === id);
  },
  getByNumber(num: string): Ticket | undefined {
    ensureLoaded();
    return state.tickets.find((t) => t.number === num);
  },
  getSession(ticketId: string): WorkSession {
    ensureLoaded();
    return state.workSessions[ticketId] ?? defaultSession(ticketId);
  },
  updateSession(ticketId: string, patch: Partial<WorkSession>) {
    ensureLoaded();
    const cur = state.workSessions[ticketId] ?? defaultSession(ticketId);
    state = {
      ...state,
      workSessions: { ...state.workSessions, [ticketId]: { ...cur, ...patch } },
    };
    persist();
  },
  touchRecent(ticketId: string) {
    ensureLoaded();
    const sk = getShiftKey();
    const prev = state.recentIds[sk] ?? [];
    const next = [ticketId, ...prev.filter((id) => id !== ticketId)].slice(0, 5);
    state = { ...state, recentIds: { ...state.recentIds, [sk]: next } };
    persist();
  },
  getRecent(): Ticket[] {
    ensureLoaded();
    const sk = getShiftKey();
    const ids = state.recentIds[sk] ?? [];
    return ids.map((id) => state.tickets.find((t) => t.id === id)).filter(Boolean) as Ticket[];
  },
  addNote(ticketId: string, body: string) {
    ensureLoaded();
    const entry: HubHistoryEntry = {
      id: newId("hh"),
      initials: "LTP",
      createdAt: Date.now(),
      body,
      kind: "note",
    };
    state = {
      ...state,
      tickets: state.tickets.map((t) =>
        t.id === ticketId ? { ...t, hubHistory: [entry, ...t.hubHistory], updatedAt: Date.now() } : t,
      ),
    };
    persist();
  },
  addSnip(ticketId: string, snip: Omit<HubSnip, "id" | "createdAt" | "initials">) {
    ensureLoaded();
    const s: HubSnip = { ...snip, id: newId("snip"), createdAt: Date.now(), initials: "LTP" };
    const histEntry: HubHistoryEntry = {
      id: newId("hh"),
      initials: "LTP",
      createdAt: Date.now(),
      body: `Saved snip — ${s.category}${s.label ? ` (${s.label})` : ""}`,
      kind: "snip",
    };
    state = {
      ...state,
      tickets: state.tickets.map((t) =>
        t.id === ticketId
          ? { ...t, hubSnips: [s, ...t.hubSnips], hubHistory: [histEntry, ...t.hubHistory], updatedAt: Date.now() }
          : t,
      ),
    };
    persist();
  },
  removeSnip(ticketId: string, snipId: string) {
    ensureLoaded();
    state = {
      ...state,
      tickets: state.tickets.map((t) =>
        t.id === ticketId ? { ...t, hubSnips: t.hubSnips.filter((s) => s.id !== snipId) } : t,
      ),
    };
    persist();
  },
  /**
   * Mark a sync as failed (e.g. Freshdesk credentials missing).
   * Real sync data is merged via `mergeFreshdeskData`.
   */
  recordSyncFailure(ticketId: string) {
    ensureLoaded();
    state = {
      ...state,
      tickets: state.tickets.map((t) =>
        t.id === ticketId ? { ...t, lastSyncFailed: true } : t,
      ),
    };
    persist();
  },
  /**
   * Merge Freshdesk data into an existing ticket. Returns counts so the UI
   * can render an accurate sync summary. Dedupe by Freshdesk note/attachment
   * id when present, falling back to (author+createdAt+body) and (name+size+createdAt).
   */
  mergeFreshdeskData(
    ticketId: string,
    payload: {
      details?: Partial<TicketDetails>;
      status?: TicketStatus;
      priority?: Ticket["priority"];
      dueAt?: number;
      newNotes: FreshdeskNote[];
      newAttachments: FreshdeskAttachment[];
    },
  ): { newNotes: number; newAttachments: number; alreadyNotes: number; alreadyAttachments: number } {
    ensureLoaded();
    const t = state.tickets.find((x) => x.id === ticketId);
    if (!t) return { newNotes: 0, newAttachments: 0, alreadyNotes: 0, alreadyAttachments: 0 };

    const existingNoteKeys = new Set(
      t.freshdeskNotes.map((n) =>
        n.freshdeskId ? `id:${n.freshdeskId}` : `k:${n.author}|${n.createdAt}|${(n.body ?? "").slice(0, 80)}`,
      ),
    );
    const existingAttKeys = new Set(
      t.freshdeskAttachments.map((a) =>
        a.freshdeskId ? `id:${a.freshdeskId}` : `k:${a.name}|${a.size ?? ""}|${a.createdAt}`,
      ),
    );

    const addNotes: FreshdeskNote[] = [];
    let alreadyNotes = 0;
    for (const n of payload.newNotes) {
      const key = n.freshdeskId ? `id:${n.freshdeskId}` : `k:${n.author}|${n.createdAt}|${(n.body ?? "").slice(0, 80)}`;
      if (existingNoteKeys.has(key)) { alreadyNotes++; continue; }
      addNotes.push({ ...n, source: "freshdesk" });
    }

    const addAtts: FreshdeskAttachment[] = [];
    let alreadyAtts = 0;
    for (const a of payload.newAttachments) {
      const key = a.freshdeskId ? `id:${a.freshdeskId}` : `k:${a.name}|${a.size ?? ""}|${a.createdAt}`;
      if (existingAttKeys.has(key)) { alreadyAtts++; continue; }
      addAtts.push({ ...a, source: "freshdesk" });
    }

    state = {
      ...state,
      tickets: state.tickets.map((tk) => {
        if (tk.id !== ticketId) return tk;
        const next: Ticket = {
          ...tk,
          details: { ...tk.details, ...(payload.details ?? {}) },
          ...(payload.status ? { status: payload.status } : {}),
          ...(payload.priority ? { priority: payload.priority } : {}),
          freshdeskNotes: [...addNotes, ...tk.freshdeskNotes].sort((x, y) => y.createdAt - x.createdAt),
          freshdeskAttachments: [...addAtts, ...tk.freshdeskAttachments].sort((x, y) => y.createdAt - x.createdAt),
          syncedAt: Date.now(),
          lastSyncFailed: false,
        };
        // Freshdesk due date — set only if user hasn't overridden
        if (payload.dueAt !== undefined && tk.dueSource !== "hub-override") {
          if (next.dueAt !== payload.dueAt) {
            next.dueAt = payload.dueAt;
            next.dueSource = "freshdesk";
            next.dueHistory = [
              { prev: tk.dueAt, next: payload.dueAt, source: "freshdesk", at: Date.now(), initials: "LTP" },
              ...(tk.dueHistory ?? []),
            ];
          }
        }
        return next;
      }),
    };
    persist();
    return { newNotes: addNotes.length, newAttachments: addAtts.length, alreadyNotes, alreadyAttachments: alreadyAtts };
  },
  /** Set/override due date with source tracking. */
  setDueDate(ticketId: string, dueAt: number | undefined, source: "hub-manual" | "hub-override") {
    ensureLoaded();
    state = {
      ...state,
      tickets: state.tickets.map((t) => {
        if (t.id !== ticketId) return t;
        return {
          ...t,
          dueAt,
          dueSource: source,
          dueHistory: [
            { prev: t.dueAt, next: dueAt, source, at: Date.now(), initials: "LTP" },
            ...(t.dueHistory ?? []),
          ],
          updatedAt: Date.now(),
        };
      }),
    };
    persist();
  },
  markPosted(ticketId: string) {
    ensureLoaded();
    const cur = state.workSessions[ticketId] ?? defaultSession(ticketId);
    state = {
      ...state,
      workSessions: {
        ...state.workSessions,
        [ticketId]: { ...cur, notePosted: true, notePostedAt: Date.now() },
      },
      tickets: state.tickets.map((t) =>
        t.id === ticketId
          ? {
              ...t,
              hubHistory: [
                {
                  id: newId("hh"),
                  initials: "LTP",
                  createdAt: Date.now(),
                  body: "Marked generated note as posted manually.",
                  kind: "system",
                },
                ...t.hubHistory,
              ],
            }
          : t,
      ),
    };
    persist();
  },
  markCompleted(ticketId: string, classification: IssueClassification) {
    ensureLoaded();
    state = {
      ...state,
      tickets: state.tickets.map((t) =>
        t.id === ticketId
          ? { ...t, status: "completed", completedAt: Date.now(), issueClassification: classification }
          : t,
      ),
    };
    persist();
  },
  setIssueClassification(ticketId: string, classification: IssueClassification | null) {
    ensureLoaded();
    state = {
      ...state,
      tickets: state.tickets.map((t) =>
        t.id === ticketId
          ? { ...t, issueClassification: classification ?? undefined, updatedAt: Date.now() }
          : t,
      ),
    };
    persist();
  },
  createManual(number?: string, accountNumber = "", accountName = "Manual Entry"): Ticket {
    ensureLoaded();
    const n = number?.trim() || String(40000 + Math.floor(Math.random() * 9999));
    const t: Ticket = {
      id: newId("t"),
      number: n,
      accountNumber: accountNumber || "----",
      accountName,
      status: "working",
      updatedAt: Date.now(),
      details: initialDetails({ subject: "Manual ticket work session" }),
      freshdeskNotes: [],
      hubHistory: [
        { id: newId("hh"), initials: "LTP", createdAt: Date.now(), body: "Created manually in Hub.", kind: "system" },
      ],
      freshdeskAttachments: [],
      hubSnips: [],
    };
    state = { ...state, tickets: [t, ...state.tickets] };
    persist();
    return t;
  },
  /** Create a Hub ticket record from normalized Freshdesk data. */
  createFromFreshdesk(input: {
    number: string;
    subject: string;
    accountNumber?: string;
    accountName?: string;
    status?: TicketStatus;
    priority?: Ticket["priority"];
    dueAt?: number;
    freshdeskUrl: string;
    requesterName?: string;
    companyName?: string;
    type?: string;
    notes: FreshdeskNote[];
    attachments: FreshdeskAttachment[];
  }): Ticket {
    ensureLoaded();
    const existing = state.tickets.find((t) => t.number === input.number);
    if (existing) return existing;
    const t: Ticket = {
      id: newId("t"),
      number: input.number,
      accountNumber: input.accountNumber ?? "----",
      accountName: input.accountName ?? input.companyName ?? "Unlinked Account",
      status: input.status ?? "working",
      priority: input.priority,
      dueAt: input.dueAt,
      dueSource: input.dueAt ? "freshdesk" : undefined,
      dueHistory: input.dueAt
        ? [{ next: input.dueAt, source: "freshdesk", at: Date.now(), initials: "LTP" }]
        : undefined,
      updatedAt: Date.now(),
      syncedAt: Date.now(),
      details: initialDetails({
        subject: input.subject,
        company: input.companyName ?? "",
        type: input.type ?? "Service Request",
        freshdeskUrl: input.freshdeskUrl,
      }),
      freshdeskNotes: input.notes.map((n) => ({ ...n, source: "freshdesk" as const })),
      hubHistory: [
        { id: newId("hh"), initials: "LTP", createdAt: Date.now(), body: "Pulled ticket from Freshdesk.", kind: "system" },
      ],
      freshdeskAttachments: input.attachments.map((a) => ({ ...a, source: "freshdesk" as const })),
      hubSnips: [],
    };
    state = { ...state, tickets: [t, ...state.tickets] };
    persist();
    return t;
  },
  /** Internal: append seed tickets, dedupe by id. Used by reports demo data. */
  _seedExtra(items: Ticket[]) {
    ensureLoaded();
    const existing = new Set(state.tickets.map((t) => t.id));
    const additions = items.filter((t) => !existing.has(t.id));
    if (additions.length === 0) return;
    state = { ...state, tickets: [...additions, ...state.tickets] };
    persist();
  },
};

export function useTickets() {
  return useSyncExternalStore(
    ticketsStore.subscribe,
    () => ticketsStore.getState(),
    () => ({ tickets: [], workSessions: {}, recentIds: {} }),
  );
}

export function isOverdue(t: Ticket, now = Date.now()): boolean {
  return !!t.dueAt && t.dueAt < now;
}

export const STATUS_LABEL: Record<TicketStatus, string> = {
  working: "Currently Working On",
  "waiting-cs": "Waiting on Customer Service",
  "waiting-prog": "Waiting on Programming",
  completed: "Completed",
};

export function suggestTemplate(c?: IssueClassification | null): NoteTemplate {
  if (c === "Scripting Issue") return "Scripting Issue Note";
  if (c === "Client Change") return "Client Change Note";
  return "Standard Ticket Work Note";
}

export function buildGeneratedNote(
  t: Ticket,
  s: WorkSession,
  template: NoteTemplate,
): string {
  const lines: string[] = [];
  lines.push(`[${template}]`);
  lines.push("");
  const issueHeader =
    template === "Scripting Issue Note"
      ? "Scripting Issue:"
      : template === "Client Change Note"
        ? "Client Requested Change:"
        : "Ticket Issue:";
  lines.push(issueHeader);
  lines.push(s.issueText.trim() || "(none provided)");
  lines.push("");
  const beforeSnips = t.hubSnips.filter((x) => x.category === "Before Change");
  if (beforeSnips.length) {
    lines.push("Before Change:");
    beforeSnips.forEach((s) => lines.push(`  • ${s.name}${s.label ? ` — ${s.label}` : ""}`));
    lines.push("");
  }
  lines.push("Changes Made:");
  lines.push(s.changesText.trim() || "(none provided)");
  lines.push("");
  const afterSnips = t.hubSnips.filter((x) => x.category === "After Change");
  if (afterSnips.length) {
    lines.push("After Change:");
    afterSnips.forEach((s) => lines.push(`  • ${s.name}${s.label ? ` — ${s.label}` : ""}`));
    lines.push("");
  }
  lines.push("Result / Testing:");
  const statusLabelMap: Record<ResultStatus, string> = {
    passed: "Passed",
    failed: "Failed",
    "waiting-cs": "Waiting on Customer Service",
    "waiting-prog": "Waiting on Programming",
    completed: "Completed",
  };
  if (s.resultStatus) lines.push(`Status: ${statusLabelMap[s.resultStatus]}`);
  if (s.resultStatus === "failed" && s.failureReason)
    lines.push(`Failure Reason: ${s.failureReason}`);
  if ((s.resultStatus === "waiting-cs" || s.resultStatus === "waiting-prog") && s.waitingReason)
    lines.push(`Waiting Reason: ${s.waitingReason}`);
  if (s.resultNotes.trim()) lines.push(s.resultNotes.trim());
  const testSnips = t.hubSnips.filter((x) => x.category === "Testing Result");
  if (testSnips.length) {
    lines.push("");
    lines.push("Testing Snips:");
    testSnips.forEach((s) => lines.push(`  • ${s.name}${s.label ? ` — ${s.label}` : ""}`));
  }
  lines.push("");
  lines.push("— LTP");
  return lines.join("\n");
}