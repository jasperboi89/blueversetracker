import { useSyncExternalStore } from "react";
import { attachCloudSync } from "./cloud-sync/blob-sync";

export type DispatchStatus =
  | "ready"
  | "activated"
  | "waiting-cs"
  | "waiting-prog"
  | "not-ready";

export const DISPATCH_STATUS_LABEL: Record<DispatchStatus, string> = {
  ready: "Ready for Activation",
  activated: "Activated",
  "waiting-cs": "Waiting on Review from Customer Service",
  "waiting-prog": "Waiting on Review from Programming",
  "not-ready": "Not Ready, Still Working on Ticket",
};

export type SectionStatus =
  | "not-tested"
  | "in-progress"
  | "passed"
  | "failed"
  | "passed-retest"
  | "still-failed"
  | "waiting-review"
  | "complete"
  | "na";

export const SECTION_STATUS_LABEL: Record<SectionStatus, string> = {
  "not-tested": "Not Tested",
  "in-progress": "In Progress",
  passed: "Passed",
  failed: "Failed",
  "passed-retest": "Passed After Retest",
  "still-failed": "Still Failed",
  "waiting-review": "Waiting Review",
  complete: "Complete",
  na: "N/A",
};

export type ReasonType = "routine" | "urgent" | "na" | "unsure";
export const REASON_TYPE_LABEL: Record<ReasonType, string> = {
  routine: "Routine",
  urgent: "Urgent",
  na: "N/A",
  unsure: "Not Sure Yet",
};

export type ReasonResult = "passed" | "failed" | null;

export type DispatchSnipCategory =
  | "Front-End Screen"
  | "Backend Script Tree"
  | "Routing / On-Call"
  | "Message Summary"
  | "Error / Issue"
  | "Other";

export const DISPATCH_SNIP_CATEGORIES: DispatchSnipCategory[] = [
  "Front-End Screen",
  "Backend Script Tree",
  "Routing / On-Call",
  "Message Summary",
  "Error / Issue",
  "Other",
];

export interface DispatchSnip {
  id: string;
  name: string;
  category: DispatchSnipCategory;
  label?: string;
  createdAt: number;
  initials: string;
  dataUrl?: string;
  isImage: boolean;
}

export interface RetestEntry {
  id: string;
  at: number;
  result: "passed" | "still-failed";
  notes: string;
  snipIds: string[];
}

export interface UrgentRoutingCheck {
  expectedContact: string;
  actualContact: string;
  contactCorrect: "passed" | "failed" | null;
  instructionsMatch: "yes" | "no" | null;
  savedMessageOk: "passed" | "failed" | null;
}

export interface ReasonCard {
  id: string;
  source: "global" | "account" | "manual";
  text: string;
  type: ReasonType | null;
  expectedFlow: string;
  actualFlow: string;
  result: ReasonResult;
  failureReason: string;
  changesMade: string;
  retests: RetestEntry[];
  notes: string;
  snipIds: string[];
  urgent?: UrgentRoutingCheck;
}

export interface CheckSection {
  status: SectionStatus;
  failureReason: string;
  changesMade: string;
  retests: RetestEntry[];
  notes: string;
  snipIds: string[];
  /** Per-check booleans keyed by check id. true=passed, false=failed, null=untested */
  checks: Record<string, boolean | null>;
}

export type SummaryVersionLabel =
  | "Manual Draft"
  | "Generated"
  | "User Edited"
  | "Final Posted / Marked Used";

export interface SummaryVersion {
  id: string;
  label: SummaryVersionLabel;
  body: string;
  createdAt: number;
  postedAt?: number;
}

export interface DispatchSession {
  id: string;
  accountNumber: string;
  accountName: string;
  ticketNumber?: string;
  status: DispatchStatus | null;
  statusReason: string;
  createdAt: number;
  updatedAt: number;
  completedAt?: number;
  activatedAt?: number;
  reasons: ReasonCard[];
  phone: CheckSection;
  repeat: CheckSection;
  saveSummary: CheckSection;
  summaryNotes: string;
  summaryVersions: SummaryVersion[];
  snips: DispatchSnip[];
  /** Seed/demo flag — hidden when Demo Mode is OFF */
  isDemo?: boolean;
}

export const PHONE_CHECKS = [
  { id: "present", label: "Phone field is present" },
  { id: "required", label: "Required when it should be" },
  { id: "color", label: "Required-field color / tab behavior works" },
] as const;

