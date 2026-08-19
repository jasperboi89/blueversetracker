/**
 * Collects the work items that qualify for the *concise* Programming Status
 * Email. This is a read-only projection over the detailed portal records —
 * nothing here mutates or trims what is stored in the portal.
 */
import { ticketsStore, STATUS_LABEL, type Ticket } from "../tickets-store";
import { dispatchStore, DISPATCH_STATUS_LABEL, type DispatchSession } from "../dispatch-store";
import { additionalWorkStore, type AdditionalWork } from "../additional-work-store";
import { htmlToPlainText } from "../rich-text";
import { isInWindow, type ShiftWindow } from "./shift-window";

export type ConciseKind = "freshdesk" | "additional" | "dispatch";

export interface ConciseSnip {
  id: string;
  name: string;
  category?: string;
  label?: string;
  dataUrl?: string;
  isImage: boolean;
}

export interface ConciseItem {
  /** Stable key: `${kind}:${recordId}` */
  key: string;
  kind: ConciseKind;
  /** Numbered-list heading, e.g. "Freshdesk Ticket #123456" */
  title: string;
  /** Raw documented detail handed to the summarizer (never emailed verbatim). */
  context: string;
  /** Deterministic fallback used when AI is off/unavailable. */
  fallback: { issue: string; changes: string; notes: string };
  snips: ConciseSnip[];
  updatedAt: number;
}

export function cleanText(value: string | null | undefined): string {
  if (!value) return "";
  const text = /<\/?[a-z][\s\S]*>/i.test(value) ? htmlToPlainText(value) : value;
  return text.replace(/\u00a0/g, " ").replace(/\n{3,}/g, "\n\n").trim();
}

function firstSentence(text: string, max = 220): string {
  const t = cleanText(text).replace(/\s+/g, " ");
  if (!t) return "";
  const m = t.match(/^.*?[.!?](\s|$)/);
  const s = (m ? m[0] : t).trim();
  return s.length > max ? `${s.slice(0, max - 1).trimEnd()}…` : s;
}

function twoSentences(text: string, max = 320): string {
  const t = cleanText(text).replace(/\s+/g, " ");
  if (!t) return "";
  const parts = t.match(/[^.!?]+[.!?]?/g) ?? [t];
  const s = parts.slice(0, 2).join(" ").trim();
  return s.length > max ? `${s.slice(0, max - 1).trimEnd()}…` : s;
}

/* ------------------------------- Freshdesk ------------------------------- */

function ticketWorked(t: Ticket, w: ShiftWindow): boolean {
  if (t.status === "completed") return isInWindow(t.completedAt, w) || isInWindow(t.updatedAt, w);
  return isInWindow(t.updatedAt, w);
}

function ticketItem(t: Ticket): ConciseItem {
  const s = ticketsStore.getSession(t.id);
  const issue = cleanText(s.issueText) || cleanText(t.details.subject);
  const changes = cleanText(s.changesText);
  const result = cleanText(s.resultNotes);
  const waiting = cleanText(s.waitingReason);
  const failure = cleanText(s.failureReason);

  const context = [
    `Ticket #${t.number}`,
    `Account: ${t.accountNumber} ${t.accountName}`,
    `Current status: ${STATUS_LABEL[t.status]}`,
    t.issueClassification ? `Classification: ${t.issueClassification}` : "",
    issue ? `Documented issue: ${issue}` : "",
    changes ? `Documented changes made: ${changes}` : "",
    result ? `Result / testing notes: ${result}` : "",
    waiting ? `Waiting reason: ${waiting}` : "",
    failure ? `Failure reason: ${failure}` : "",
  ]
    .filter(Boolean)
    .join("\n")
    .slice(0, 3000);

  const notesFallback = waiting || failure || (t.status !== "completed" ? `Still ${STATUS_LABEL[t.status].toLowerCase()}.` : "");

  return {
    key: `freshdesk:${t.id}`,
    kind: "freshdesk",
    title: `Freshdesk Ticket #${t.number}${t.accountName ? ` — ${t.accountName}` : ""}`,
    context,
    fallback: {
      issue: firstSentence(issue),
      changes: twoSentences([changes, result].filter(Boolean).join(" ")),
      notes: firstSentence(notesFallback),
    },
    snips: ((t.hubSnips ?? []) as unknown as ConciseSnip[]) ?? [],
    updatedAt: t.completedAt ?? t.updatedAt,
  };
}

/* ----------------------------- Additional Work ---------------------------- */

