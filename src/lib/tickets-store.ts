import { useSyncExternalStore } from "react";
import { getShiftKey } from "./shift";
import { accountsStore } from "./accounts-store";
import { attachCloudSync } from "./cloud-sync/blob-sync";

/**
 * Extract only the "Request" and "Background Info" sections from a Freshdesk
 * ticket description. Returns "" if neither is found. Keeps the operator's
 * Ticket Issue field free of the noisy rest of the templated body.
 */
export function extractRequestAndBackground(html: string): string {
  if (!html) return "";
  // Convert to line-preserving plain text.
  let text = html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|tr|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, "");
  text = text
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&quot;/gi, '"');

  const STOP = [
    "request",
    "background info",
    "background information",
    "background",
    "steps to reproduce",
    "expected",
    "actual",
    "impact",
    "priority",
    "environment",
    "attachments",
    "notes",
    "additional info",
    "additional information",
    "contact",
    "account",
  ];
  const stopPattern = STOP.map((s) => s.replace(/ /g, "\\s+")).join("|");
  const headerRe = new RegExp(`^\\s*(${stopPattern})\\s*:?\\s*$`, "gim");

  type Section = { label: string; start: number; end: number };
  const matches: { label: string; index: number; end: number }[] = [];
  let m: RegExpExecArray | null;
  while ((m = headerRe.exec(text)) !== null) {
    matches.push({ label: m[1].toLowerCase().replace(/\s+/g, " "), index: m.index, end: headerRe.lastIndex });
  }

  const sections: Section[] = matches.map((mm, i) => ({
    label: mm.label,
    start: mm.end,
    end: i + 1 < matches.length ? matches[i + 1].index : text.length,
  }));

  const normalizeBody = (raw: string): string => {
    const lines = raw
      .replace(/\r/g, "")
      .split("\n")
      .map((ln) => ln.replace(/[ \t]+/g, " ").trimEnd());
    // Collapse leading blank lines
    while (lines.length && lines[0].trim() === "") lines.shift();
    while (lines.length && lines[lines.length - 1].trim() === "") lines.pop();
    // Collapse 2+ blank lines to a single blank line
    const out: string[] = [];
    let blank = false;
    for (const ln of lines) {
      const isBlank = ln.trim() === "";
      if (isBlank) {
        if (!blank && out.length) out.push("");
        blank = true;
      } else {
        out.push(ln.trimStart() === ln ? ln : ln.replace(/^\s+/, (s) => (/^[-*•]|^\d+[.)]/.test(ln.trim()) ? "" : s)));
        blank = false;
      }
    }
    return out.join("\n");
  };

  const pick = (labels: string[]): string => {
    const s = sections.find((x) => labels.includes(x.label));
    if (!s) return "";
    return normalizeBody(text.slice(s.start, s.end));
  };

  const request = pick(["request"]);
  const background = pick(["background info", "background information", "background"]);

  const formatSection = (title: string, body: string): string => {
    const rule = "─".repeat(title.length);
    return `${title}\n${rule}\n${body}`;
  };

  const parts: string[] = [];
  if (request) parts.push(formatSection("REQUEST", request));
  if (background) parts.push(formatSection("BACKGROUND INFO", background));
  return parts.join("\n\n\n");
}

/**
 * Fixed operator-facing template rendered from the AI parse. Every field
 * is always shown; missing values render as "Not provided." — never blank.
 */