export const REPEAT_CHECKS = [
  { id: "exists", label: "Repeat Caller button exists / visible" },
  { id: "list", label: "Opens repeat caller pick list" },
  { id: "select", label: "Caller selection works" },
  { id: "pulls", label: "Previous caller/message info pulls" },
  { id: "callback", label: "Callback question appears" },
  { id: "whatcall", label: "“What call is this?” appears when needed" },
  { id: "nth", label: "2nd / 3rd / more behavior works" },
  { id: "marks", label: "Message note marks repeat caller" },
  { id: "summary", label: "Saved message / summary reflects repeat caller" },
] as const;

export const SAVE_CHECKS = [
  { id: "saves", label: "Message saves correctly" },
  { id: "fields", label: "Summary includes all required fields" },
  { id: "reason", label: "Summary displays correct Reason for Call" },
  { id: "urgentRoutine", label: "Summary shows urgent / routine details correctly" },
  { id: "repeat", label: "Repeat caller details appear correctly when applicable" },
] as const;

function emptyCheckSection(checkIds: readonly { id: string }[]): CheckSection {
  return {
    status: "not-tested",
    failureReason: "",
    changesMade: "",
    retests: [],
    notes: "",
    snipIds: [],
    checks: Object.fromEntries(checkIds.map((c) => [c.id, null])),
  };
}

interface State {
  sessions: DispatchSession[];
}

const KEY = "aih:dispatch:v2";

let state: State = { sessions: [] };
let initialized = false;
const listeners = new Set<() => void>();

function newId(p = "id") {
  return `${p}-${Math.random().toString(36).slice(2, 9)}`;
}

function persist() {
  if (typeof window !== "undefined") {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch {}
  }
  listeners.forEach((l) => l());
}

function loadInitial(): State {
  if (typeof window === "undefined") return { sessions: [] };
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const p = JSON.parse(raw) as State;
      if (p && Array.isArray(p.sessions)) return p;
    }
  } catch {}
  return { sessions: [] };
}

function ensureLoaded() {
  if (!initialized && typeof window !== "undefined") {
    state = loadInitial();
    initialized = true;
  }
}

function patchSession(id: string, fn: (s: DispatchSession) => DispatchSession) {
  state = {
    ...state,
    sessions: state.sessions.map((s) =>
      s.id === id ? { ...fn(s), updatedAt: Date.now() } : s,
    ),
  };
  persist();
}

