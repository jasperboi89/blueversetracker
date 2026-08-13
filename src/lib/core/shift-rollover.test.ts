import { beforeEach, describe, expect, it, vi } from "vitest";

// Rollover behaviour is driven by getShiftKey, so it gets its own file where
// the shift clock can be controlled.
const shiftKey = { value: "2026-08-12" };
vi.mock("@/lib/shift", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/shift")>();
  return { ...actual, getShiftKey: () => shiftKey.value };
});

const { eventSpine } = await import("./event-spine");
const { shiftContextStore, startShiftContext } = await import("./shift-context");

describe("shift rollover", () => {
  beforeEach(() => {
    shiftKey.value = "2026-08-12";
    localStorage.clear();
    eventSpine.clear();
    shiftContextStore.reset();
  });

  it("drops prior-shift events from the spine", () => {
    eventSpine.emit({ type: "ticket.opened", source: "route", ticketId: "t1" });
    expect(eventSpine.recent().map((e) => e.ticketId)).toEqual(["t1"]);

    shiftKey.value = "2026-08-13";
    expect(eventSpine.recent()).toHaveLength(0);

    eventSpine.emit({ type: "ticket.opened", source: "route", ticketId: "t2" });
    expect(eventSpine.recent().map((e) => e.ticketId)).toEqual(["t2"]);
  });

  it("resets the working context on the next shift", () => {
    const stop = startShiftContext();
    eventSpine.emit({ type: "ticket.opened", source: "route", ticketId: "t1", accountId: "4821" });
    expect(shiftContextStore.get().activeTicket?.id).toBe("t1");

    shiftKey.value = "2026-08-13";
    const rolled = shiftContextStore.get();
    expect(rolled.activeTicket).toBeUndefined();
    expect(rolled.activeAccount).toBeUndefined();
    expect(rolled.recentActivity).toHaveLength(0);
    expect(rolled.shiftKey).toBe("2026-08-13");
    stop();
  });
});