export interface ParsedTicketIssueShape {
  issue?: string;
  background?: string;
  requestedAction?: string;
  specificField?: string;
  category?: string;
  messageTakingOrDispatching?: string;
  f9Issue?: string;
  attached?: {
    msgId?: string;
    callTimestamp?: string;
    messageSummary?: string;
    for?: string;
    caller?: string;
    phone?: string;
    patient?: string;
    message?: string;
  };
}
export function formatTicketIssue(p: ParsedTicketIssueShape): string {
  const esc = (s: string) =>
    s
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  const v = (s?: string) => {
    const t = (s ?? "").trim();
    return t.length ? esc(t) : "Not provided.";
  };
  const heading = (label: string) => `<p><strong>${label}</strong></p>`;
  const body = (val: string) => `<p>${val}</p>`;
  const field = (label: string, val: string) =>
    `<p><strong>${label}:</strong> ${val}</p>`;
  const a = p.attached ?? {};
  return [
    heading("Issue:"),
    body(v(p.issue)),
    heading("Background:"),
    body(v(p.background)),
    heading("Requested Action:"),
    body(v(p.requestedAction)),
    field("Specific Field", v(p.specificField)),
    field("Category", v(p.category)),
    field("Message Taking or Dispatching", v(p.messageTakingOrDispatching)),
    field("F9 Issue", v(p.f9Issue)),
    heading("Attached Message / Example:"),
    field("MsgID", v(a.msgId)),
    field("Call Timestamp", v(a.callTimestamp)),
    field("Message Summary", v(a.messageSummary)),
    field("For", v(a.for)),
    field("Caller", v(a.caller)),
    field("Phone", v(a.phone)),
    field("Patient", v(a.patient)),
    field("Message", v(a.message)),
  ].join("");
}

export type TicketStatus = "working" | "waiting-cs" | "waiting-prog" | "completed";
export type ResultStatus = "passed" | "failed" | "waiting-cs" | "waiting-prog" | "completed";
export type SnipCategory =
  "Before Change" | "After Change" | "Testing Result" | "Error / Issue" | "Other";
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
  /** Where the account number came from. Manual entries are not overwritten by sync. */
  accountSource?: "freshdesk" | "manual";
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
  dueHistory?: Array<{
    prev?: number;
    next?: number;
    source: NonNullable<Ticket["dueSource"]>;
    at: number;
    initials: string;
  }>;
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
  "Standard Ticket Work Note" | "Client Change Note" | "Scripting Issue Note";

interface State {
  tickets: Ticket[];
  workSessions: Record<string, WorkSession>;
  recentIds: Record<string, string[]>; // by shift key
}

const KEY = "aih:tickets:v2";

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
  return [
    {
      id: "t-sheboygan-1",
      number: "1",
      accountNumber: "7431",
      accountName: "Sheboygan Internal Medicine",
      status: "working",
      updatedAt: now,
      details: initialDetails({
        subject: "Sheboygan Internal Medicine — open work",
        company: "Sheboygan Internal Medicine",
        freshdeskUrl: "",
      }),
      freshdeskNotes: [],
      hubHistory: [],
      freshdeskAttachments: [],
      hubSnips: [],
    },
  ];
}