export const dispatchStore = {
  subscribe(l: () => void) { listeners.add(l); return () => listeners.delete(l); },
  getState(): State { ensureLoaded(); return state; },
  getSession(id: string) { ensureLoaded(); return state.sessions.find((s) => s.id === id); },

  clearAll() {
    ensureLoaded();
    state = { sessions: [] };
    persist();
  },

  start({ accountNumber, accountName, ticketNumber }: { accountNumber: string; accountName: string; ticketNumber?: string }) {
    ensureLoaded();
    const s: DispatchSession = {
      id: newId("ds"),
      accountNumber, accountName, ticketNumber,
      status: null, statusReason: "",
      createdAt: Date.now(), updatedAt: Date.now(),
      reasons: [],
      phone: emptyCheckSection(PHONE_CHECKS),
      repeat: emptyCheckSection(REPEAT_CHECKS),
      saveSummary: emptyCheckSection(SAVE_CHECKS),
      summaryNotes: "",
      summaryVersions: [],
      snips: [],
    };
    state = { ...state, sessions: [s, ...state.sessions] };
    persist();
    return s;
  },

  updateSection(id: string, key: "phone" | "repeat" | "saveSummary", patch: Partial<CheckSection>) {
    patchSession(id, (s) => ({ ...s, [key]: { ...s[key], ...patch } }));
  },
  setCheck(id: string, key: "phone" | "repeat" | "saveSummary", checkId: string, value: boolean | null) {
    patchSession(id, (s) => ({
      ...s,
      [key]: { ...s[key], checks: { ...s[key].checks, [checkId]: value } },
    }));
  },

  addReason(id: string, source: "global" | "account" | "manual", seedReason?: Partial<ReasonCard>) {
    patchSession(id, (s) => ({
      ...s,
      reasons: [
        ...s.reasons,
        {
          id: newId("rc"),
          source,
          text: "",
          type: null,
          expectedFlow: "",
          actualFlow: "",
          result: null,
          failureReason: "",
          changesMade: "",
          retests: [],
          notes: "",
          snipIds: [],
          ...seedReason,
        },
      ],
    }));
  },
  updateReason(id: string, reasonId: string, patch: Partial<ReasonCard>) {
    patchSession(id, (s) => ({
      ...s,
      reasons: s.reasons.map((r) => (r.id === reasonId ? { ...r, ...patch } : r)),
    }));
  },
  duplicateReason(id: string, reasonId: string) {
    patchSession(id, (s) => {
      const r = s.reasons.find((x) => x.id === reasonId);
      if (!r) return s;
      const dup: ReasonCard = {
        ...r,
        id: newId("rc"),
        result: null,
        failureReason: "",
        retests: [],
        snipIds: [],
      };
      return { ...s, reasons: [...s.reasons, dup] };
    });
  },
  removeReason(id: string, reasonId: string) {
    patchSession(id, (s) => ({ ...s, reasons: s.reasons.filter((r) => r.id !== reasonId) }));
  },

  addRetest(id: string, target: { kind: "reason"; reasonId: string } | { kind: "section"; key: "phone" | "repeat" | "saveSummary" }, entry: Omit<RetestEntry, "id">) {
    patchSession(id, (s) => {
      const e: RetestEntry = { ...entry, id: newId("rt") };
      if (target.kind === "reason") {
        return {
          ...s,
          reasons: s.reasons.map((r) => {
            if (r.id !== target.reasonId) return r;
            const retests = [...r.retests, e];
            const result: ReasonResult = e.result === "passed" ? "passed" : r.result;
            return { ...r, retests, result };
          }),
        };
      }
      const sec = s[target.key];
      const retests = [...sec.retests, e];
      const status: SectionStatus = e.result === "passed" ? "passed-retest" : "still-failed";
      return { ...s, [target.key]: { ...sec, retests, status } };
    });
  },

  addSnip(id: string, snip: Omit<DispatchSnip, "id" | "createdAt" | "initials">, attach?: { kind: "reason"; reasonId: string } | { kind: "section"; key: "phone" | "repeat" | "saveSummary" }) {
    patchSession(id, (s) => {
      const sn: DispatchSnip = { ...snip, id: newId("sn"), createdAt: Date.now(), initials: "LTP" };
      const next = { ...s, snips: [sn, ...s.snips] };
      if (attach?.kind === "reason") {
        next.reasons = next.reasons.map((r) =>
          r.id === attach.reasonId ? { ...r, snipIds: [sn.id, ...r.snipIds] } : r,
        );
      } else if (attach?.kind === "section") {
        const sec = next[attach.key];
        next[attach.key] = { ...sec, snipIds: [sn.id, ...sec.snipIds] };
      }
      return next;
    });
  },
  removeSnip(id: string, snipId: string) {
    patchSession(id, (s) => ({
      ...s,
      snips: s.snips.filter((x) => x.id !== snipId),
      reasons: s.reasons.map((r) => ({ ...r, snipIds: r.snipIds.filter((x) => x !== snipId) })),
      phone: { ...s.phone, snipIds: s.phone.snipIds.filter((x) => x !== snipId) },
      repeat: { ...s.repeat, snipIds: s.repeat.snipIds.filter((x) => x !== snipId) },
      saveSummary: { ...s.saveSummary, snipIds: s.saveSummary.snipIds.filter((x) => x !== snipId) },
    }));
  },

  setOverallStatus(id: string, status: DispatchStatus | null, reason = "") {
    patchSession(id, (s) => ({ ...s, status, statusReason: reason }));
  },
  markReady(id: string) {
    patchSession(id, (s) => ({ ...s, status: "ready", completedAt: Date.now() }));
    void import("./quantum-bloom/celebration-bus").then(({ triggerCelebration }) => {
      triggerCelebration({
        kind: "dispatch",
        label: "Dispatch testing complete",
        context: { sessionId: id },
      });
    });
  },
  reopen(id: string) {
    patchSession(id, (s) => ({ ...s, status: "not-ready", completedAt: undefined }));
  },
  markActivated(id: string) {
    patchSession(id, (s) => ({
      ...s,
      status: "activated",
      activatedAt: Date.now(),
      completedAt: s.completedAt ?? Date.now(),
    }));
  },
  reopenFromArchive(id: string) {
    patchSession(id, (s) => ({ ...s, status: "ready", activatedAt: undefined }));
  },

  addSummaryVersion(id: string, label: SummaryVersionLabel, body: string) {
    patchSession(id, (s) => {
      const v: SummaryVersion = { id: newId("sv"), label, body, createdAt: Date.now() };
      return { ...s, summaryNotes: body, summaryVersions: [v, ...s.summaryVersions] };
    });
  },
  saveSummaryEdit(id: string, body: string) {
    patchSession(id, (s) => ({ ...s, summaryNotes: body }));
  },
  restoreSummaryVersion(id: string, versionId: string) {
    patchSession(id, (s) => {
      const v = s.summaryVersions.find((x) => x.id === versionId);
      return v ? { ...s, summaryNotes: v.body } : s;
    });
  },
  markPosted(id: string) {
    patchSession(id, (s) => {
      const latest = s.summaryVersions[0];
      if (!latest) return s;
      const v: SummaryVersion = {
        id: newId("sv"),
        label: "Final Posted / Marked Used",
        body: s.summaryNotes || latest.body,
        createdAt: Date.now(),
        postedAt: Date.now(),
      };
      return { ...s, summaryVersions: [v, ...s.summaryVersions] };
    });
  },

  remove(id: string) {
    state = { ...state, sessions: state.sessions.filter((s) => s.id !== id) };
    persist();
  },
  _seedExtra(items: DispatchSession[]) {
    ensureLoaded();
    const existing = new Set(state.sessions.map((s) => s.id));
    const additions = items.filter((s) => !existing.has(s.id)).map((s) => ({ ...s, isDemo: true }));
    if (additions.length === 0) return;
    state = { ...state, sessions: [...additions, ...state.sessions] };
    persist();
  },
  recoverRealWork(): number {
    ensureLoaded();
    let recovered = 0;
    const sessions = state.sessions.map((s) => {
      if (!s.isDemo) return s;
      const hasUserWork =
        (s.snips?.length ?? 0) > 0 ||
        (s.summaryNotes?.trim()?.length ?? 0) > 0 ||
        (s.summaryVersions?.length ?? 0) > 0 ||
        (s.reasons ?? []).some(
          (r) => r.changesMade.trim() || r.notes.trim() || r.retests.length > 0,
        );
      if (hasUserWork) { recovered++; return { ...s, isDemo: false }; }
      return s;
    });
    state = { ...state, sessions };
    persist();
    return recovered;
  },
};