function workWorked(a: AdditionalWork, w: ShiftWindow): boolean {
  if (a.status === "completed") return isInWindow(a.completedAt, w) || isInWindow(a.updatedAt, w);
  return isInWindow(a.updatedAt, w);
}

function workItem(a: AdditionalWork): ConciseItem {
  const need = cleanText(a.whatNeedsDone);
  const summary = cleanText(a.completionSummary);
  const notes = cleanText(a.notes);
  const prog = cleanText(a.programmingStatusNotes);
  const finalNotes = cleanText(a.completionFinalNotes);

  const context = [
    `Work item: ${a.title}`,
    a.accountNumber ? `Account: ${a.accountNumber} ${a.accountName ?? ""}` : "",
    `Status: ${a.status === "completed" ? "Completed" : "Currently working"}`,
    need ? `What needed done: ${need}` : "",
    summary ? `Completion summary: ${summary}` : "",
    notes ? `Notes: ${notes}` : "",
    prog ? `Programming status notes: ${prog}` : "",
    finalNotes ? `Final notes: ${finalNotes}` : "",
  ]
    .filter(Boolean)
    .join("\n")
    .slice(0, 3000);

  return {
    key: `additional:${a.id}`,
    kind: "additional",
    title: `${a.title}${a.accountNumber ? ` — ${a.accountNumber} ${a.accountName ?? ""}`.trimEnd() : ""}`,
    context,
    fallback: {
      issue: "",
      changes: twoSentences(summary || need || notes),
      notes: firstSentence(a.status === "completed" ? "" : prog || "Work is still in progress."),
    },
    snips: ((a.snips ?? []) as unknown as ConciseSnip[]) ?? [],
    updatedAt: a.completedAt ?? a.updatedAt,
  };
}

/* ----------------------------- Contact Dispatch --------------------------- */

function sessionWorked(s: DispatchSession, w: ShiftWindow): boolean {
  return isInWindow(s.updatedAt, w) || isInWindow(s.completedAt, w) || isInWindow(s.createdAt, w);
}

function sessionItem(s: DispatchSession): ConciseItem {
  const reasons = s.reasons.map((r) => cleanText(r.text)).filter(Boolean).join(" / ");
  const statusLabel = s.status ? DISPATCH_STATUS_LABEL[s.status] : "In progress";
  const summaryNotes = cleanText(s.summaryNotes);
  const statusReason = cleanText(s.statusReason);

  const context = [
    `Contact Dispatch for account ${s.accountNumber} ${s.accountName}`,
    s.ticketNumber ? `Related ticket: #${s.ticketNumber}` : "",
    `Final status: ${statusLabel}`,
    reasons ? `Reasons / scenarios tested: ${reasons}` : "",
    summaryNotes ? `Testing summary notes: ${summaryNotes}` : "",
    statusReason ? `Status reason: ${statusReason}` : "",
  ]
    .filter(Boolean)
    .join("\n")
    .slice(0, 3000);

  return {
    key: `dispatch:${s.id}`,
    kind: "dispatch",
    title: `${s.accountName} — Account ${s.accountNumber}`,
    context,
    fallback: {
      issue: "",
      changes: twoSentences(summaryNotes || reasons || `Contact Dispatch testing — ${statusLabel}.`),
      notes: firstSentence(s.status === "ready" ? "" : statusReason || `${statusLabel}.`),
    },
    snips: ((s.snips ?? []) as unknown as ConciseSnip[]) ?? [],
    updatedAt: s.completedAt ?? s.updatedAt,
  };
}

/* --------------------------------- Public --------------------------------- */

export interface ConciseCollection {
  freshdesk: ConciseItem[];
  additional: ConciseItem[];
  dispatch: ConciseItem[];
}

export function collectConciseItems(windows: ShiftWindow[]): ConciseCollection {
  const { tickets } = ticketsStore.getState();
  const { sessions } = dispatchStore.getState();
  const { items: works } = additionalWorkStore.getState();
  const inAny = <T,>(rows: T[], pred: (row: T, w: ShiftWindow) => boolean) =>
    rows.filter((row) => windows.some((w) => pred(row, w)));

  const byRecency = (a: ConciseItem, b: ConciseItem) => a.updatedAt - b.updatedAt;

  return {
    freshdesk: inAny(tickets, ticketWorked).map(ticketItem).sort(byRecency),
    additional: inAny(works, workWorked).map(workItem).sort(byRecency),
    dispatch: inAny(sessions, sessionWorked).map(sessionItem).sort(byRecency),
  };
}

export function allItems(c: ConciseCollection): ConciseItem[] {
  return [...c.freshdesk, ...c.additional, ...c.dispatch];
}
