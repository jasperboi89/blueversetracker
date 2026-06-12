export type AlertPriority = "critical" | "warning" | "info";
export interface MockAlert {
  id: string;
  priority: AlertPriority;
  title: string;
  detail: string;
  updatedAt: Date;
}

const now = new Date();
export const mockAlerts: MockAlert[] = [
  {
    id: "a1",
    priority: "critical",
    title: "Account 4821 — On Call escalation flagged",
    detail: "Three repeat callers in the last 30 minutes. Review dispatch instructions.",
    updatedAt: new Date(now.getTime() - 12 * 60_000),
  },
  {
    id: "a2",
    priority: "warning",
    title: "Freshdesk sync slower than usual",
    detail: "API response 1.8s avg. Tickets still pulling, just keep an eye on it.",
    updatedAt: new Date(now.getTime() - 40 * 60_000),
  },
  {
    id: "a3",
    priority: "info",
    title: "Night Plan template updated",
    detail: "Two new shift checklist suggestions are available.",
    updatedAt: new Date(now.getTime() - 2 * 60 * 60_000),
  },
];