export interface Readiness {
  percent: number;
  sections: { key: string; label: string; status: SectionStatus }[];
  blockedBy: string[];
}

function reasonStatus(r: ReasonCard): SectionStatus {
  if (r.result === "passed") {
    return r.retests.length > 0 ? "passed-retest" : "passed";
  }
  if (r.result === "failed") {
    return r.retests.some((x) => x.result === "passed") ? "passed-retest" : "still-failed";
  }
  if (r.text.trim() || r.expectedFlow.trim() || r.actualFlow.trim()) return "in-progress";
  return "not-tested";
}

function isReasonOk(r: ReasonCard) {
  const st = reasonStatus(r);
  return st === "passed" || st === "passed-retest";
}

function sectionWeight(s: SectionStatus): number {
  if (s === "passed" || s === "passed-retest" || s === "complete") return 1;
  if (s === "in-progress" || s === "waiting-review") return 0.4;
  return 0;
}

export function computeReadiness(s: DispatchSession): Readiness {
  const reasonSummary: SectionStatus =
    s.reasons.length === 0
      ? "not-tested"
      : s.reasons.every(isReasonOk)
        ? s.reasons.some((r) => r.retests.length) ? "passed-retest" : "passed"
        : s.reasons.some((r) => r.result === "failed" && !r.retests.some((x) => x.result === "passed"))
          ? "still-failed"
          : "in-progress";

  const sections = [
    { key: "reasons", label: "Reason for Call Flow", status: reasonSummary },
    { key: "phone", label: "Phone Number Field Check", status: s.phone.status },
    { key: "repeat", label: "Repeat Caller Button Check", status: s.repeat.status },
    { key: "save", label: "Save / Message Summary", status: s.saveSummary.status },
  ];

  const weights = sections.map((x) => sectionWeight(x.status));
  const percent = Math.round((weights.reduce((a, b) => a + b, 0) / sections.length) * 100);

  const blockedBy: string[] = [];
  if (s.reasons.length === 0) blockedBy.push("Add at least one Reason for Call");
  s.reasons.forEach((r) => {
    if (!isReasonOk(r)) blockedBy.push(`Reason “${r.text || "(untitled)"}” not passed`);
  });
  if (!(s.phone.status === "passed" || s.phone.status === "passed-retest")) blockedBy.push("Phone Number Field Check not passed");
  const repeatOk = s.repeat.status === "passed" || s.repeat.status === "passed-retest" || s.repeat.status === "complete";
  if (!repeatOk) blockedBy.push("Repeat Caller Button Check not complete");
  const saveOk =
    s.saveSummary.status === "passed" ||
    s.saveSummary.status === "passed-retest" ||
    s.saveSummary.status === "na";
  if (!saveOk) blockedBy.push("Save / Message Summary not passed");

  return { percent, sections, blockedBy };
}

