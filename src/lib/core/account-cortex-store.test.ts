import { describe, it, expect } from "vitest";
import { reconcileObservations, type AccountCortexRecord } from "./account-cortex-store";
import type { PatternObservation } from "./pattern-intelligence";

const NOW = Date.parse("2026-08-28T06:00:00.000Z");

function obs(id: string, over: Partial<PatternObservation> = {}): PatternObservation {
  return {
    id,
    schemaVersion: 1,
    patternType: "repeated_issue",
    accountId: "7431",
    title: "t",
    description: "d",
    windowDays: 90,
    supportingEventIds: [],
    sourceCount: 3,
    evidenceRefs: [{ type: "ticket", id: "x" }],
    confidence: "supported",
    firstObservedAt: new Date(NOW - 10 * 864e5).toISOString(),
    lastObservedAt: new Date(NOW).toISOString(),
    severity: "notice",
    recalcAfterMs: 1000,
    generatedAt: new Date(NOW).toISOString(),
    ...over,
  };
}

describe("reconcileObservations", () => {
  it("records fresh observations as active with evidence ids", () => {
    const rec = reconcileObservations(undefined, [obs("a")], "7431", NOW);
    expect(rec.observations).toHaveLength(1);
    expect(rec.observations[0]!.status).toBe("active");
    expect(rec.observations[0]!.evidenceIds).toEqual(["ticket:x"]);
    expect(rec.calcVersion).toBe(1);
  });

  it("keeps first-seen/recorded timestamps for observations that keep firing", () => {
    const first = reconcileObservations(undefined, [obs("a")], "7431", NOW - 5 * 864e5);
    const again = reconcileObservations(first, [obs("a")], "7431", NOW);
    expect(again.observations[0]!.recordedAt).toBe(first.observations[0]!.recordedAt);
    expect(again.observations[0]!.firstObservedAt).toBe(first.observations[0]!.firstObservedAt);
  });

  it("moves observations that stopped firing into history as resolved", () => {
    const prev: AccountCortexRecord = reconcileObservations(
      undefined,
      [obs("a"), obs("b")],
      "7431",
      NOW - 864e5,
    );
    const next = reconcileObservations(prev, [obs("a")], "7431", NOW);
    expect(next.observations.map((o) => o.id)).toEqual(["a"]);
    expect(next.history[0]).toEqual({
      id: "b",
      status: "resolved",
      at: new Date(NOW).toISOString(),
    });
  });

  it("is deterministic", () => {
    const prev = reconcileObservations(undefined, [obs("a")], "7431", NOW - 864e5);
    expect(reconcileObservations(prev, [obs("a")], "7431", NOW)).toEqual(
      reconcileObservations(prev, [obs("a")], "7431", NOW),
    );
  });
});
