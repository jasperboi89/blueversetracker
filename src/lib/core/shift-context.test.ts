import { beforeEach, describe, expect, it } from "vitest";
import { reduceShiftContext, shiftContextStore, type ShiftWorkingContext } from "./shift-context";
import type { AccEvent, AccEventInput } from "./events";

const BASE: ShiftWorkingContext = {
  shiftKey: "test",
  recentActivity: [],
  blockers: [],
  warnings: [],
};

let seq = 0;
function ev(input: AccEventInput): AccEvent {
  seq += 1;
  return {
    id: `e${seq}`,
    timestamp: new Date(1_700_000_000_000 + seq * 1000).toISOString(),
    ...input,
  } as AccEvent;
}

function run(events: AccEventInput[], start: ShiftWorkingContext = BASE) {
  return events.reduce((ctx, e) => reduceShiftContext(ctx, ev(e)), start);
}

describe("shift context reducer", () => {
  beforeEach(() => {
    localStorage.clear();
    seq = 0;
  });

  it("sets the active ticket and correlates its account", () => {
    const ctx = run([
      {
        type: "ticket.opened",
        source: "route",
        ticketId: "t1",
        accountId: "4821",
        metadata: { label: "Ticket #123", accountName: "Example Clinic" },
      },
    ]);
    expect(ctx.activeTicket?.id).toBe("t1");
    expect(ctx.activeAccount).toEqual({ id: "4821", name: "Example Clinic" });
    expect(ctx.recentActivity[0]?.label).toBe("Ticket #123");
  });

  it("keeps the active ticket when the operator opens an account", () => {
    const ctx = run([
      { type: "ticket.opened", source: "route", ticketId: "t1", accountId: "4821" },
      { type: "account.opened", source: "route", accountId: "9000" },
    ]);
    expect(ctx.activeTicket?.id).toBe("t1");
    expect(ctx.activeAccount?.id).toBe("9000");
  });

  it("treats work.opened as a view and work.started as tracked work", () => {
    const viewed = run([
      { type: "work.opened", source: "route", workItemId: "w1", metadata: { label: "Task" } },
    ]);
    expect(viewed.activeWorkItem?.id).toBe("w1");
    expect(viewed.activeWorkItem?.startedAt).toBeUndefined();

    const started = run(
      [{ type: "work.started", source: "active-work", workItemId: "w1" }],
      viewed,
    );
    expect(started.activeWorkItem?.startedAt).toBeTruthy();
  });

  it("marks recent activity complete and clears the active item", () => {
    const ctx = run([
      { type: "work.started", source: "active-work", workItemId: "w1", metadata: { label: "Task" } },
      { type: "work.completed", source: "active-work", workItemId: "w1" },
    ]);
    expect(ctx.activeWorkItem).toBeUndefined();
    expect(ctx.recentActivity.filter((a) => a.id === "w1")).toHaveLength(1);
    expect(ctx.recentActivity[0]?.complete).toBe(true);
  });

  it("does not duplicate history on repeated completion events", () => {
    const ctx = run([
      { type: "ticket.opened", source: "route", ticketId: "t1" },
      { type: "ticket.completed", source: "tickets-store", ticketId: "t1" },
      { type: "ticket.completed", source: "tickets-store", ticketId: "t1" },
      {
        type: "night_plan.item_completed",
        source: "night-plan",
        metadata: { itemId: "n1", label: "Callback" },
      },
      {
        type: "night_plan.item_completed",
        source: "night-plan",
        metadata: { itemId: "n1", label: "Callback" },
      },
    ]);
    expect(ctx.recentActivity.filter((a) => a.id === "t1")).toHaveLength(1);
    expect(ctx.recentActivity.filter((a) => a.id === "n1")).toHaveLength(1);
    expect(ctx.activeTicket).toBeUndefined();
  });

  it("caps recent activity", () => {
    const events: AccEventInput[] = Array.from({ length: 40 }, (_, i) => ({
      type: "ticket.opened" as const,
      source: "route" as const,
      ticketId: `t${i}`,
    }));
    const ctx = run(events);
    expect(ctx.recentActivity).toHaveLength(25);
    expect(ctx.recentActivity[0]?.id).toBe("t39");
  });

  it("resets context on shift rollover", () => {
    const stale: ShiftWorkingContext = {
      ...BASE,
      shiftKey: "1999-01-01",
      activeTicket: { id: "old" },
      recentActivity: [{ id: "old", kind: "ticket", label: "Old", at: "x" }],
    };
    localStorage.setItem("aih:core:shiftctx:v1", JSON.stringify(stale));
    window.dispatchEvent(new Event("storage"));
    const ctx = shiftContextStore.get();
    expect(ctx.activeTicket).toBeUndefined();
    expect(ctx.recentActivity).toHaveLength(0);
    expect(ctx.shiftKey).not.toBe("1999-01-01");
  });
});