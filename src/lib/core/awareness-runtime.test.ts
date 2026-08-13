import { beforeEach, describe, expect, it, vi } from "vitest";
import { eventSpine } from "./event-spine";
import { awarenessStore, recomputeAwareness, startAwareness } from "./awareness-store";
import { setActiveWork, activeWorkStore } from "@/lib/workspace/active-work-store";

/**
 * Runtime wiring: the engine reads live stores, reacts to spine events, and
 * never breaks the workflow that emitted the event.
 */
describe("awareness runtime", () => {
  beforeEach(() => {
    localStorage.clear();
    eventSpine.clear();
    activeWorkStore.set({ current: null, totals: {} });
    awarenessStore.reset();
  });

  it("produces no awareness for an idle operator", () => {
    expect(recomputeAwareness()).toHaveLength(0);
  });

  it("surfaces long-running work from the live active-work store", () => {
    setActiveWork({
      kind: "ticket",
      id: "t1",
      label: "Ticket #12345",
      to: "/freshdesk-tickets/$ticketId/work",
      params: { ticketId: "t1" },
    });
    // Backdate the running segment by 50 minutes.
    activeWorkStore.update((s) =>
      s.current ? { ...s, current: { ...s.current, startedAt: Date.now() - 50 * 60 * 1000 } } : s,
    );
    const items = recomputeAwareness();
    const long = items.find((i) => i.type === "long_running_work");
    expect(long?.severity).toBe("warning");
    expect(long?.entity).toEqual({ type: "ticket", id: "t1" });
  });

  it("recomputes on relevant spine events and stays deduped", () => {
    const stop = startAwareness();
    setActiveWork({
      kind: "ticket",
      id: "t1",
      label: "Ticket #12345",
      to: "/freshdesk-tickets/$ticketId/work",
      params: { ticketId: "t1" },
    });
    activeWorkStore.update((s) =>
      s.current ? { ...s, current: { ...s.current, startedAt: Date.now() - 50 * 60 * 1000 } } : s,
    );
    eventSpine.emit({ type: "ticket.status_changed", source: "tickets-store", ticketId: "t1" });
    eventSpine.emit({ type: "ticket.status_changed", source: "tickets-store", ticketId: "t1" });
    const keys = awarenessStore.get().map((i) => i.dedupeKey);
    expect(keys.filter((k) => k === "long-work:ticket:t1")).toHaveLength(1);
    stop();
  });

  it("dismissing removes the item from the live list", () => {
    setActiveWork({
      kind: "ticket",
      id: "t1",
      label: "Ticket #12345",
      to: "/freshdesk-tickets/$ticketId/work",
      params: { ticketId: "t1" },
    });
    activeWorkStore.update((s) =>
      s.current ? { ...s, current: { ...s.current, startedAt: Date.now() - 50 * 60 * 1000 } } : s,
    );
    recomputeAwareness();
    awarenessStore.dismiss("long-work:ticket:t1");
    expect(awarenessStore.get().some((i) => i.dedupeKey === "long-work:ticket:t1")).toBe(false);
  });

  it("an awareness failure never breaks the emitting workflow", () => {
    const stop = startAwareness();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const boom = eventSpine.subscribe(() => {
      throw new Error("subscriber exploded");
    });
    expect(() =>
      eventSpine.emit({ type: "timer.started", source: "active-work", ticketId: "t1" }),
    ).not.toThrow();
    expect(eventSpine.recent()[0]?.type).toBe("timer.started");
    boom();
    warn.mockRestore();
    stop();
  });
});