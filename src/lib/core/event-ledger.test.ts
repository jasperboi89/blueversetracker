import { describe, it, expect } from "vitest";
import {
  aggregateAccount,
  compareEntries,
  mergeLedgers,
  queryLedger,
  rotate,
  type LedgerEntry,
  type LedgerState,
} from "./event-ledger";
import type { AccEventType } from "./events";

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.parse("2026-08-28T06:00:00.000Z");

function entry(seq: number, overrides: Partial<LedgerEntry> = {}): LedgerEntry {
  return {
    id: overrides.id ?? `e${seq}`,
    type: (overrides.type ?? "ticket.opened") as AccEventType,
    timestamp: overrides.timestamp ?? new Date(NOW - seq * DAY).toISOString(),
    source: overrides.source ?? "system",
    seq,
    ...overrides,
  };
}

describe("rotate", () => {
  it("orders newest-first and caps to maxEntries", () => {
    const es = [entry(1), entry(3), entry(2)];
    const out = rotate(es, NOW, 2);
    expect(out.map((e) => e.seq)).toEqual([1, 2]); // seq1 = today, seq2 = yesterday
  });

  it("drops entries older than the age window", () => {
    const es = [
      entry(1, { timestamp: new Date(NOW - 2 * DAY).toISOString() }),
      entry(2, { timestamp: new Date(NOW - 100 * DAY).toISOString() }),
    ];
    const out = rotate(es, NOW, 100, 60);
    expect(out.map((e) => e.id)).toEqual(["e1"]);
  });

  it("keeps entries with an unparseable timestamp", () => {
    const es = [entry(1, { timestamp: "not-a-date" })];
    expect(rotate(es, NOW).map((e) => e.id)).toEqual(["e1"]);
  });
});

describe("compareEntries", () => {
  it("breaks timestamp ties by seq desc", () => {
    const ts = new Date(NOW).toISOString();
    const a = entry(5, { timestamp: ts });
    const b = entry(9, { timestamp: ts });
    expect([a, b].sort(compareEntries).map((e) => e.seq)).toEqual([9, 5]);
  });
});

describe("mergeLedgers", () => {
  it("unions by id and never overwrites local history", () => {
    const local: LedgerState = {
      entries: [entry(1, { id: "a" }), entry(2, { id: "b" })],
      nextSeq: 3,
    };
    const incoming: LedgerState = {
      entries: [entry(1, { id: "b" }), entry(2, { id: "c" })],
      nextSeq: 5,
    };
    const merged = mergeLedgers(local, incoming, NOW);
    expect(new Set(merged.entries.map((e) => e.id))).toEqual(new Set(["a", "b", "c"]));
    expect(merged.nextSeq).toBeGreaterThanOrEqual(5);
  });

  it("is idempotent when merging a ledger with itself", () => {
    const s: LedgerState = { entries: [entry(1, { id: "a" }), entry(2, { id: "b" })], nextSeq: 3 };
    const merged = mergeLedgers(s, s, NOW);
    expect(merged.entries.map((e) => e.id).sort()).toEqual(["a", "b"]);
  });
});

describe("queryLedger", () => {
  const state: LedgerState = {
    entries: [
      entry(1, { id: "a", accountId: "7431", type: "ticket.opened", ticketId: "t1" }),
      entry(2, { id: "b", accountId: "7431", type: "work.completed", ticketId: "t1" }),
      entry(3, { id: "c", accountId: "9000", type: "ticket.opened", ticketId: "t9" }),
    ],
    nextSeq: 4,
  };

  it("filters by account", () => {
    expect(queryLedger({ accountId: "7431" }, state).map((e) => e.id)).toEqual(["a", "b"]);
  });

  it("filters by type set", () => {
    expect(queryLedger({ types: ["work.completed"] }, state).map((e) => e.id)).toEqual(["b"]);
  });

  it("respects the limit", () => {
    expect(queryLedger({ accountId: "7431", limit: 1 }, state)).toHaveLength(1);
  });
});

describe("aggregateAccount", () => {
  it("rolls up counts, windows, active days and touched tickets", () => {
    const entries: LedgerEntry[] = [
      entry(1, {
        accountId: "7431",
        type: "ticket.opened",
        ticketId: "t1",
        timestamp: new Date(NOW - 1 * DAY).toISOString(),
      }),
      entry(2, {
        accountId: "7431",
        type: "work.completed",
        ticketId: "t1",
        timestamp: new Date(NOW - 2 * DAY).toISOString(),
      }),
      entry(3, {
        accountId: "7431",
        type: "ticket.opened",
        ticketId: "t2",
        timestamp: new Date(NOW - 10 * DAY).toISOString(),
      }),
      entry(4, {
        accountId: "9999",
        type: "ticket.opened",
        ticketId: "z9",
        timestamp: new Date(NOW - 1 * DAY).toISOString(),
      }),
    ];
    const agg = aggregateAccount(entries, "7431", NOW);
    expect(agg.total).toBe(3);
    expect(agg.last7dCount).toBe(2);
    expect(agg.prev7dCount).toBe(1);
    expect(agg.last30dCount).toBe(3);
    expect(agg.touchedTickets).toBe(2);
    expect(agg.activeDays30d).toBe(3);
    expect(agg.countsByType["ticket.opened"]).toBe(2);
    expect(agg.countsByType["work.completed"]).toBe(1);
  });

  it("returns an empty-but-valid aggregate when the account has no events", () => {
    const agg = aggregateAccount([], "0000", NOW);
    expect(agg.total).toBe(0);
    expect(agg.firstAt).toBeUndefined();
    expect(agg.touchedTickets).toBe(0);
  });
});