function loadInitial(): State {
  if (typeof window === "undefined") {
    return { tickets: [], workSessions: {}, recentIds: {} };
  }
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as State;
      if (parsed && Array.isArray(parsed.tickets)) {
        return {
          tickets: parsed.tickets,
          workSessions: parsed.workSessions ?? {},
          recentIds: parsed.recentIds ?? {},
        };
      }
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
  clearAll() {
    ensureLoaded();
    state = { tickets: [], workSessions: {}, recentIds: {} };
    persist();
  },
  deleteTicket(id: string): { ok: boolean } {
    ensureLoaded();
    const exists = state.tickets.some((t) => t.id === id);
    if (!exists) return { ok: false };
    const { [id]: _removed, ...remainingSessions } = state.workSessions;
    const recentIds: Record<string, string[]> = {};
    for (const [sk, ids] of Object.entries(state.recentIds)) {
      recentIds[sk] = ids.filter((x) => x !== id);
    }
    state = {
      ...state,
      tickets: state.tickets.filter((t) => t.id !== id),
      workSessions: remainingSessions,
      recentIds,
    };
    persist();
    return { ok: true };
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
        t.id === ticketId
          ? { ...t, hubHistory: [entry, ...t.hubHistory], updatedAt: Date.now() }
          : t,
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
          ? {
              ...t,
              hubSnips: [s, ...t.hubSnips],
              hubHistory: [histEntry, ...t.hubHistory],
              updatedAt: Date.now(),
            }
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
      tickets: state.tickets.map((t) => (t.id === ticketId ? { ...t, lastSyncFailed: true } : t)),
    };
    persist();
  },
  /**
   * Back-compat shim for callers that just want to perform a sync and get
   * a simple ok/fail back. Tries the real Freshdesk API; falls back to
   * recording a failure if creds are missing or the call errors.
   */
  async sync(
    ticketId: string,
  ): Promise<{ ok: boolean; error?: string; newNotes?: number; newAttachments?: number }> {
    ensureLoaded();
    const t = state.tickets.find((x) => x.id === ticketId);
    if (!t) return { ok: false, error: "Ticket not found in Hub." };
    try {
      const mod = await import("./api/freshdesk.functions");
      const res = await mod.freshdeskSyncTicket({ data: { number: t.number } });
      if (!res.ok) {
        this.recordSyncFailure(ticketId);
        return { ok: false, error: res.error };
      }
      const merged = this.mergeFreshdeskData(ticketId, {
        details: {
          subject: res.ticket.subject || t.details.subject,
          company: res.ticket.companyName ?? t.details.company,
        },
        status: res.ticket.status,
        priority: res.ticket.priority,
        dueAt: res.ticket.dueAt,
        accountNumber: res.ticket.accountNumber,
        accountName: res.ticket.accountName ?? res.ticket.companyName,
        newNotes: res.notes.map((n) => ({
          id: newId("fn"),
          freshdeskId: n.freshdeskId,
          author: n.author,
          createdAt: n.createdAt,
          body: n.body,
          source: "freshdesk",
        })),
        newAttachments: res.attachments.map((a) => ({
          id: newId("fa"),
          freshdeskId: a.freshdeskId,
          name: a.name,
          size: a.size,
          createdAt: a.createdAt,
          url: a.url,
          contentType: a.contentType,
          source: "freshdesk",
        })),
      });
      return { ok: true, newNotes: merged.newNotes, newAttachments: merged.newAttachments };
    } catch (e) {
      this.recordSyncFailure(ticketId);
      return { ok: false, error: e instanceof Error ? e.message : "Sync failed." };
    }
  },
  /**
   * Pull a ticket from Freshdesk. Returns the existing tracked record when
   * present, otherwise fetches from Freshdesk. Surfaces the real failure
   * reason to the caller so the UI can show a useful message.
   */
  async pullFromFreshdesk(
    number: string,
  ): Promise<{
    ticket: Ticket | null;
    error?: string;
    notFound?: boolean;
    notConnected?: boolean;
  }> {
    ensureLoaded();
    const existing = state.tickets.find((t) => t.number === number);
    if (existing) return { ticket: existing };
    try {
      const mod = await import("./api/freshdesk.functions");
      const res = await mod.freshdeskPullTicket({ data: { number } });
      if (!res.ok) {
        const error = res.error ?? "Could not pull ticket from Freshdesk.";
        const notConnected = /not connected/i.test(error);
        const notFound = "notFound" in res ? !!res.notFound : false;
        return { ticket: null, error, notFound, notConnected };
      }
      const created = this.createFromFreshdesk({
        number: res.ticket.number,
        subject: res.ticket.subject,
        description: res.ticket.description,
        accountNumber: res.ticket.accountNumber,
        accountName: res.ticket.accountName,
        status: res.ticket.status,
        priority: res.ticket.priority,
        dueAt: res.ticket.dueAt,
        freshdeskUrl: res.ticket.freshdeskUrl,
        requesterName: res.ticket.requesterName,
        companyName: res.ticket.companyName,
        type: res.ticket.type,
        notes: res.notes.map((n) => ({
          id: newId("fn"),
          freshdeskId: n.freshdeskId,
          author: n.author,
          createdAt: n.createdAt,
          body: n.body,
          source: "freshdesk",
        })),
        attachments: res.attachments.map((a) => ({
          id: newId("fa"),
          freshdeskId: a.freshdeskId,
          name: a.name,
          size: a.size,
          createdAt: a.createdAt,
          url: a.url,
          contentType: a.contentType,
          source: "freshdesk",
        })),
      });
      return { ticket: created };
    } catch (e) {
      return {
        ticket: null,
        error: e instanceof Error ? e.message : "Could not reach Freshdesk.",
      };
    }
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
      accountNumber?: string;
      accountName?: string;
      newNotes: FreshdeskNote[];
      newAttachments: FreshdeskAttachment[];
    },
  ): {
    newNotes: number;
    newAttachments: number;
    alreadyNotes: number;
    alreadyAttachments: number;
  } {
    ensureLoaded();
    const t = state.tickets.find((x) => x.id === ticketId);
    if (!t) return { newNotes: 0, newAttachments: 0, alreadyNotes: 0, alreadyAttachments: 0 };

    const existingNoteKeys = new Set(
      t.freshdeskNotes.map((n) =>
        n.freshdeskId
          ? `id:${n.freshdeskId}`
          : `k:${n.author}|${n.createdAt}|${(n.body ?? "").slice(0, 80)}`,
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
      const key = n.freshdeskId
        ? `id:${n.freshdeskId}`
        : `k:${n.author}|${n.createdAt}|${(n.body ?? "").slice(0, 80)}`;
      if (existingNoteKeys.has(key)) {
        alreadyNotes++;
        continue;
      }
      addNotes.push({ ...n, source: "freshdesk" });
    }

    const addAtts: FreshdeskAttachment[] = [];
    let alreadyAtts = 0;
    for (const a of payload.newAttachments) {
      const key = a.freshdeskId
        ? `id:${a.freshdeskId}`
        : `k:${a.name}|${a.size ?? ""}|${a.createdAt}`;
      if (existingAttKeys.has(key)) {
        alreadyAtts++;
        continue;
      }
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
          freshdeskNotes: [...addNotes, ...tk.freshdeskNotes].sort(
            (x, y) => y.createdAt - x.createdAt,
          ),
          freshdeskAttachments: [...addAtts, ...tk.freshdeskAttachments].sort(
            (x, y) => y.createdAt - x.createdAt,
          ),
          syncedAt: Date.now(),
          lastSyncFailed: false,
        };
        // Account number — only overwrite if not manually set
        if (payload.accountNumber !== undefined && tk.accountSource !== "manual") {
          if (payload.accountNumber) {
            const ensured = accountsStore.ensureFromFreshdesk(
              payload.accountNumber,
              payload.accountName,
            );
            next.accountNumber = payload.accountNumber;
            next.accountName =
              ensured?.account.name ?? payload.accountName ?? tk.accountName ?? "Unlinked Account";
            next.accountSource = "freshdesk";
          }
        }
        // Freshdesk due date — set only if user hasn't overridden
        if (payload.dueAt !== undefined && tk.dueSource !== "hub-override") {
          if (next.dueAt !== payload.dueAt) {
            next.dueAt = payload.dueAt;
            next.dueSource = "freshdesk";
            next.dueHistory = [
              {
                prev: tk.dueAt,
                next: payload.dueAt,
                source: "freshdesk",
                at: Date.now(),
                initials: "LTP",
              },
              ...(tk.dueHistory ?? []),
            ];
          }
        }
        return next;
      }),
    };
    persist();
    return {
      newNotes: addNotes.length,
      newAttachments: addAtts.length,
      alreadyNotes,
      alreadyAttachments: alreadyAtts,
    };
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
    const prev = state.tickets.find((t) => t.id === ticketId);
    state = {
      ...state,
      tickets: state.tickets.map((t) =>
        t.id === ticketId
          ? {
              ...t,
              status: "completed",
              completedAt: Date.now(),
              issueClassification: classification,
            }
          : t,
      ),
    };
    persist();
    if (prev && prev.status !== "completed") {
      void import("./core/event-spine").then(({ eventSpine }) =>
        eventSpine.emit({
          type: "ticket.completed",
          source: "tickets-store",
          ticketId,
          accountId: prev.accountNumber || undefined,
          metadata: { label: `Ticket #${prev.number}`, classification },
        }),
      );
      void import("./quantum-bloom/celebration-bus").then(({ triggerCelebration }) => {
        triggerCelebration({
          kind: "ticket",
          label: "Ticket completed",
          context: { ticketId },
        });
      });
      void import("./workspace/activity-store").then(({ recordActivity }) =>
        recordActivity("ticket_complete", prev ? `#${prev.number}` : undefined),
      );
    }
  },
  reopen(ticketId: string) {
    ensureLoaded();
    state = {
      ...state,
      tickets: state.tickets.map((t) =>
        t.id === ticketId
          ? { ...t, status: "working", completedAt: undefined, updatedAt: Date.now() }
          : t,
      ),
    };
    persist();
  },
  setIssueClassification(ticketId: string, classification: IssueClassification | null) {
    ensureLoaded();
    const before = state.tickets.find((t) => t.id === ticketId);
    state = {
      ...state,
      tickets: state.tickets.map((t) =>
        t.id === ticketId
          ? { ...t, issueClassification: classification ?? undefined, updatedAt: Date.now() }
          : t,
      ),
    };
    persist();
    void import("./core/event-spine").then(({ eventSpine }) =>
      eventSpine.emit({
        type: "ticket.status_changed",
        source: "tickets-store",
        ticketId,
        accountId: before?.accountNumber || undefined,
        metadata: {
          label: before ? `Ticket #${before.number}` : undefined,
          classification: classification ?? null,
        },
      }),
    );
  },
  /**
   * Manually set an account number on a ticket. Validates numeric (3-8 digits),
   * links to an existing Account or creates a new one in the Accounts table.
   */
  setAccountNumber(
    ticketId: string,
    rawNumber: string,
    accountName?: string,
  ): { ok: boolean; error?: string; created?: boolean } {
    ensureLoaded();
    const num = rawNumber.trim();
    if (!/^\d{3,8}$/.test(num)) {
      return { ok: false, error: "Account number must be 3–8 digits." };
    }
    let acct = accountsStore.get(num);
    let created = false;
    if (!acct) {
      try {
        acct = accountsStore.create({
          number: num,
          name: accountName?.trim() || "Unlinked Account",
        });
        created = true;
      } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : "Could not create account." };
      }
    }
    const finalName = acct?.name ?? accountName?.trim() ?? "Unlinked Account";
    state = {
      ...state,
      tickets: state.tickets.map((t) =>
        t.id === ticketId
          ? {
              ...t,
              accountNumber: num,
              accountName: finalName,
              accountSource: "manual",
              updatedAt: Date.now(),
              hubHistory: [
                {
                  id: newId("hh"),
                  initials: "LTP",
                  createdAt: Date.now(),
                  body: `Account number set manually to ${num} (${finalName})${created ? " — new account created" : ""}.`,
                  kind: "system",
                },
                ...t.hubHistory,
              ],
            }
          : t,
      ),
    };
    persist();
    return { ok: true, created };
  },
  /** Refresh the account number from Freshdesk, overwriting any manual entry. */
  async refreshAccountFromFreshdesk(
    ticketId: string,
  ): Promise<{ ok: boolean; error?: string; found?: boolean }> {
    ensureLoaded();
    const t = state.tickets.find((x) => x.id === ticketId);
    if (!t) return { ok: false, error: "Ticket not found." };
    try {
      const mod = await import("./api/freshdesk.functions");
      const res = await mod.freshdeskPullTicket({ data: { number: t.number } });
      if (!res.ok) return { ok: false, error: res.error };
      const num = res.ticket.accountNumber;
      if (!num) {
        return { ok: true, found: false };
      }
      const ensured = accountsStore.ensureFromFreshdesk(
        num,
        res.ticket.accountName ?? res.ticket.companyName,
      );
      const name =
        ensured?.account.name ??
        res.ticket.accountName ??
        res.ticket.companyName ??
        "Unlinked Account";
      state = {
        ...state,
        tickets: state.tickets.map((tk) =>
          tk.id === ticketId
            ? {
                ...tk,
                accountNumber: num,
                accountName: name,
                accountSource: "freshdesk",
                updatedAt: Date.now(),
                hubHistory: [
                  {
                    id: newId("hh"),
                    initials: "LTP",
                    createdAt: Date.now(),
                    body: `Account number refreshed from Freshdesk: ${num} (${name}).`,
                    kind: "system",
                  },
                  ...tk.hubHistory,
                ],
              }
            : tk,
        ),
      };
      persist();
      return { ok: true, found: true };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "Refresh failed." };
    }
  },
  createManual(number?: string, accountNumber = "", accountName = "Manual Entry"): Ticket {
    ensureLoaded();
    const n = number?.trim() || String(40000 + Math.floor(Math.random() * 9999));
    const t: Ticket = {
      id: newId("t"),
      number: n,
      accountNumber: accountNumber || "",
      accountName,
      status: "working",
      updatedAt: Date.now(),
      details: initialDetails({ subject: "Manual ticket work session" }),
      freshdeskNotes: [],
      hubHistory: [
        {
          id: newId("hh"),
          initials: "LTP",
          createdAt: Date.now(),
          body: "Created manually in Hub.",
          kind: "system",
        },
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
    description?: string;
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
    // Auto-file the ticket under its account: get-or-create from the parsed
    // Freshdesk company field so pulled tickets land in the Accounts table.
    const ensured = input.accountNumber
      ? accountsStore.ensureFromFreshdesk(input.accountNumber, input.accountName)
      : null;
    const t: Ticket = {
      id: newId("t"),
      number: input.number,
      accountNumber: input.accountNumber ?? "",
      accountName: input.accountNumber
        ? (ensured?.account.name ?? input.accountName ?? input.companyName ?? "Unlinked Account")
        : (input.companyName ?? ""),
      accountSource: input.accountNumber ? "freshdesk" : undefined,
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
        ...(ensured?.created
          ? [
              {
                id: newId("hh"),
                initials: "LTP" as const,
                createdAt: Date.now(),
                body: `Account ${ensured.account.number} (${ensured.account.name}) auto-created from Freshdesk company field.`,
                kind: "system" as const,
              },
            ]
          : []),
        {
          id: newId("hh"),
          initials: "LTP",
          createdAt: Date.now(),
          body: "Pulled ticket from Freshdesk.",
          kind: "system",
        },
      ],
      freshdeskAttachments: input.attachments.map((a) => ({ ...a, source: "freshdesk" as const })),
      hubSnips: [],
    };
    void import("./workspace/activity-store").then(({ recordActivity }) =>
      recordActivity("ticket_pull", `#${t.number}`),
    );
    void import("./core/event-spine").then(({ eventSpine }) =>
      eventSpine.emit({
        type: "ticket.pulled",
        source: "tickets-store",
        ticketId: t.id,
        accountId: t.accountNumber || undefined,
        metadata: { label: `Ticket #${t.number}` },
      }),
    );
    // Seed synchronously with the regex Request/Background fallback so the
    // operator sees something immediately, then upgrade to the AI structured
    // parse in the background.
    // Always seed with the structured schema (all "Not provided.") — never raw
    // Freshdesk text. AI parse below fills in real values asynchronously.
    const seedIssue = formatTicketIssue({});
    const workSessions = {
      ...state.workSessions,
      [t.id]: { ...defaultSession(t.id), issueText: seedIssue },
    };
    state = { ...state, tickets: [t, ...state.tickets], workSessions };
    persist();
    const desc = input.description ?? "";
    if (desc.trim()) {
      void import("./ai/ai.functions")
        .then(({ aiParseTicketIssue }) =>
          aiParseTicketIssue({
            data: { number: t.number, subject: input.subject, description: desc.slice(0, 12000) },
          }),
        )
        .then((res) => {
          if (res?.ok && res.parsed) {
            const formatted = formatTicketIssue(res.parsed);
            if (formatted.trim()) ticketsStore.updateSession(t.id, { issueText: formatted });
          }
        })
        .catch(() => {
          /* keep the regex fallback already seeded */
        });
    }
    return t;
  },
  /** Internal: append seed tickets, dedupe by id. Used by reports demo data. */
};

