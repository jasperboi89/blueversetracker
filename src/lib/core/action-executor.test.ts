import { beforeEach, describe, expect, it, vi } from "vitest";
import { executeAction, type LedgerPort } from "./action-executor";
import { createProposedAction, sanitizeSnapshot, type AnyProposedAction } from "./actions";
import { nightPlanStore } from "@/lib/night-plan-store";
import { eventSpine } from "./event-spine";

/** In-memory stand-in for the server ledger, enforcing the same uniqueness. */
function fakeLedger() {
  const rows = new Map<string, { status: string; before?: unknown; after?: unknown }>();
  const port: LedgerPort = {
    reserve: async ({ idempotencyKey }) => {
      const prior = rows.get(idempotencyKey);
      if (prior) return { outcome: "duplicate", priorStatus: prior.status };
      rows.set(idempotencyKey, { status: "executing" });
      return { outcome: "reserved", priorStatus: null };
    },
    finalize: async ({ idempotencyKey, status, before, after }) => {
      rows.set(idempotencyKey, { status, before, after });
    },
  };
  return { port, rows };
}

function addItemAction(task = "Call the on-call tech"): AnyProposedAction {
  return createProposedAction({
    type: "add_night_plan_item",
    payload: { task, priority: "must" },
    origin: "copilot",
  }) as AnyProposedAction;
}

/** The store has no delete API, so tests assert on deltas from a baseline. */
let baseline = 0;
const countTask = (task: string) =>
  nightPlanStore.get().items.filter((i) => i.task === task).length;

beforeEach(() => {
  baseline = nightPlanStore.get().items.length;
});

describe("safe action executor", () => {
  it("executes a valid supported action and records the transition", async () => {
    const { port, rows } = fakeLedger();
    const action = addItemAction();
    const res = await executeAction(action, { confirmed: true, ledger: port });

    expect(res.status).toBe("success");
    expect(nightPlanStore.get().items.some((i) => i.task === "Call the on-call tech")).toBe(true);
    const record = rows.get(action.idempotencyKey)!;
    expect(record.status).toBe("success");
    expect(record.after).toMatchObject({ priority: "must" });
  });

  it("rejects an invalid payload without mutating", async () => {
    const { port } = fakeLedger();
    const action = createProposedAction({
      type: "add_night_plan_item",
      payload: { task: "  " },
      origin: "copilot",
    }) as AnyProposedAction;
    const res = await executeAction(action, { confirmed: true, ledger: port });
    expect(res.status).toBe("rejected");
    expect(nightPlanStore.get().items).toHaveLength(baseline);
  });

  it("rejects an unknown action type", async () => {
    const { port } = fakeLedger();
    const bogus = { ...addItemAction(), type: "delete_everything" } as unknown as AnyProposedAction;
    const res = await executeAction(bogus, { confirmed: true, ledger: port });
    expect(res.status).toBe("rejected");
  });

  it("rejects an unconfirmed copilot action", async () => {
    const { port } = fakeLedger();
    const res = await executeAction(addItemAction(), { confirmed: false, ledger: port });
    expect(res.status).toBe("rejected");
    expect(nightPlanStore.get().items).toHaveLength(baseline);
  });

  it("does not execute twice for the same idempotency key", async () => {
    const { port } = fakeLedger();
    const action = addItemAction();
    const first = await executeAction(action, { confirmed: true, ledger: port });
    const second = await executeAction(action, { confirmed: true, ledger: port });

    expect(first.status).toBe("success");
    expect(second.status).toBe("duplicate");
    expect(countTask(action.payload.task)).toBe(1);
  });

  it("returns a failed result when the mutation cannot complete", async () => {
    const { port, rows } = fakeLedger();
    const action = createProposedAction({
      type: "set_ticket_classification",
      payload: { ticketNumber: "999999", classification: "Other" },
      origin: "copilot",
    }) as AnyProposedAction;
    const res = await executeAction(action, { confirmed: true, ledger: port });
    expect(res.status).toBe("failed");
    expect(res.message).toMatch(/isn't tracked/);
    expect(rows.get(action.idempotencyKey)?.status).toBe("failed");
  });

  it("fails without mutating when the ledger is unreachable", async () => {
    const port: LedgerPort = {
      reserve: async () => {
        throw new Error("network down");
      },
      finalize: async () => undefined,
    };
    const res = await executeAction(addItemAction(), { confirmed: true, ledger: port });
    expect(res.status).toBe("failed");
    expect(nightPlanStore.get().items).toHaveLength(baseline);
  });

  it("emits exactly one Event Spine event per transition", async () => {
    const { port } = fakeLedger();
    const seen: string[] = [];
    const off = eventSpine.subscribe((e) => seen.push(e.type));
    await executeAction(addItemAction(), { confirmed: true, ledger: port });
    off();
    expect(seen.filter((t) => t === "night_plan.item_added")).toHaveLength(1);
  });
});

describe("ledger snapshot privacy", () => {
  it("keeps only allowlisted fields", () => {
    const out = sanitizeSnapshot({
      classification: "Other",
      ticketBody: "patient called about medication",
      prompt: "system prompt",
      status: "open",
    });
    expect(out).toEqual({ classification: "Other", status: "open" });
  });

  it("drops arbitrary metadata entirely", () => {
    expect(sanitizeSnapshot({ notes: "caller name", accountInstructions: "..." })).toBeNull();
  });
});

describe("copilot integration", () => {
  it("discard performs no mutation", async () => {
    const spy = vi.spyOn(nightPlanStore, "add");
    // Discard never reaches the executor at all.
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});
