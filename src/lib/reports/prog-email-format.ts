import { ticketsStore, STATUS_LABEL, type Ticket } from "../tickets-store";
import { dispatchStore, DISPATCH_STATUS_LABEL, type DispatchSession } from "../dispatch-store";
import { additionalWorkStore, type AdditionalWork } from "../additional-work-store";
import { htmlToPlainText } from "../rich-text";
import { isInWindow, isInWindowEither, type ShiftWindow } from "./shift-window";
import { nightPlanHistory } from "./night-plan-history";
import { nightPlanStore, isActive as isNPActive } from "../night-plan-store";

export type ItemKind = "freshdesk" | "dispatch" | "additional" | "night-plan";
export interface AttentionId { kind: ItemKind; id: string }

export function parseAttentionId(s: string): AttentionId | null {
  const [kind, id] = s.split(":");
  if (!kind || !id) return null;
  if (kind === "freshdesk" || kind === "dispatch" || kind === "additional" || kind === "night-plan") {
    return { kind, id };
  }
  return null;
}
export function attentionId(kind: ItemKind, id: string): string { return `${kind}:${id}`; }

export interface InsufficientWarning {
  ref: string;          // e.g. "Ticket #30182"
  reason: string;
}

export interface BuildResult {
  body: string;
  warnings: InsufficientWarning[];
  empty: boolean;
}

const stamp = (ms: number) =>
  new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(new Date(ms));

function cleanText(value: string | null | undefined): string {
  if (!value) return "";
  const text = /<\/?[a-z][\s\S]*>/i.test(value) ? htmlToPlainText(value) : value;
  return text.replace(/\u00a0/g, " ").trim();
}

function ticketCompleted(t: Ticket, w: ShiftWindow): boolean {
  return t.status === "completed" && isInWindow(t.completedAt, w);
}
function ticketWorked(t: Ticket, w: ShiftWindow): boolean {
  return t.status !== "completed" && isInWindow(t.updatedAt, w);
}
function ticketActiveWaiting(t: Ticket, w: ShiftWindow): boolean {
  return (t.status === "working" || t.status === "waiting-cs" || t.status === "waiting-prog") &&
    isInWindow(t.updatedAt, w);
}

function sessionCompleted(s: DispatchSession, w: ShiftWindow): boolean {
  return s.status === "ready" && isInWindow(s.completedAt, w);
}
function sessionWorked(s: DispatchSession, w: ShiftWindow): boolean {
  return s.status !== "ready" && isInWindow(s.updatedAt, w);
}
function sessionActiveWaiting(s: DispatchSession, w: ShiftWindow): boolean {
  return (s.status === "waiting-cs" || s.status === "waiting-prog" || s.status === "not-ready") &&
    isInWindow(s.updatedAt, w);
}

function workCompleted(a: AdditionalWork, w: ShiftWindow): boolean {
  return a.status === "completed" && isInWindow(a.completedAt, w);
}
function workWorked(a: AdditionalWork, w: ShiftWindow): boolean {
  return a.status === "working" && isInWindow(a.updatedAt, w);
}
function workActive(a: AdditionalWork, w: ShiftWindow): boolean {
  return a.status === "working" && isInWindow(a.updatedAt, w);
}

const SECTION_DIVIDER = "============================================================";
const ITEM_DIVIDER = "------------------------------------------------------------";

function pushSection(lines: string[], label: string): void {
  if (lines.length && lines[lines.length - 1] !== "") lines.push("");
  lines.push(label.toUpperCase());
  lines.push(SECTION_DIVIDER);
  lines.push("");
}

function pushDivider(lines: string[]): void {
  lines.push("");
  lines.push(ITEM_DIVIDER);
  lines.push("");
}

function pushField(lines: string[], label: string, value: string): void {
  lines.push(`   ${label}:`);
  const clean = value || "(none documented)";
  clean.split("\n").forEach((line) => lines.push(`   ${line}`));
  lines.push("");
}

function pushEntry(lines: string[], num: number, title: string, fields: [string, string][]): void {
  lines.push(`${num}. ${title}`);
  lines.push("");
  fields.forEach(([label, value]) => pushField(lines, label, value));
}

