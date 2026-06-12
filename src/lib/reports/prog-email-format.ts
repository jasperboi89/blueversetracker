import { ticketsStore, STATUS_LABEL, type Ticket } from "../tickets-store";
import { dispatchStore, DISPATCH_STATUS_LABEL, type DispatchSession } from "../dispatch-store";
import { additionalWorkStore, type AdditionalWork } from "../additional-work-store";
import { isInWindow, isInWindowEither, type ShiftWindow } from "./shift-window";

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

function ticketSummary(t: Ticket): string {
  const session = ticketsStore.getSession(t.id);
  const issue = session.issueText.trim();
  const changes = session.changesText.trim();
  const result = session.resultNotes.trim();
  const parts: string[] = [];
  if (issue) parts.push(issue);
  else if (t.details.subject) parts.push(t.details.subject);
  return parts.join(" — ") || "(no summary)";
}
function ticketProgrammingNotes(t: Ticket): string {
  const s = ticketsStore.getSession(t.id);
  const lines: string[] = [];
  if (s.changesText.trim()) lines.push(`Changes: ${s.changesText.trim()}`);
  if (s.failureReason.trim()) lines.push(`Failure Reason: ${s.failureReason.trim()}`);
  if (s.waitingReason.trim()) lines.push(`Waiting Reason: ${s.waitingReason.trim()}`);
  if (s.resultNotes.trim()) lines.push(`Notes: ${s.resultNotes.trim()}`);
  return lines.join("\n");
}

function dispatchSummary(s: DispatchSession): string {
  const reasons = s.reasons.map((r) => r.text).filter(Boolean);
  if (reasons.length) return reasons.join(" / ");
  return s.summaryNotes.split("\n")[0] || "(no summary)";
}
function dispatchFinalStatus(s: DispatchSession): string {
  return s.status ? DISPATCH_STATUS_LABEL[s.status] : "(no final status)";
}
function dispatchNotes(s: DispatchSession): string {
  const lines: string[] = [];
  if (s.statusReason.trim()) lines.push(s.statusReason.trim());
  if (s.summaryNotes.trim() && reasonsOrSummaryLong(s)) lines.push(s.summaryNotes.trim());
  return lines.join("\n");
}
function reasonsOrSummaryLong(s: DispatchSession): boolean {
  return s.summaryNotes.trim().length > 0;
}

function workSummary(a: AdditionalWork): string {
  return a.completionSummary?.trim() || a.whatNeedsDone.trim() || "(no summary)";
}
function workNotes(a: AdditionalWork): string {
  const lines: string[] = [];
  if (a.notes.trim()) lines.push(a.notes.trim());
  if (a.programmingStatusNotes.trim()) lines.push(`Programming Status Notes: ${a.programmingStatusNotes.trim()}`);
  if (a.completionFinalNotes?.trim()) lines.push(a.completionFinalNotes.trim());
  return lines.join("\n");
}

