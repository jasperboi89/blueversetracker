import { useEffect } from "react";
import { useNow } from "@/hooks/use-now";
import { isOverdue, useTickets } from "@/lib/tickets-store";
import { useActiveWork } from "@/lib/workspace/active-work-store";
import { useAwareness, awarenessStore } from "@/lib/core/awareness-store";
import type { AwarenessItem, AwarenessSeverity } from "@/lib/core/awareness";

export type { AwarenessItem, AwarenessSeverity } from "@/lib/core/awareness";

export type InsightSeverity = "info" | "warn" | "high";

export interface Insight {
  id: string;
  severity: InsightSeverity;
  text: string;
  /** Optional jump target (TanStack route id + params). */
  to?: string;
  params?: Record<string, string>;
  /** Awareness dedupe key — present for rule-driven items. */
  dedupeKey?: string;
  /** Set while re-alerting is on cooldown; the item stays visible. */
  cooldownUntil?: string;
}

const SEVERITY_MAP: Record<AwarenessSeverity, InsightSeverity> = {
  info: "info",
  warning: "warn",
  critical: "high",
};

/** Adapter: awareness item -> the Insight shape the existing UI renders. */
export function insightFromAwareness(a: AwarenessItem): Insight {
  const nav = a.actions?.find((x) => x.kind === "navigate");
  return {
    id: a.dedupeKey,
    severity: SEVERITY_MAP[a.severity],
    text: a.message,
    to: nav?.to,
    params: nav?.params,
    dedupeKey: a.dedupeKey,
    cooldownUntil: a.cooldownUntil,
  };
}

/**
 * Deterministic situational awareness for the UI.
 *
 * Rules live in the Awareness engine (`@/lib/core/awareness`), which is driven
 * by the Event Spine and Shift Working Context. This hook only adapts those
 * items to the existing Insight shape and appends the two light, purely
 * derived nudges that need no dedupe/cooldown state.
 */
export function useInsights(): Insight[] {
  const awareness = useAwareness();
  const { tickets } = useTickets();
  const { current } = useActiveWork();
  const now = useNow(30_000);
  const nowMs = now.getTime() || Date.now();

  // The engine's slow tick handles durations; recompute when the view wakes.
  useEffect(() => {
    awarenessStore.recompute();
  }, [nowMs]);

  const insights = awareness.map(insightFromAwareness);

  const overdue = tickets.filter((t) => t.status !== "completed" && isOverdue(t, nowMs));
  if (overdue.length > 0) {
    insights.push({
      id: "overdue",
      severity: "high",
      text: `${overdue.length} ticket${overdue.length === 1 ? "" : "s"} overdue.`,
      to: "/freshdesk-tickets",
      params: {},
    });
  }

  const open = tickets.filter((t) => t.status !== "completed");
  if (!current && open.length > 0) {
    insights.push({
      id: "nothing-active",
      severity: "info",
      text: `Nothing in progress — ${open.length} open ticket${open.length === 1 ? "" : "s"} waiting.`,
      to: "/freshdesk-tickets",
      params: {},
    });
  }

  return insights;
}

/** Dismiss a rule-driven insight for the current condition. */
export function dismissInsight(insight: Insight): void {
  if (insight.dedupeKey) awarenessStore.dismiss(insight.dedupeKey);
}

export function hasHighInsight(insights: Insight[]): boolean {
  return insights.some((i) => i.severity === "high");
}