function ticketSummary(t: Ticket): string {
  const session = ticketsStore.getSession(t.id);
  const issue = cleanText(session.issueText);
  const parts: string[] = [];
  if (issue) parts.push(issue);
  else if (t.details.subject) parts.push(t.details.subject);
  return parts.join(" — ") || "(no summary)";
}
function ticketProgrammingNotes(t: Ticket): string {
  const s = ticketsStore.getSession(t.id);
  const lines: string[] = [];
  const changes = cleanText(s.changesText);
  const failure = cleanText(s.failureReason);
  const waiting = cleanText(s.waitingReason);
  const result = cleanText(s.resultNotes);
  if (changes) lines.push(`Changes: ${changes}`);
  if (failure) lines.push(`Failure Reason: ${failure}`);
  if (waiting) lines.push(`Waiting Reason: ${waiting}`);
  if (result) lines.push(`Notes: ${result}`);
  return lines.join("\n");
}

function dispatchSummary(s: DispatchSession): string {
  const reasons = s.reasons.map((r) => cleanText(r.text)).filter(Boolean);
  if (reasons.length) return reasons.join(" / ");
  return cleanText(s.summaryNotes).split("\n")[0] || "(no summary)";
}
function dispatchFinalStatus(s: DispatchSession): string {
  return s.status ? DISPATCH_STATUS_LABEL[s.status] : "(no final status)";
}
function dispatchNotes(s: DispatchSession): string {
  const lines: string[] = [];
  const statusReason = cleanText(s.statusReason);
  const summaryNotes = cleanText(s.summaryNotes);
  if (statusReason) lines.push(statusReason);
  if (summaryNotes && reasonsOrSummaryLong(s)) lines.push(summaryNotes);
  return lines.join("\n");
}
function reasonsOrSummaryLong(s: DispatchSession): boolean {
  return cleanText(s.summaryNotes).length > 0;
}

function workSummary(a: AdditionalWork): string {
  return cleanText(a.completionSummary) || cleanText(a.whatNeedsDone) || "(no summary)";
}
function workNotes(a: AdditionalWork): string {
  const lines: string[] = [];
  const notes = cleanText(a.notes);
  const programmingNotes = cleanText(a.programmingStatusNotes);
  const finalNotes = cleanText(a.completionFinalNotes);
  if (notes) lines.push(notes);
  if (programmingNotes) lines.push(`Programming Status Notes: ${programmingNotes}`);
  if (finalNotes) lines.push(finalNotes);
  return lines.join("\n");
}

// ----- Warnings -----
function ticketWarnings(t: Ticket): string[] {
  const s = ticketsStore.getSession(t.id);
  const out: string[] = [];
  if (!cleanText(s.issueText) && !t.details.subject) out.push("Ticket Issue missing");
  if (!cleanText(s.changesText)) out.push("Changes Made / Work Completed missing");
  if (!s.resultStatus && !cleanText(s.resultNotes)) out.push("Result / Testing or Current Status missing");
  return out;
}
function sessionWarnings(s: DispatchSession): string[] {
  const out: string[] = [];
  if (!s.status) out.push("Final Status missing");
  if (s.reasons.length === 0) out.push("No reasons/section results documented");
  if ((s.status === "waiting-cs" || s.status === "waiting-prog") && !cleanText(s.statusReason))
    out.push("Review Needed Reason missing");
  return out;
}
function workWarnings(a: AdditionalWork): string[] {
  const out: string[] = [];
  if (!cleanText(a.whatNeedsDone)) out.push("What needs done missing");
  if (a.status === "completed" && !cleanText(a.completionSummary))
    out.push("Completion summary missing");
  return out;
}

// ----- Builder -----

export interface BuildOptions {
  window: ShiftWindow;
  attentionIds: string[];
  hiddenSectionKeys?: string[];
}

export const SECTION_KEYS = {
  worked_freshdesk: "Freshdesk Tickets Worked",
  dispatch: "Contact Dispatch Testing",
  additional: "Additional Work",
  waiting: "Items Still In Progress / Waiting",
  attention: "Items Needing Attention",
} as const;

export type SectionKey = keyof typeof SECTION_KEYS;