// ----- Warnings -----
function ticketWarnings(t: Ticket): string[] {
  const s = ticketsStore.getSession(t.id);
  const out: string[] = [];
  if (!s.issueText.trim() && !t.details.subject) out.push("Ticket Issue missing");
  if (!s.changesText.trim()) out.push("Changes Made / Work Completed missing");
  if (!s.resultStatus && !s.resultNotes.trim()) out.push("Result / Testing or Current Status missing");
  return out;
}
function sessionWarnings(s: DispatchSession): string[] {
  const out: string[] = [];
  if (!s.status) out.push("Final Status missing");
  if (s.reasons.length === 0) out.push("No reasons/section results documented");
  if ((s.status === "waiting-cs" || s.status === "waiting-prog") && !s.statusReason.trim())
    out.push("Review Needed Reason missing");
  return out;
}
function workWarnings(a: AdditionalWork): string[] {
  const out: string[] = [];
  if (!a.whatNeedsDone.trim()) out.push("What needs done missing");
  if (a.status === "completed" && !a.completionSummary?.trim())
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
      lines.push(SECTION_KEYS.worked_freshdesk);
      lines.push("");
      worked.forEach((t) => {
        const ws = ticketWarnings(t);
        if (ws.length) warnings.push({ ref: `Ticket #${t.number}`, reason: ws.join(", ") });
        lines.push(`Ticket #${t.number} - Account ${t.accountNumber} / ${t.accountName}`);
        lines.push(`Summary: ${ticketSummary(t)}`);
        lines.push(`Status: ${STATUS_LABEL[t.status]}`);
        const notes = ticketProgrammingNotes(t);
        if (notes) {
          lines.push("Programming Notes:");
          notes.split("\n").forEach((l) => lines.push(`  ${l}`));
        } else {
          lines.push("Programming Notes: (none documented)");
        }
        lines.push("");
      });
    }
  }

  // 2) Contact Dispatch Testing (completed in window)
  if (!isHidden("dispatch")) {
    const cdItems = sessions.filter((s) => sessionCompleted(s, window) || sessionWorked(s, window));
    if (cdItems.length) {
      lines.push(SECTION_KEYS.dispatch);
      lines.push("");
      cdItems.forEach((s) => {
        const ws = sessionWarnings(s);
        if (ws.length) warnings.push({ ref: `Account ${s.accountNumber} (dispatch)`, reason: ws.join(", ") });
        lines.push(`Account ${s.accountNumber} / ${s.accountName}`);
        lines.push(`Summary: ${dispatchSummary(s)}`);
        lines.push(`Final Status: ${dispatchFinalStatus(s)}`);
        const n = dispatchNotes(s);
        if (n) {
          lines.push("Notes:");
          n.split("\n").forEach((l) => lines.push(`  ${l}`));
        } else {
          lines.push("Notes: (none documented)");
        }
        lines.push("");
      });
    }
  }

  // 3) Additional Work (completed or worked)
  if (!isHidden("additional")) {
    const awItems = works.filter((a) => workCompleted(a, window) || workWorked(a, window));
    // Include manually selected Night Plan items here (placed under Additional Work, unlabeled)
    const nightPlanAttention = collectAttentionNightPlan(attentionIds);
    if (awItems.length || nightPlanAttention.length) {
      lines.push(SECTION_KEYS.additional);
      lines.push("");
      awItems.forEach((a) => {
        const ws = workWarnings(a);
        if (ws.length) warnings.push({ ref: `Work "${a.title}"`, reason: ws.join(", ") });
        const acct = a.accountNumber ? ` - Account ${a.accountNumber} / ${a.accountName}` : "";
        lines.push(`${a.title}${acct}`);
        lines.push(`Summary: ${workSummary(a)}`);
        const n = workNotes(a);
        if (n) {
          lines.push("Notes:");
          n.split("\n").forEach((l) => lines.push(`  ${l}`));
        } else {
          lines.push("Notes: (none documented)");
        }
        lines.push("");
      });
      nightPlanAttention.forEach((np) => {
        lines.push(np.task);
        lines.push(`Summary: ${np.task}`);
        if (np.notes) {
          lines.push("Notes:");
          np.notes.split("\n").forEach((l) => lines.push(`  ${l}`));
        } else {
          lines.push("Notes: (none documented)");
        }
        lines.push("");
      });
    }
  }

  // 4) Items Still In Progress / Waiting
  if (!isHidden("waiting")) {
    const waitingTickets = tickets.filter((t) => ticketActiveWaiting(t, window));
    const waitingSessions = sessions.filter((s) => sessionActiveWaiting(s, window));
    const waitingWorks = works.filter((a) => workActive(a, window));
    if (waitingTickets.length || waitingSessions.length || waitingWorks.length) {
      lines.push(SECTION_KEYS.waiting);
      lines.push("");
      waitingTickets.forEach((t) => {
        lines.push(`Ticket #${t.number} - Account ${t.accountNumber} / ${t.accountName}`);
        lines.push(`Current status: ${STATUS_LABEL[t.status]}`);
        const s = ticketsStore.getSession(t.id);
        const waitingOn = t.status === "waiting-cs" ? "Customer Service" : t.status === "waiting-prog" ? "Programming" : "—";
        lines.push(`Waiting on: ${waitingOn}`);
        const n = s.waitingReason.trim() || s.changesText.trim() || s.resultNotes.trim();
        lines.push(`Notes: ${n || "(none documented)"}`);
        lines.push("");
      });
      waitingSessions.forEach((s) => {
        lines.push(`Dispatch — Account ${s.accountNumber} / ${s.accountName}`);
        lines.push(`Current status: ${dispatchFinalStatus(s)}`);
        const waitingOn = s.status === "waiting-cs" ? "Customer Service Review" : s.status === "waiting-prog" ? "Programming Review" : "Still working";
        lines.push(`Waiting on: ${waitingOn}`);
        lines.push(`Notes: ${s.statusReason.trim() || "(none documented)"}`);
        lines.push("");
      });
      waitingWorks.forEach((a) => {
        const acct = a.accountNumber ? ` - Account ${a.accountNumber} / ${a.accountName}` : "";
        lines.push(`Work: ${a.title}${acct}`);
        lines.push(`Current status: Currently Working On`);
        lines.push(`Notes: ${a.programmingStatusNotes.trim() || a.notes.trim() || "(none documented)"}`);
        lines.push("");
      });
    }
  }

  // 5) Items Needing Attention (manual)
  if (!isHidden("attention")) {
    const items = attentionIds.map(parseAttentionId).filter(Boolean) as AttentionId[];
    const nonNP = items.filter((i) => i.kind !== "night-plan");
    if (nonNP.length) {
      lines.push(SECTION_KEYS.attention);
      lines.push("");
      nonNP.forEach((ref) => {
        if (ref.kind === "freshdesk") {
          const t = tickets.find((x) => x.id === ref.id);
          if (!t) return;
          lines.push(`Account ${t.accountNumber} / ${t.accountName} — Ticket #${t.number}`);
          lines.push(`Reason: Flagged for follow-up`);
          lines.push(`Current status: ${STATUS_LABEL[t.status]}`);
          const s = ticketsStore.getSession(t.id);
          lines.push(`Notes: ${s.waitingReason.trim() || s.resultNotes.trim() || "(none documented)"}`);
          lines.push("");
        } else if (ref.kind === "dispatch") {
          const s = sessions.find((x) => x.id === ref.id);
          if (!s) return;
          lines.push(`Account ${s.accountNumber} / ${s.accountName} — Dispatch`);
          lines.push(`Reason: Flagged for follow-up`);
          lines.push(`Current status: ${dispatchFinalStatus(s)}`);
          lines.push(`Notes: ${s.statusReason.trim() || "(none documented)"}`);
          lines.push("");
        } else if (ref.kind === "additional") {
          const a = works.find((x) => x.id === ref.id);
          if (!a) return;
          const acct = a.accountNumber ? `Account ${a.accountNumber} / ${a.accountName}` : "No account linked";
          lines.push(`${acct} — ${a.title}`);
          lines.push(`Reason: Flagged for follow-up`);
          lines.push(`Current status: ${a.status === "completed" ? "Completed" : "Currently Working On"}`);
          lines.push(`Notes: ${a.programmingStatusNotes.trim() || a.notes.trim() || "(none documented)"}`);
          lines.push("");
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
  // Lazy import to avoid circular references
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { nightPlanHistory } = require("./night-plan-history") as typeof import("./night-plan-history");
  const all = nightPlanHistory.getAll();
  return attentionIds
    .map(parseAttentionId)
    .filter((i): i is AttentionId => !!i && i.kind === "night-plan")
    .map((i) => all.find((n) => n.id === i.id))
    .filter(Boolean) as ReturnType<typeof nightPlanHistory.getAll>;
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
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { nightPlanStore, isActive } = require("../night-plan-store") as typeof import("../night-plan-store");
    nightPlanStore.get().items
      .filter((i) => isActive(i.status))
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