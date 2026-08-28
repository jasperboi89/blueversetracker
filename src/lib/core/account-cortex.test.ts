import { describe, it, expect } from "vitest";
import {
  buildAccountWorldModel,
  deriveFactsFromPack,
  toCopilotWorldModel,
  type CortexAccountFacts,
} from "./account-cortex";
import type { AccountLedgerAggregate } from "./event-ledger";

const NOW = Date.parse("2026-08-28T06:00:00.000Z");

function agg(overrides: Partial<AccountLedgerAggregate> = {}): AccountLedgerAggregate {
  return {
    accountId: "7431",
    total: 0,
    countsByType: {},
    last7dCount: 0,
    prev7dCount: 0,
    last30dCount: 0,
    activeDays30d: 0,
    touchedTickets: 0,
    generatedAt: new Date(NOW).toISOString(),
    ...overrides,
  };
}

const emptyFacts: CortexAccountFacts = {
  activeTickets: 0,
  verifiedResolutions: 0,
  recurringActive: false,
  recurring30d: 0,
  warnings: 0,
};

describe("deriveFactsFromPack", () => {
  it("counts active tickets, verified active resolutions, and recurring pressure", () => {
    const facts = deriveFactsFromPack({
      recentTickets: [{ status: "working" }, { status: "completed" }, { status: "waiting-cs" }],
      resolutions: [
        { confidence: "verified", status: "active" },
        { confidence: "verified", status: "archived" },
        { confidence: "probable", status: "active" },
      ],
      recurringPatterns: [{ active: true, count30d: 5 }],
      warnings: [1, 2],
    });
    expect(facts.activeTickets).toBe(2);
    expect(facts.verifiedResolutions).toBe(1);
    expect(facts.recurringActive).toBe(true);
    expect(facts.recurring30d).toBe(5);
    expect(facts.warnings).toBe(2);
  });

  it("tolerates a partial/empty pack", () => {
    expect(deriveFactsFromPack({})).toEqual(emptyFacts);
  });
});

describe("buildAccountWorldModel", () => {
  it("flags a rising activity trend as a warning", () => {
    const model = buildAccountWorldModel({
      accountId: "7431",
      now: NOW,
      aggregate: agg({
        total: 10,
        last7dCount: 6,
        prev7dCount: 2,
        lastAt: new Date(NOW - 3600_000).toISOString(),
      }),
      facts: emptyFacts,
    });
    const trend = model.signals.find((s) => s.kind === "activity_trend");
    expect(trend?.severity).toBe("warning");
    expect(model.freshness).toBe("fresh");
  });

  it("emits a cold_account signal when there is no ledger history", () => {
    const model = buildAccountWorldModel({
      accountId: "0000",
      now: NOW,
      aggregate: agg(),
      facts: emptyFacts,
    });
    expect(model.signals.some((s) => s.kind === "cold_account")).toBe(true);
    expect(model.eventCount).toBe(0);
    expect(model.freshness).toBe("unknown");
  });

  it("orders signals critical → warning → info", () => {
    const model = buildAccountWorldModel({
      accountId: "7431",
      now: NOW,
      aggregate: agg({
        total: 8,
        last7dCount: 5,
        prev7dCount: 1,
        lastAt: new Date(NOW - 3600_000).toISOString(),
      }),
      facts: {
        ...emptyFacts,
        recurringActive: true,
        recurring30d: 4,
        activeTickets: 1,
        verifiedResolutions: 2,
      },
    });
    const sevs = model.signals.map((s) => s.severity);
    const rank = { critical: 0, warning: 1, info: 2 } as const;
    for (let i = 1; i < sevs.length; i++) {
      expect(rank[sevs[i]!]).toBeGreaterThanOrEqual(rank[sevs[i - 1]!]);
    }
  });

  it("is deterministic for identical inputs", () => {
    const input = {
      accountId: "7431",
      now: NOW,
      aggregate: agg({
        total: 5,
        last7dCount: 2,
        prev7dCount: 2,
        lastAt: new Date(NOW - DAYS(5)).toISOString(),
      }),
      facts: emptyFacts,
    };
    expect(buildAccountWorldModel(input)).toEqual(buildAccountWorldModel(input));
  });
});

describe("toCopilotWorldModel", () => {
  it("projects bounded, provenance-tagged lines and stays within the char cap", () => {
    const model = buildAccountWorldModel({
      accountId: "7431",
      now: NOW,
      aggregate: agg({
        total: 9,
        last7dCount: 5,
        prev7dCount: 1,
        lastAt: new Date(NOW - 3600_000).toISOString(),
      }),
      facts: { ...emptyFacts, recurringActive: true, activeTickets: 3 },
    });
    const text = toCopilotWorldModel(model);
    expect(text).toContain("ACCOUNT WORLD MODEL");
    expect(text).toContain("· ledger");
    expect(text.length).toBeLessThanOrEqual(720);
  });
});

function DAYS(n: number): number {
  return n * 24 * 60 * 60 * 1000;
}