export function buildEmail(opts: BuildOptions): BuildResult {
  const { window, attentionIds, hiddenSectionKeys = [] } = opts;
  const { tickets } = ticketsStore.getState();
  const { sessions } = dispatchStore.getState();
  const { items: works } = additionalWorkStore.getState();

  const warnings: InsufficientWarning[] = [];

  const lines: string[] = [];
  lines.push("Programming Status Summary");
  lines.push(`Shift: ${window.label}`);
  lines.push(`Window: ${window.timeLabel}`);
  lines.push("");

  const isHidden = (k: SectionKey) => hiddenSectionKeys.includes(k);

  // 1) Freshdesk worked (completed or worked in window)
  if (!isHidden("worked_freshdesk")) {
    const worked = tickets.filter((t) => ticketCompleted(t, window) || ticketWorked(t, window));
    if (worked.length) {
      pushSection(lines, SECTION_KEYS.worked_freshdesk);
      worked.forEach((t, i) => {
        const ws = ticketWarnings(t);
        if (ws.length) warnings.push({ ref: `Ticket #${t.number}`, reason: ws.join(", ") });
        if (i > 0) pushDivider(lines);
        const notes = ticketProgrammingNotes(t);
        pushEntry(lines, i + 1, `Ticket #${t.number} - Account ${t.accountNumber} / ${t.accountName}`, [
          ["Summary", ticketSummary(t)],
          ["Status", STATUS_LABEL[t.status]],
          ["Programming Notes", notes || "(none documented)"],
        ]);
      });
    }
  }

  // 2) Contact Dispatch Testing (completed in window)
  if (!isHidden("dispatch")) {
    const cdItems = sessions.filter((s) => sessionCompleted(s, window) || sessionWorked(s, window));
    if (cdItems.length) {
      pushSection(lines, SECTION_KEYS.dispatch);
      cdItems.forEach((s, i) => {
        const ws = sessionWarnings(s);
        if (ws.length) warnings.push({ ref: `Account ${s.accountNumber} (dispatch)`, reason: ws.join(", ") });
        if (i > 0) pushDivider(lines);
        const n = dispatchNotes(s);
        pushEntry(lines, i + 1, `Account ${s.accountNumber} / ${s.accountName}`, [
          ["Summary", dispatchSummary(s)],
          ["Final Status", dispatchFinalStatus(s)],
          ["Notes", n || "(none documented)"],
        ]);
      });
    }
  }

  // 3) Additional Work (completed or worked)
  if (!isHidden("additional")) {
    const awItems = works.filter((a) => workCompleted(a, window) || workWorked(a, window));
    // Include manually selected Night Plan items here (placed under Additional Work, unlabeled)
    const nightPlanAttention = collectAttentionNightPlan(attentionIds);
    if (awItems.length || nightPlanAttention.length) {
      pushSection(lines, SECTION_KEYS.additional);
      let awIdx = 0;
      awItems.forEach((a) => {
        const ws = workWarnings(a);
        if (ws.length) warnings.push({ ref: `Work "${a.title}"`, reason: ws.join(", ") });
        const acct = a.accountNumber ? ` - Account ${a.accountNumber} / ${a.accountName}` : "";
        awIdx += 1;
        if (awIdx > 1) pushDivider(lines);
        const n = workNotes(a);
        pushEntry(lines, awIdx, `${a.title}${acct}`, [
          ["Summary", workSummary(a)],
          ["Notes", n || "(none documented)"],
        ]);
      });
      nightPlanAttention.forEach((np) => {
        awIdx += 1;
        if (awIdx > 1) pushDivider(lines);
        pushEntry(lines, awIdx, np.task, [
          ["Summary", np.task],
          ["Notes", cleanText(np.notes) || "(none documented)"],
        ]);
      });
    }
  }

  // 4) Items Still In Progress / Waiting
  if (!isHidden("waiting")) {
    const waitingTickets = tickets.filter((t) => ticketActiveWaiting(t, window));
    const waitingSessions = sessions.filter((s) => sessionActiveWaiting(s, window));
    const waitingWorks = works.filter((a) => workActive(a, window));
    if (waitingTickets.length || waitingSessions.length || waitingWorks.length) {
      pushSection(lines, SECTION_KEYS.waiting);
      let wIdx = 0;
      waitingTickets.forEach((t) => {
        wIdx += 1;
        if (wIdx > 1) pushDivider(lines);
        const s = ticketsStore.getSession(t.id);
        const waitingOn = t.status === "waiting-cs" ? "Customer Service" : t.status === "waiting-prog" ? "Programming" : "—";
        const n = cleanText(s.waitingReason) || cleanText(s.changesText) || cleanText(s.resultNotes);
        pushEntry(lines, wIdx, `Ticket #${t.number} - Account ${t.accountNumber} / ${t.accountName}`, [
          ["Current Status", STATUS_LABEL[t.status]],
          ["Waiting On", waitingOn],
          ["Notes", n || "(none documented)"],
        ]);
      });
      waitingSessions.forEach((s) => {
        wIdx += 1;
        if (wIdx > 1) pushDivider(lines);
        const waitingOn = s.status === "waiting-cs" ? "Customer Service Review" : s.status === "waiting-prog" ? "Programming Review" : "Still working";
        pushEntry(lines, wIdx, `Dispatch — Account ${s.accountNumber} / ${s.accountName}`, [
          ["Current Status", dispatchFinalStatus(s)],
          ["Waiting On", waitingOn],
          ["Notes", cleanText(s.statusReason) || "(none documented)"],
        ]);
      });
      waitingWorks.forEach((a) => {
        const acct = a.accountNumber ? ` - Account ${a.accountNumber} / ${a.accountName}` : "";
        wIdx += 1;
        if (wIdx > 1) pushDivider(lines);
        pushEntry(lines, wIdx, `Work: ${a.title}${acct}`, [
          ["Current Status", "Currently Working On"],
          ["Notes", cleanText(a.programmingStatusNotes) || cleanText(a.notes) || "(none documented)"],
        ]);
      });
    }
  }

  // 5) Items Needing Attention (manual)
  if (!isHidden("attention")) {
    const items = attentionIds.map(parseAttentionId).filter(Boolean) as AttentionId[];
    const nonNP = items.filter((i) => i.kind !== "night-plan");
    if (nonNP.length) {
      pushSection(lines, SECTION_KEYS.attention);
      let atIdx = 0;
      nonNP.forEach((ref) => {
        if (ref.kind === "freshdesk") {
          const t = tickets.find((x) => x.id === ref.id);
          if (!t) return;
          atIdx += 1;
          if (atIdx > 1) pushDivider(lines);
          const s = ticketsStore.getSession(t.id);
          pushEntry(lines, atIdx, `Account ${t.accountNumber} / ${t.accountName} — Ticket #${t.number}`, [
            ["Reason", "Flagged for follow-up"],
            ["Current Status", STATUS_LABEL[t.status]],
            ["Notes", cleanText(s.waitingReason) || cleanText(s.resultNotes) || "(none documented)"],
          ]);
        } else if (ref.kind === "dispatch") {
          const s = sessions.find((x) => x.id === ref.id);
          if (!s) return;
          atIdx += 1;
          if (atIdx > 1) pushDivider(lines);
          pushEntry(lines, atIdx, `Account ${s.accountNumber} / ${s.accountName} — Dispatch`, [
            ["Reason", "Flagged for follow-up"],
            ["Current Status", dispatchFinalStatus(s)],
            ["Notes", cleanText(s.statusReason) || "(none documented)"],
          ]);
        } else if (ref.kind === "additional") {
          const a = works.find((x) => x.id === ref.id);
          if (!a) return;
          const acct = a.accountNumber ? `Account ${a.accountNumber} / ${a.accountName}` : "No account linked";
          atIdx += 1;
          if (atIdx > 1) pushDivider(lines);
          pushEntry(lines, atIdx, `${acct} — ${a.title}`, [
            ["Reason", "Flagged for follow-up"],
            ["Current Status", a.status === "completed" ? "Completed" : "Currently Working On"],
            ["Notes", cleanText(a.programmingStatusNotes) || cleanText(a.notes) || "(none documented)"],
          ]);
        }
      });
    }
  }

  // Trim trailing blank lines
  while (lines.length && lines[lines.length - 1] === "") lines.pop();

  const empty = lines.length <= 3; // only the header
  return { body: lines.join("\n"), warnings, empty };
}

