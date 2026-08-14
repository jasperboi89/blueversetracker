import { describe, expect, it } from "vitest";
import { buildShiftLedger, durationFor, formatDuration } from "./shift-ledger";

const log = [
  { id: "1", workId: "t1", durationMs: 20 * 60_000 },
  { id: "2", workId: "t1", durationMs: 14 * 60_000 },
  { id: "3", workId: "d1", durationMs: 5_000 },
] as never as Parameters<typeof buildShiftLedger>[0]["log"];

describe("shift ledger", () => {
  it("sums logged time per record", () => {
    expect(durationFor(log, "t1")).toBe(34 * 60_000);
    expect(durationFor(log, "nope")).toBeUndefined();
  });

  it("formats durations and hides sub-minute noise", () => {
    expect(formatDuration(34 * 60_000)).toBe("34 min");
    expect(formatDuration(95 * 60_000)).toBe("1h 35m");
    expect(formatDuration(5_000)).toBeUndefined();
  });

  it("derives entries from completed records only, newest first", () => {
    const entries = buildShiftLedger({
      log,
      tickets: [
        {
          id: "t1",
          number: "12345",
          accountNumber: "4221",
          accountName: "Acme",
          status: "completed",
          completedAt: 1_000,
          details: { subject: "Updated dispatch logic" },
        },
        { id: "t2", number: "999", status: "active", details: { subject: "open" } },
      ] as never,
      sessions: [
        {
          id: "d1",
          accountNumber: "8192",
          accountName: "Beta",
          status: "ready",
          completedAt: 2_000,
          updatedAt: 2_000,
        },
      ] as never,
      items: [] as never,
    });
    expect(entries.map((e) => e.id)).toEqual(["ds-d1", "fd-t1"]);
    expect(entries[1].durationMs).toBe(34 * 60_000);
    expect(entries[0].to).toBe("/contact-dispatch/$sessionId/work");
    expect(entries[0].result).toBe("Ready for activation");
  });
});
