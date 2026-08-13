/**
 * One explicit handler per action type. No generic "mutate arbitrary store"
 * path exists — an action can only do what its handler allows.
 *
 * EVENT SPINE OWNERSHIP: the domain stores are the single authoritative
 * emitters (night-plan-store, tickets-store, active-work-store). Handlers call
 * those stores and never emit a second event, so one transition = one event.
 */
import { nightPlanStore, type Priority } from "@/lib/night-plan-store";
import { ticketsStore, type IssueClassification } from "@/lib/tickets-store";
import { setActiveWork } from "@/lib/workspace/active-work-store";
import {
  sanitizeSnapshot,
  type ActionPayloadMap,
  type ActionRisk,
  type ActionType,
  type LedgerSnapshot,
} from "./actions";

export type Validated<T> = { ok: true; payload: T } | { ok: false; message: string };

export interface HandlerExecution {
  ok: boolean;
  message: string;
  before?: LedgerSnapshot;
  after?: LedgerSnapshot;
  entityType?: string;
  entityId?: string;
}

export interface ActionHandler<T extends ActionType> {
  type: T;
  risk: ActionRisk;
  describe: (payload: ActionPayloadMap[T]) => string;
  validate: (payload: unknown) => Validated<ActionPayloadMap[T]>;
  execute: (payload: ActionPayloadMap[T]) => HandlerExecution;
}

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}
function obj(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}
function priorityOf(p: unknown): Priority {
  return p === "must" || p === "important" ? p : "normal";
}

const addNightPlanItem: ActionHandler<"add_night_plan_item"> = {
  type: "add_night_plan_item",
  risk: "low_write",
  describe: (p) => `Add night plan item: “${p.task}”${p.priority ? ` (${p.priority})` : ""}`,
  validate: (raw) => {
    const o = obj(raw);
    if (!o) return { ok: false, message: "Invalid payload." };
    const task = str(o["task"]);
    if (!task) return { ok: false, message: "No task to add." };
    if (task.length > 300) return { ok: false, message: "Task is too long." };
    return {
      ok: true,
      payload: { task, notes: str(o["notes"]) || undefined, priority: priorityOf(o["priority"]) },
    };
  },
  execute: (p) => {
    const before = nightPlanStore.get().items.length;
    nightPlanStore.add(p.task, p.notes ?? "", priorityOf(p.priority));
    const items = nightPlanStore.get().items;
    if (items.length <= before) return { ok: false, message: "Couldn't add the night plan item." };
    const item = items[items.length - 1]!;
    return {
      ok: true,
      message: "Added to the night plan.",
      before: null,
      after: sanitizeSnapshot({ itemId: item.id, priority: item.priority, status: item.status }),
      entityType: "night_plan_item",
      entityId: item.id,
    };
  },
};

const completeNightPlanItem: ActionHandler<"complete_night_plan_item"> = {
  type: "complete_night_plan_item",
  risk: "low_write",
  describe: (p) => `Mark night plan item done: “${p.task}”`,
  validate: (raw) => {
    const o = obj(raw);
    if (!o) return { ok: false, message: "Invalid payload." };
    const task = str(o["task"]);
    if (!task) return { ok: false, message: "No night plan item named." };
    return { ok: true, payload: { task } };
  },
  execute: (p) => {
    const needle = p.task.toLowerCase();
    const item = nightPlanStore
      .get()
      .items.find(
        (i) =>
          i.status !== "done" &&
          (i.task.toLowerCase() === needle || i.task.toLowerCase().includes(needle)),
      );
    if (!item) return { ok: false, message: "No matching night plan item." };
    nightPlanStore.setStatus(item.id, "done");
    return {
      ok: true,
      message: "Night plan item completed.",
      before: sanitizeSnapshot({ itemId: item.id, status: item.status }),
      after: sanitizeSnapshot({ itemId: item.id, status: "done" }),
      entityType: "night_plan_item",
      entityId: item.id,
    };
  },
};

const VALID_CLASSIFICATIONS: IssueClassification[] = [
  "Scripting Issue",
  "Client Change",
  "Other",
];

const setTicketClassification: ActionHandler<"set_ticket_classification"> = {
  type: "set_ticket_classification",
  risk: "low_write",
  describe: (p) => `Set ticket #${p.ticketNumber} classification to ${p.classification}`,
  validate: (raw) => {
    const o = obj(raw);
    if (!o) return { ok: false, message: "Invalid payload." };
    const ticketNumber = str(o["ticketNumber"]).replace(/^#/, "");
    if (!ticketNumber) return { ok: false, message: "No ticket number." };
    const cls = VALID_CLASSIFICATIONS.find(
      (v) => v.toLowerCase() === str(o["classification"]).toLowerCase(),
    );
    if (!cls) return { ok: false, message: "Unknown classification." };
    return { ok: true, payload: { ticketNumber, classification: cls } };
  },
  execute: (p) => {
    const t = ticketsStore.getState().tickets.find((x) => x.number === p.ticketNumber);
    if (!t) return { ok: false, message: `Ticket #${p.ticketNumber} isn't tracked.` };
    const before = t.issueClassification ?? null;
    ticketsStore.setIssueClassification(t.id, p.classification as IssueClassification);
    return {
      ok: true,
      message: `Ticket #${p.ticketNumber} classified as ${p.classification}.`,
      before: sanitizeSnapshot({ classification: before }) ?? { classification: null },
      after: sanitizeSnapshot({ classification: p.classification }),
      entityType: "ticket",
      entityId: t.id,
    };
  },
};

const startTimer: ActionHandler<"start_timer"> = {
  type: "start_timer",
  risk: "low_write",
  describe: (p) => `Start a work timer on ticket #${p.ticketNumber}`,
  validate: (raw) => {
    const o = obj(raw);
    if (!o) return { ok: false, message: "Invalid payload." };
    const ticketNumber = str(o["ticketNumber"]).replace(/^#/, "");
    if (!ticketNumber) return { ok: false, message: "No ticket number." };
    return { ok: true, payload: { ticketNumber } };
  },
  execute: (p) => {
    const t = ticketsStore.getState().tickets.find((x) => x.number === p.ticketNumber);
    if (!t) return { ok: false, message: `Ticket #${p.ticketNumber} isn't tracked.` };
    setActiveWork({
      kind: "ticket",
      id: t.id,
      label: `#${t.number} ${t.details.subject ?? ""}`.trim(),
      to: "/freshdesk-tickets/$ticketId/work",
      params: { ticketId: t.id },
      accountNumber: t.accountNumber,
      accountName: t.accountName,
    });
    return {
      ok: true,
      message: `Timer started on #${p.ticketNumber}.`,
      before: null,
      after: sanitizeSnapshot({ workItemId: t.id, kind: "ticket" }),
      entityType: "ticket",
      entityId: t.id,
    };
  },
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const HANDLERS: Record<ActionType, ActionHandler<any>> = {
  add_night_plan_item: addNightPlanItem,
  complete_night_plan_item: completeNightPlanItem,
  set_ticket_classification: setTicketClassification,
  start_timer: startTimer,
};

export function getActionHandler<T extends ActionType>(type: T): ActionHandler<T> | undefined {
  return HANDLERS[type] as ActionHandler<T> | undefined;
}