function collectAttentionNightPlan(attentionIds: string[]) {
  const all = nightPlanHistory.getAll();
  const liveActive = nightPlanStore.get().items;
  return attentionIds
    .map(parseAttentionId)
    .filter((i): i is AttentionId => !!i && i.kind === "night-plan")
    .map((i) => {
      const fromHist = all.find((n) => n.id === i.id);
      if (fromHist) return { task: fromHist.task, notes: fromHist.notes };
      const fromLive = liveActive.find((n) => n.id === i.id);
      if (fromLive) return { task: fromLive.task, notes: fromLive.notes };
      return null;
    })
    .filter(Boolean) as { task: string; notes?: string }[];
}

/** Items eligible to appear in the Attention picker — only active waiting / in-progress. */
export interface AttentionCandidate {
  id: string;          // attention id
  kind: ItemKind;
  label: string;       // primary label
  sub: string;         // secondary
}

export function getAttentionCandidates(): AttentionCandidate[] {
  const { tickets } = ticketsStore.getState();
  const { sessions } = dispatchStore.getState();
  const { items: works } = additionalWorkStore.getState();

  const out: AttentionCandidate[] = [];
  tickets
    .filter((t) => t.status === "working" || t.status === "waiting-cs" || t.status === "waiting-prog")
    .forEach((t) =>
      out.push({
        id: attentionId("freshdesk", t.id),
        kind: "freshdesk",
        label: `Ticket #${t.number}`,
        sub: `${t.accountName} · ${STATUS_LABEL[t.status]}`,
      }),
    );
  sessions
    .filter((s) => s.status === "waiting-cs" || s.status === "waiting-prog" || s.status === "not-ready")
    .forEach((s) =>
      out.push({
        id: attentionId("dispatch", s.id),
        kind: "dispatch",
        label: `Dispatch — ${s.accountName}`,
        sub: dispatchFinalStatus(s),
      }),
    );
  works
    .filter((a) => a.status === "working")
    .forEach((a) =>
      out.push({
        id: attentionId("additional", a.id),
        kind: "additional",
        label: a.title,
        sub: a.accountName ? `Account ${a.accountNumber} · ${a.accountName}` : "No account linked",
      }),
    );
  // Night plan: include active items still in current shift (from main store), labelled "Night Plan"
  try {
    nightPlanStore.get().items
      .filter((i) => isNPActive(i.status))
      .forEach((i) =>
        out.push({
          id: attentionId("night-plan", i.id),
          kind: "night-plan",
          label: i.task,
          sub: "Night Plan item",
        }),
      );
  } catch {}
  return out;
}