/** No-op kept for callers that still reference it after demo-data removal. */
export function recoverRealWorkFromDemo(): { tickets: number } {
  return { tickets: 0 };
}

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

/**
 * Parse the HTML produced by `formatTicketIssue()` and return only the Issue
 * and Background sections as plain text. If the input isn't in the expected
 * shape (e.g. operator-edited freeform), the whole thing becomes `issue` and
 * `background` is empty. Skips "Not provided." placeholders.
 */
export function extractIssueAndBackground(issueHtml: string): {
  issue: string;
  background: string;
} {
  const src = (issueHtml ?? "").trim();
  if (!src) return { issue: "", background: "" };

  const clean = (s: string): string => {
    const withBreaks = s
      .replace(/<\s*br\s*\/?>/gi, "\n")
      .replace(/<\/(p|div|li|h[1-6])>/gi, "\n");
    const stripped = withBreaks.replace(/<[^>]+>/g, "");
    const decoded = stripped
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'");
    return decoded.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  };

  const isPlaceholder = (v: string) => !v || /^not provided\.?$/i.test(v.trim());

  // Match headings emitted by formatTicketIssue: <p><strong>Label:</strong></p>
  const headingRe = /<p>\s*<strong>\s*([^<]+?)\s*<\/strong>\s*<\/p>/gi;
  const matches: { label: string; start: number; end: number }[] = [];
  let m: RegExpExecArray | null;
  while ((m = headingRe.exec(src)) !== null) {
    matches.push({ label: m[1].replace(/:\s*$/, "").trim().toLowerCase(), start: m.index, end: m.index + m[0].length });
  }

  if (matches.length === 0) {
    const asText = clean(src);
    return { issue: isPlaceholder(asText) ? "" : asText, background: "" };
  }

  const pick = (label: string): string => {
    const idx = matches.findIndex((h) => h.label === label);
    if (idx === -1) return "";
    const start = matches[idx].end;
    const end = idx + 1 < matches.length ? matches[idx + 1].start : src.length;
    const body = clean(src.slice(start, end));
    return isPlaceholder(body) ? "" : body;
  };

  return { issue: pick("issue"), background: pick("background") };
}

