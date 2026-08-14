import { useMemo } from "react";
import { useTickets, type Ticket } from "@/lib/tickets-store";
import { useDispatch, type DispatchSession } from "@/lib/dispatch-store";
import { useAdditionalWork, type AdditionalWork } from "@/lib/additional-work-store";
import { useWorkLog, type WorkLogEntry } from "@/lib/workspace/work-log-store";
import { currentShiftWindow, isInWindow } from "@/lib/reports/shift-window";

export type LedgerKind = "freshdesk" | "dispatch" | "additional";

export interface LedgerEntry {
  id: string;
  kind: LedgerKind;
  /** epoch ms the work was completed / reached its recorded state */
  at: number;
  title: string;
  ticketNumber?: string;
  accountNumber?: string;
  accountName?: string;
  /** short result phrase, e.g. "Tested successfully" / "Ready for activation" */
  result: string;
  /** total logged time across sessions for this record, when known */
  durationMs?: number;
  /** deep link back to the authoritative record */
  to: string;
  params: Record<string, string>;
}

/** Sum durable work-log time for a single record. */
export function durationFor(log: WorkLogEntry[], workId: string): number | undefined {
  const total = log.reduce((sum, e) => (e.workId === workId ? sum + e.durationMs : sum), 0);
  return total > 0 ? total : undefined;
}

export function formatDuration(ms?: number): string | undefined {
  if (!ms || ms < 60_000) return undefined;
  const mins = Math.round(ms / 60_000);
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

export interface LedgerSources {
  tickets: Ticket[];
  sessions: DispatchSession[];
  items: AdditionalWork[];
  log: WorkLogEntry[];
}

/**
 * Derive the unified shift ledger from the authoritative work records. No new
 * source of truth: every entry points back at the record it came from.
 */
export function buildShiftLedger(src: LedgerSources): LedgerEntry[] {
  const { tickets, sessions, items, log } = src;

  const fromTickets: LedgerEntry[] = tickets
    .filter((t) => t.status === "completed" && t.completedAt)
    .map((t) => ({
      id: `fd-${t.id}`,
      kind: "freshdesk" as const,
      at: t.completedAt!,
      title: t.details.subject || `Ticket #${t.number}`,
      ticketNumber: t.number,
      accountNumber: t.accountNumber || undefined,
      accountName: t.accountName || undefined,
      result: "Completed",
      durationMs: durationFor(log, t.id),
      to: "/freshdesk-tickets/$ticketId/work",
      params: { ticketId: t.id },
    }));

  const fromDispatch: LedgerEntry[] = sessions
    .filter((s) => (s.status === "ready" || s.status === "activated") && (s.completedAt || s.activatedAt))
    .map((s) => ({
      id: `ds-${s.id}`,
      kind: "dispatch" as const,
      at: (s.status === "activated" ? s.activatedAt : s.completedAt) ?? s.updatedAt,
      title: "Contact Dispatch testing",
      ticketNumber: s.ticketNumber || undefined,
      accountNumber: s.accountNumber || undefined,
      accountName: s.accountName || undefined,
      result: s.status === "activated" ? "Activated" : "Ready for activation",
      durationMs: durationFor(log, s.id),
      to: "/contact-dispatch/$sessionId/work",
      params: { sessionId: s.id },
    }));

  const fromAdditional: LedgerEntry[] = items
    .filter((w) => w.status === "completed" && w.completedAt)
    .map((w) => ({
      id: `aw-${w.id}`,
      kind: "additional" as const,
      at: w.completedAt!,
      title: w.title,
      accountNumber: w.accountNumber,
      accountName: w.accountName,
      result: "Completed",
      durationMs: durationFor(log, w.id),
      to: "/additional-work/$workId/work",
      params: { workId: w.id },
    }));

  return [...fromTickets, ...fromDispatch, ...fromAdditional].sort((a, b) => b.at - a.at);
}

export interface ShiftLedgerView {
  /** everything completed inside the current 10pm→6am Central window */
  shift: LedgerEntry[];
  /** the full derived history, newest first */
  all: LedgerEntry[];
  totalMs: number;
}

export function useShiftLedger(): ShiftLedgerView {
  const { tickets } = useTickets();
  const { sessions } = useDispatch();
  const { items } = useAdditionalWork();
  const { entries } = useWorkLog();

  return useMemo(() => {
    const all = buildShiftLedger({ tickets, sessions, items, log: entries });
    const win = currentShiftWindow();
    const shift = all.filter((e) => isInWindow(e.at, win));
    const totalMs = shift.reduce((s, e) => s + (e.durationMs ?? 0), 0);
    return { all, shift, totalMs };
  }, [tickets, sessions, items, entries]);
}