export { stamp as formatStamp };

/**
 * Multi-shift wrapper: produces one combined text email with a shift heading
 * before each window's sections. Single-window arrays behave like buildEmail.
 */
export function buildEmailMulti(opts: {
  windows: ShiftWindow[];
  attentionIds: string[];
  hiddenSectionKeys?: string[];
}): BuildResult {
  const { windows, attentionIds, hiddenSectionKeys = [] } = opts;
  if (windows.length === 0) return { body: "", warnings: [], empty: true };
  if (windows.length === 1) {
    return buildEmail({ window: windows[0], attentionIds, hiddenSectionKeys });
  }
  const sorted = [...windows].sort((a, b) => a.start.getTime() - b.start.getTime());
  const warnings: InsufficientWarning[] = [];
  const out: string[] = [];
  out.push("Programming Status Summary");
  out.push(`Shifts: ${windows.length} combined`);
  out.push(
    `Range: ${sorted[0].label.split(" into ")[0]} → ${sorted[sorted.length - 1].label.split(" into ")[1] ?? sorted[sorted.length - 1].label}`,
  );
  out.push("");
  sorted.forEach((w) => {
    const r = buildEmail({ window: w, attentionIds, hiddenSectionKeys });
    // Strip the inner header (first 4 lines) added by buildEmail.
    const inner = r.body.split("\n").slice(4).join("\n").trimEnd();
    if (!inner) return;
    out.push(`────── Shift: ${w.label} (${w.timeLabel}) ──────`);
    out.push("");
    out.push(inner);
    out.push("");
    warnings.push(...r.warnings);
  });
  while (out.length && out[out.length - 1] === "") out.pop();
  return { body: out.join("\n"), warnings, empty: out.length <= 4 };
}