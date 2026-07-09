import { useNow } from "@/hooks/use-now";
import { isOverdue, useTickets, type Ticket } from "@/lib/tickets-store";
import { useActiveWork, elapsedMs } from "@/lib/workspace/active-work-store";
import { useRecurringRows } from "@/lib/reports/recurring-issues";
import { nightPlanStore } from "@/lib/night-plan-store";

export type InsightSeverity = "info" | "warn" | "high";

export interface Insight {
  id: string;
  severity: InsightSeverity;
  text: string;
  /** Optional jump target (TanStack route id + params). */
  to?: string;
  params?: Record<string, string>;
}

const LONG_TASK_MS = 25 * 60 * 1000;
const STALE_WAITING_MS = 2 * 24 * 60 * 60 * 1000;

/**
 * Rule-based situational awareness — instant, free, deterministic. The reasoned
 * AI layer (aiFocus) builds on the same signals when the operator asks.
 */
export function useInsights(): Insight[] {
  const { tickets } = useTickets();
  const { current } = useActiveWork();
  const recurring = useRecurringRows();
  const now = useNow(30_000);
  const nowMs = now.getTime() || Date.now();

  const insights: Insight[] = [];

  // Time-on-task: gently flag long stretches on one item.
  if (current) {
    const ms = elapsedMs(current, nowMs);
    if (ms > LONG_TASK_MS) {
      const mins = Math.round(ms / 60000);
      insights.push({
        id: "long-task",
        severity: "high",
        text: `You've been on ${current.label} for ${mins} min — capture a note, or hand off if blocked.`,
        to: current.to,
        params: current.params,
      });
    }
  }

  // Overdue tickets.
  const overdue = tickets.filter((t) => t.status !== "completed" && isOverdue(t));
  if (overdue.length > 0) {
    insights.push({
      id: "overdue",
      severity: "high",
      text: `${overdue.length} ticket${overdue.length === 1 ? "" : "s"} overdue.`,
      to: "/_authenticated/freshdesk-tickets",
      params: {},
    });
  }

  // Current account is a recurring-issue account.
  if (current?.kind === "ticket") {
    const t = tickets.find((x) => x.id === current.id);
    const rec = t && recurring.find((r) => r.accountNumber === t.accountNumber && r.triggered);
    if (t && rec) {
      insights.push({
        id: "recurring-account",
        severity: "warn",
        text: `Account ${t.accountNumber} is recurring (${rec.rollingCount} in 30d) — check history before changing.`,
      });
    }
  }

  // Stale waiting tickets.
  const stale = tickets.filter(
    (t: Ticket) =>
      (t.status === "waiting-cs" || t.status === "waiting-prog") &&
      nowMs - t.updatedAt > STALE_WAITING_MS,
  );
  if (stale.length > 0) {
    insights.push({
      id: "stale-waiting",
      severity: "warn",
      text: `${stale.length} waiting ticket${stale.length === 1 ? "" : "s"} idle 2+ days — nudge or close out.`,
      to: "/_authenticated/freshdesk-tickets",
      params: {},
    });
  }

  // Night-plan must-dos still open.
  const mustDo = nightPlanStore
    .get()
    .items.filter(
      (i) => i.priority === "must" && (i.status === "todo" || i.status === "in-progress"),
    );
  if (mustDo.length > 0) {
    insights.push({
      id: "night-plan",
      severity: "info",
      text: `Night plan: ${mustDo.length} must-do item${mustDo.length === 1 ? "" : "s"} left.`,
      to: "/_authenticated/",
      params: {},
    });
  }

  // Nothing active but open work exists.
  if (!current) {
    const open = tickets.filter((t) => t.status !== "completed");
    if (open.length > 0) {
      insights.push({
        id: "nothing-active",
        severity: "info",
        text: `Nothing in progress — ${open.length} open ticket${open.length === 1 ? "" : "s"} waiting.`,
        to: "/_authenticated/freshdesk-tickets",
        params: {},
      });
    }
  }

  return insights;
}

export function hasHighInsight(insights: Insight[]): boolean {
  return insights.some((i) => i.severity === "high");
}
