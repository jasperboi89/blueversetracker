import { describe, it, expect } from "vitest";
import { buildRadar, MAX_RADAR_ITEMS, type RadarInput } from "./operational-radar";
import type { PatternObservation } from "./pattern-intelligence";

const NOW = Date.parse("2026-08-28T06:00:00.000Z");

function obs(over: Partial<PatternObservation> = {}): PatternObservation {
  return {
    id: over.id ?? "pat:repeated_issue:7431:x",
    schemaVersion: 1,
    patternType: over.patternType ?? "repeated_issue",
    accountId: over.accountId ?? "7431",
    title: over.title ?? "Recurring issue",
    description: "desc",
    windowDays: 90,
    supportingEventIds: [],
    sourceCount: over.sourceCount ?? 4,
    evidenceRefs: over.evidenceRefs ?? [{ type: "ticket", id: "t1" }],
    confidence: over.confidence ?? "supported",
    firstObservedAt: new Date(NOW - 10 * 864e5).toISOString(),
    lastObservedAt: new Date(NOW).toISOString(),
    severity: over.severity ?? "notice",
    recalcAfterMs: 1000,
    generatedAt: new Date(NOW).toISOString(),
    ...over,
  };
}

function input(over: Partial<RadarInput> = {}): RadarInput {
  return { now: NOW, observations: [], ...over };
}

describe("buildRadar", () => {
  it("maps observations to radar categories", () => {
    const items = buildRadar(
      input({
        observations: [
          obs({ id: "a", patternType: "repeated_issue" }),
          obs({ id: "b", patternType: "change_incident_proximity", confidence: "inferred" }),
          obs({
            id: "c",
            patternType: "resolution_reuse",
            confidence: "verified",
            severity: "info",
          }),
        ],
      }),
    );
    const cats = items.map((i) => i.category);
    expect(cats).toContain("recurring");
    expect(cats).toContain("change_followup");
    expect(cats).toContain("resolution_match");
  });

  it("ranks elevated severity first, then confidence", () => {
    const items = buildRadar(
      input({
        observations: [
          obs({ id: "low", severity: "info", confidence: "supported" }),
          obs({ id: "high", severity: "elevated", confidence: "verified" }),
        ],
      }),
    );
    expect(items[0]!.observationId).toBe("high");
  });

  it("folds in workload and system signals", () => {
    const items = buildRadar(
      input({
        workload: [{ accountId: "5422", activeWork: 6, blockingWork: 2 }],
        system: [{ id: "fd", title: "Indexing degraded", detail: "d", severity: "elevated" }],
      }),
    );
    expect(items.some((i) => i.category === "workload")).toBe(true);
    expect(items.some((i) => i.category === "system")).toBe(true);
  });

  it("suppresses low workload (no blocking, few active)", () => {
    const items = buildRadar(
      input({ workload: [{ accountId: "1", activeWork: 1, blockingWork: 0 }] }),
    );
    expect(items).toHaveLength(0);
  });

  it("suppresses acknowledged items and stays within the cap", () => {
    const observations = Array.from({ length: 10 }, (_, i) => obs({ id: `o${i}` }));
    const acknowledged = new Set(["radar:o0"]);
    const items = buildRadar(input({ observations, acknowledged }));
    expect(items.length).toBeLessThanOrEqual(MAX_RADAR_ITEMS);
    expect(items.some((i) => i.id === "radar:o0")).toBe(false);
  });

  it("returns [] (calm empty state) when there is nothing meaningful", () => {
    expect(buildRadar(input())).toEqual([]);
  });
});
