import { beforeEach, describe, expect, it, vi } from "vitest";
import { eventSpine } from "./event-spine";
import type { AccEvent } from "./events";

function reset() {
  localStorage.clear();
  eventSpine.clear();
}

describe("event spine", () => {
  beforeEach(reset);

  it("delivers emitted events to subscribers", () => {
    const seen: AccEvent[] = [];
    const off = eventSpine.subscribe((e) => seen.push(e));
    eventSpine.emit({ type: "ticket.opened", source: "route", ticketId: "t1" });
    off();
    expect(seen).toHaveLength(1);
    expect(seen[0]!.ticketId).toBe("t1");
    expect(seen[0]!.id).toBeTruthy();
    expect(seen[0]!.timestamp).toBeTruthy();
  });

  it("respects subscription filters", () => {
    const byType: AccEvent[] = [];
    const byTicket: AccEvent[] = [];
    const a = eventSpine.subscribe((e) => byType.push(e), { types: ["ticket.completed"] });
    const b = eventSpine.subscribe((e) => byTicket.push(e), { ticketId: "t2" });
    eventSpine.emit({ type: "ticket.opened", source: "route", ticketId: "t1" });
    eventSpine.emit({ type: "ticket.completed", source: "tickets-store", ticketId: "t2" });
    a();
    b();
    expect(byType.map((e) => e.type)).toEqual(["ticket.completed"]);
    expect(byTicket.map((e) => e.ticketId)).toEqual(["t2"]);
  });

  it("keeps emitting when a subscriber throws", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const seen: AccEvent[] = [];
    const bad = eventSpine.subscribe(() => {
      throw new Error("boom");
    });
    const good = eventSpine.subscribe((e) => seen.push(e));
    expect(() =>
      eventSpine.emit({ type: "work.opened", source: "route", workItemId: "w1" }),
    ).not.toThrow();
    bad();
    good();
    expect(seen).toHaveLength(1);
    expect(eventSpine.recent()).toHaveLength(1);
  });

  it("unsubscribes every registration for a handler", () => {
    const seen: AccEvent[] = [];
    const fn = (e: AccEvent) => seen.push(e);
    eventSpine.subscribe(fn);
    eventSpine.subscribe(fn, { types: ["ticket.opened"] });
    eventSpine.unsubscribe(fn);
    eventSpine.emit({ type: "ticket.opened", source: "route", ticketId: "t1" });
    expect(seen).toHaveLength(0);
  });

  it("caps the recent buffer", () => {
    for (let i = 0; i < 340; i++) {
      eventSpine.emit({ type: "ticket.opened", source: "route", ticketId: `t${i}` });
    }
    expect(eventSpine.getState().events.length).toBe(300);
    expect(eventSpine.recent(1000).length).toBe(300);
    // newest first
    expect(eventSpine.recent(1)[0]!.ticketId).toBe("t339");
  });

  it("drops prior-shift events on rollover", () => {
    eventSpine.emit({ type: "ticket.opened", source: "route", ticketId: "t1" });
    const state = eventSpine.getState();
    localStorage.setItem(
      "aih:core:eventspine:v1",
      JSON.stringify({ ...state, shiftKey: "1999-01-01" }),
    );
    window.dispatchEvent(new Event("storage"));
    eventSpine.emit({ type: "ticket.opened", source: "route", ticketId: "t2" });
    const events = eventSpine.recent(100);
    expect(events.map((e) => e.ticketId)).toEqual(["t2"]);
  });

  it("strips non-allowlisted and oversized metadata", () => {
    const e = eventSpine.emit({
      type: "ticket.pulled",
      source: "tickets-store",
      ticketId: "t1",
      metadata: {
        label: "Ticket #123",
        durationMs: 4200,
        subject: "Patient John Doe callback",
        description: "full conversation text",
        notes: "caller phone 555-1234",
        prompt: "system prompt",
        accountName: "x".repeat(400),
      },
    });
    expect(Object.keys(e.metadata ?? {}).sort()).toEqual([
      "accountName",
      "durationMs",
      "label",
    ]);
    expect(String(e.metadata?.accountName).length).toBeLessThanOrEqual(121);
  });
});