export function canMarkReady(s: DispatchSession): boolean {
  const r = computeReadiness(s);
  return r.percent === 100 && r.blockedBy.length === 0;
}

export function useDispatch() {
  return useSyncExternalStore(
    dispatchStore.subscribe,
    () => dispatchStore.getState(),
    () => ({ sessions: [] as DispatchSession[] }),
  );
}

export function buildDispatchSummary(
  s: DispatchSession,
  opts: { onlyIssues?: boolean } = {},
): string {
  const lines: string[] = [];
  const statusLabel = s.status ? DISPATCH_STATUS_LABEL[s.status] : "(no final status)";
  lines.push(`Contact Dispatch Summary — ${statusLabel}`);
  lines.push(`Account ${s.accountNumber} — ${s.accountName}`);
  if (s.ticketNumber) lines.push(`Linked Freshdesk Ticket: #${s.ticketNumber}`);
  if (s.completedAt) lines.push(`Testing Completed: ${new Date(s.completedAt).toISOString()} · LTP`);
  if (s.statusReason) lines.push(`Reason: ${s.statusReason}`);
  lines.push("");

  lines.push("Reasons for Call:");
  const reasonsToShow = opts.onlyIssues
    ? s.reasons.filter((r) => !isReasonOk(r) || r.retests.length > 0)
    : s.reasons;
  if (reasonsToShow.length === 0) lines.push("  (none)");
  reasonsToShow.forEach((r) => {
    const st = SECTION_STATUS_LABEL[reasonStatus(r)];
    lines.push(`  • [${st}] ${r.text || "(untitled)"} (${r.type ? REASON_TYPE_LABEL[r.type] : "no type"})`);
    if (!isReasonOk(r) || r.retests.length > 0) {
      if (r.expectedFlow) lines.push(`      Expected: ${r.expectedFlow}`);
      if (r.actualFlow) lines.push(`      Actual:   ${r.actualFlow}`);
      if (r.failureReason) lines.push(`      Failure:  ${r.failureReason}`);
      if (r.changesMade) lines.push(`      Changes:  ${r.changesMade}`);
      if (r.urgent) {
        lines.push(`      Urgent: expected ${r.urgent.expectedContact || "?"} / actual ${r.urgent.actualContact || "?"}`);
      }
      r.retests.forEach((rt) => {
        lines.push(`      Retest [${rt.result === "passed" ? "Passed" : "Still Failed"}] — ${rt.notes || ""}`);
      });
    }
  });
  lines.push("");

  const sec = (label: string, c: CheckSection) => {
    const ok = c.status === "passed" || c.status === "passed-retest" || c.status === "complete" || c.status === "na";
    if (opts.onlyIssues && ok && c.retests.length === 0) return;
    lines.push(`${label}: ${SECTION_STATUS_LABEL[c.status]}`);
    if (!ok || c.retests.length > 0) {
      if (c.failureReason) lines.push(`  Failure: ${c.failureReason}`);
      if (c.changesMade) lines.push(`  Changes: ${c.changesMade}`);
      if (c.notes) lines.push(`  Notes:   ${c.notes}`);
      c.retests.forEach((rt) => {
        lines.push(`  Retest [${rt.result === "passed" ? "Passed" : "Still Failed"}] — ${rt.notes || ""}`);
      });
    }
  };
  sec("Phone Number Field Check", s.phone);
  sec("Repeat Caller Button Check", s.repeat);
  sec("Save / Message Summary", s.saveSummary);

  if (s.snips.length) {
    lines.push("");
    lines.push("Snips:");
    s.snips.forEach((sn) => lines.push(`  • [${sn.category}] ${sn.name}${sn.label ? ` — ${sn.label}` : ""}`));
  }
  lines.push("");
  lines.push("— LTP");
  return lines.join("\n");
}

export function reasonCardStatus(r: ReasonCard): SectionStatus {
  return reasonStatus(r);
}
attachCloudSync<State>({
  storeKey: "dispatch",
  subscribe: (cb) => { listeners.add(cb); return () => { listeners.delete(cb); }; },
  getSnapshot: () => { ensureLoaded(); return state; },
  applyServerSnapshot: (next) => {
    state = { sessions: Array.isArray(next.sessions) ? next.sessions : [] };
    initialized = true;
    persist();
  },
  isEmpty: (s) => (s.sessions?.length ?? 0) === 0,
});
