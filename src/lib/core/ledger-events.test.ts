import { describe, it, expect } from "vitest";
import { isDurableEvent, ledgerCategory, ledgerSensitivity, selectDurable } from "./ledger-events";
import type { AccEvent } from "./events";

function ev(type: AccEvent["type"], id: string = type): AccEvent {
  return { id, type, timestamp: "2026-08-28T00:00:00.000Z", source: "system" };
}

describe("durable event allowlist", () => {
  it("persists meaningful lifecycle events", () => {
    expect(isDurableEvent("ticket.completed")).toBe(true);
    expect(isDurableEvent("work.completed")).toBe(true);
    expect(isDurableEvent("change.verified")).toBe(true);
    expect(isDurableEvent("resolution.created")).toBe(true);
    expect(isDurableEvent("capability.completed")).toBe(true);
    expect(isDurableEvent("intelligence.feedback_recorded")).toBe(true);
  });

  it("drops noisy view/navigation/timer telemetry", () => {
    expect(isDurableEvent("ticket.opened")).toBe(false);
    expect(isDurableEvent("work.opened")).toBe(false);
    expect(isDurableEvent("work.paused")).toBe(false);
    expect(isDurableEvent("timer.started")).toBe(false);
    expect(isDurableEvent("night_plan.item_added")).toBe(false);
    expect(isDurableEvent("account.opened")).toBe(false);
  });

  it("classifies category and sensitivity", () => {
    expect(ledgerCategory("change.applied")).toBe("programming");
    expect(ledgerCategory("ticket.completed")).toBe("ticket");
    expect(ledgerCategory("capability.failed")).toBe("ai");
    expect(ledgerSensitivity("knowledge.created")).toBe("reference");
    expect(ledgerSensitivity("ticket.completed")).toBe("operational");
  });

  it("selectDurable keeps only allowlisted events in order", () => {
    const events = [
      ev("ticket.opened", "a"),
      ev("ticket.completed", "b"),
      ev("timer.started", "c"),
      ev("resolution.created", "d"),
    ];
    expect(selectDurable(events).map((e) => e.id)).toEqual(["b", "d"]);
  });
});