export function buildGeneratedNote(t: Ticket, s: WorkSession, template: NoteTemplate): string {
  const lines: string[] = [];
  void template;
  const { issue, background } = extractIssueAndBackground(s.issueText);

  // 1. Changes Made
  lines.push("Changes Made:");
  lines.push(s.changesText.trim() || "(none provided)");
  const beforeSnips = t.hubSnips.filter((x) => x.category === "Before Change");
  const afterSnips = t.hubSnips.filter((x) => x.category === "After Change");
  beforeSnips.forEach((sn) => lines.push(`  [[SNIP:${sn.id}]]`));
  afterSnips.forEach((sn) => lines.push(`  [[SNIP:${sn.id}]]`));
  lines.push("");

  // 2. Result / Testing
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
  testSnips.forEach((sn) => lines.push(`  [[SNIP:${sn.id}]]`));
  lines.push("");

  // 3. Issue
  lines.push("Issue:");
  lines.push(issue || "(none provided)");
  lines.push("");

  // 4. Background (skip if empty)
  if (background) {
    lines.push("Background:");
    lines.push(background);
    lines.push("");
  }

  while (lines.length && lines[lines.length - 1] === "") lines.pop();
  return lines.join("\n");
}
attachCloudSync<State>({
  storeKey: "tickets",
  subscribe: (cb) => {
    listeners.add(cb);
    return () => {
      listeners.delete(cb);
    };
  },
  getSnapshot: () => {
    ensureLoaded();
    return state;
  },
  applyServerSnapshot: (next) => {
    state = {
      tickets: Array.isArray(next.tickets) ? next.tickets : [],
      workSessions: next.workSessions ?? {},
      recentIds: next.recentIds ?? {},
    };
    initialized = true;
    persist();
  },
  isEmpty: (s) => (s.tickets?.length ?? 0) === 0 && Object.keys(s.workSessions ?? {}).length === 0,
});
