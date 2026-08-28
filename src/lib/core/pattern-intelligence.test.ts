import { describe, it, expect } from "vitest";
import {
  detectPatterns,
  FORBIDDEN_PATTERN_PHRASES,
  PATTERN_CONFIG,
  type PatternInput,
} from "./pattern-intelligence";

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.parse("2026-08-28T06:00:00.000Z");

function input(overrides: Partial<PatternInput> = {}): PatternInput {
  return {
    accountId: "7431",
    now: NOW,
    ledger: [],
    tickets: [],
    changes: [],
    work: [],
    resolutions: [],
    ...overrides,
  };
}

function ticket(id: string, over: Partial<PatternInput["tickets"][number]> = {}) {
  return { id, status: "completed", createdAtMs: NOW - 5 * DAY, ...over };
}

describe("detectPatterns — repeated issue", () => {
  it("flags 3+ same-classification tickets in the window as SUPPORTED", () => {
    const tickets = [
      ticket("t1", { classification: "cancellation-routing", createdAtMs: NOW - 2 * DAY }),
      ticket("t2", { classification: "cancellation-routing", createdAtMs: NOW - 20 * DAY }),
      ticket("t3", { classification: "cancellation-routing", createdAtMs: NOW - 60 * DAY }),
    ];
    const obs = detectPatterns(input({ tickets })).filter(
      (o) => o.patternType === "repeated_issue",
    );
    expect(obs).toHaveLength(1);
    expect(obs[0]!.confidence).toBe("supported");
    expect(obs[0]!.sourceCount).toBe(3);
    expect(obs[0]!.evidenceRefs.map((r) => r.id)).toEqual(["t1", "t2", "t3"]);
  });

  it("does not flag below the minimum threshold", () => {
    const tickets = [
      ticket("t1", { classification: "billing" }),
      ticket("t2", { classification: "billing" }),
    ];
    expect(detectPatterns(input({ tickets })).some((o) => o.patternType === "repeated_issue")).toBe(
      false,
    );
  });

  it("ignores tickets outside the window", () => {
    const tickets = [
      ticket("t1", { classification: "x", createdAtMs: NOW - 2 * DAY }),
      ticket("t2", { classification: "x", createdAtMs: NOW - 2 * DAY }),
      ticket("t3", { classification: "x", createdAtMs: NOW - 200 * DAY }),
    ];
    expect(detectPatterns(input({ tickets })).some((o) => o.patternType === "repeated_issue")).toBe(
      false,
    );
  });
});

describe("detectPatterns — change/incident proximity", () => {
  it("reports temporal association as INFERRED, never causation", () => {
    const changes = [{ id: "c1", title: "routing tweak", appliedAtMs: NOW - 2 * DAY }];
    const tickets = [ticket("t1", { classification: "outage", createdAtMs: NOW - 1 * DAY })];
    const obs = detectPatterns(input({ changes, tickets })).filter(
      (o) => o.patternType === "change_incident_proximity",
    );
    expect(obs).toHaveLength(1);
    expect(obs[0]!.confidence).toBe("inferred");
    const text = `${obs[0]!.title} ${obs[0]!.description}`.toLowerCase();
    expect(text).toContain("temporal association");
    expect(text).toContain("does not establish that the change caused");
  });

  it("does not fire when incidents precede the change", () => {
    const changes = [{ id: "c1", appliedAtMs: NOW - 1 * DAY }];
    const tickets = [ticket("t1", { createdAtMs: NOW - 10 * DAY })];
    expect(
      detectPatterns(input({ changes, tickets })).some(
        (o) => o.patternType === "change_incident_proximity",
      ),
    ).toBe(false);
  });
});

describe("detectPatterns — escalation, reopen, resolution reuse", () => {
  it("flags repeated escalations", () => {
    const tickets = [
      ticket("t1", { escalated: true, updatedAtMs: NOW - 1 * DAY }),
      ticket("t2", { escalated: true, updatedAtMs: NOW - 3 * DAY }),
    ];
    expect(detectPatterns(input({ tickets })).some((o) => o.patternType === "escalation")).toBe(
      true,
    );
  });

  it("flags repeated reopens", () => {
    const tickets = [
      ticket("t1", { reopened: true, updatedAtMs: NOW - 1 * DAY }),
      ticket("t2", { reopened: true, updatedAtMs: NOW - 3 * DAY }),
    ];
    expect(detectPatterns(input({ tickets })).some((o) => o.patternType === "reopen")).toBe(true);
  });

  it("marks a verified reused resolution as VERIFIED", () => {
    const resolutions = [
      {
        id: "r1",
        confidence: "verified",
        reuseCount: 3,
        affectedArea: "routing",
        lastUsedAtMs: NOW - 5 * DAY,
      },
    ];
    const obs = detectPatterns(input({ resolutions })).filter(
      (o) => o.patternType === "resolution_reuse",
    );
    expect(obs).toHaveLength(1);
    expect(obs[0]!.confidence).toBe("verified");
  });
});

describe("LANGUAGE CONTRACT — temporal association is never labelled causation", () => {
  it("no observation ever uses forbidden causal phrasing", () => {
    // A rich input that fires every detector.
    const now = NOW;
    const tickets = [
      ticket("t1", {
        classification: "cancellation",
        createdAtMs: now - 1 * DAY,
        escalated: true,
        reopened: true,
        updatedAtMs: now - 1 * DAY,
      }),
      ticket("t2", {
        classification: "cancellation",
        createdAtMs: now - 2 * DAY,
        escalated: true,
        reopened: true,
        updatedAtMs: now - 2 * DAY,
      }),
      ticket("t3", { classification: "cancellation", createdAtMs: now - 3 * DAY }),
    ];
    const changes = [{ id: "c1", title: "config change", appliedAtMs: now - 4 * DAY }];
    const work = [
      { id: "w1", kind: "programming", atMs: now - 1 * DAY },
      { id: "w2", kind: "programming", atMs: now - 2 * DAY },
      { id: "w3", kind: "programming", atMs: now - 3 * DAY },
    ];
    const resolutions = [
      { id: "r1", confidence: "verified", reuseCount: 4, lastUsedAtMs: now - 1 * DAY },
    ];
    const obs = detectPatterns(input({ tickets, changes, work, resolutions }));
    expect(obs.length).toBeGreaterThan(0);
    for (const o of obs) {
      const text = `${o.title} ${o.description}`.toLowerCase();
      for (const phrase of FORBIDDEN_PATTERN_PHRASES) {
        expect(text.includes(phrase)).toBe(false);
      }
    }
  });
});

describe("determinism & config", () => {
  it("is deterministic for identical input", () => {
    const tickets = [
      ticket("t1", { classification: "x", createdAtMs: NOW - 1 * DAY }),
      ticket("t2", { classification: "x", createdAtMs: NOW - 2 * DAY }),
      ticket("t3", { classification: "x", createdAtMs: NOW - 3 * DAY }),
    ];
    expect(detectPatterns(input({ tickets }))).toEqual(detectPatterns(input({ tickets })));
  });

  it("respects the minimum-evidence thresholds", () => {
    expect(PATTERN_CONFIG.repeatedIssueMin).toBeGreaterThanOrEqual(3);
    expect(PATTERN_CONFIG.escalationMin).toBeGreaterThanOrEqual(2);
  });
});
