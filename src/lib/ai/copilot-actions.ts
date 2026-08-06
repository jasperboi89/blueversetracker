import { nightPlanStore, type Priority } from "@/lib/night-plan-store";
import { ticketsStore, type IssueClassification } from "@/lib/tickets-store";
import { setActiveWork } from "@/lib/workspace/active-work-store";
import type { ProposedAction } from "./copilot-stream";

/** One-line human description of a proposed change, for the confirm card. */
export function describeAction(a: ProposedAction): string {
  switch (a.kind) {
    case "add_night_plan_item":
      return `Add night plan item: “${a.task ?? ""}”${a.priority ? ` (${a.priority})` : ""}`;
    case "complete_night_plan_item":
      return `Mark night plan item done: “${a.task ?? ""}”`;
    case "set_ticket_classification":
      return `Set ticket #${a.ticketNumber ?? "?"} classification to ${a.classification ?? "?"}`;
    case "start_timer":
      return `Start a work timer on ticket #${a.ticketNumber ?? "?"}`;
    default:
      return a.reason || "Proposed change";
  }
}

function priorityOf(p?: string | null): Priority {
  return p === "must" || p === "important" ? p : "normal";
}

/** Apply a confirmed proposal against the local stores. */
export function applyAction(a: ProposedAction): { ok: boolean; message: string } {
  switch (a.kind) {
    case "add_night_plan_item": {
      if (!a.task) return { ok: false, message: "No task to add." };
      nightPlanStore.add(a.task, a.notes ?? "", priorityOf(a.priority));
      return { ok: true, message: "Added to the night plan." };
    }
    case "complete_night_plan_item": {
      const needle = (a.task ?? "").toLowerCase().trim();
      const item = nightPlanStore
        .get()
        .items.find(
          (i) =>
            i.status !== "done" &&
            (i.task.toLowerCase() === needle || i.task.toLowerCase().includes(needle)),
        );
      if (!needle || !item) return { ok: false, message: "No matching night plan item." };
      nightPlanStore.setStatus(item.id, "done");
      return { ok: true, message: "Night plan item completed." };
    }
    case "set_ticket_classification": {
      const num = (a.ticketNumber ?? "").replace(/^#/, "");
      const t = ticketsStore.getState().tickets.find((x) => x.number === num);
      if (!t) return { ok: false, message: `Ticket #${num} isn't tracked.` };
      const valid: IssueClassification[] = ["Scripting Issue", "Client Change", "Other"];
      const cls = valid.find((v) => v.toLowerCase() === (a.classification ?? "").toLowerCase());
      if (!cls) return { ok: false, message: "Unknown classification." };
      ticketsStore.setIssueClassification(t.id, cls);
      return { ok: true, message: `Ticket #${num} classified as ${cls}.` };
    }
    case "start_timer": {
      const num = (a.ticketNumber ?? "").replace(/^#/, "");
      const t = ticketsStore.getState().tickets.find((x) => x.number === num);
      if (!t) return { ok: false, message: `Ticket #${num} isn't tracked.` };
      setActiveWork({
        kind: "ticket",
        id: t.id,
        label: `#${t.number} ${t.details.subject ?? ""}`.trim(),
        to: "/freshdesk-tickets/$ticketId/work",
        params: { ticketId: t.id },
        accountNumber: t.accountNumber,
        accountName: t.accountName,
      });
      return { ok: true, message: `Timer started on #${num}.` };
    }
    default:
      return { ok: false, message: "Unsupported action." };
  }
}