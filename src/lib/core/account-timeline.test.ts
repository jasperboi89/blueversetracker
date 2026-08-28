import { describe, it, expect } from "vitest";
import { buildAccountTimeline, filterTimeline, type TimelineInput } from "./account-timeline";

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.parse("2026-08-28T06:00:00.000Z");

function input(over: Partial<TimelineInput> = {}): TimelineInput {
  return {
    accountId: "7431",
    tickets: [],
    changes: [],
    resolutions: [],
    work: [],
    ledger: [],
    ...over,
  };
}

describe("buildAccountTimeline", () => {
  it("merges canonical sources newest-first with provenance and evidence", () => {
    const items = buildAccountTimeline(
      input({
        tickets: [
          { id: "t1", number: "100", status: "completed", subject: "x", atMs: NOW - 1 * DAY },
        ],
        changes: [{ id: "c1", title: "cfg", atMs: NOW - 3 * DAY }],
        resolutions: [{ id: "r1", problem: "p", confidence: "verified", atMs: NOW - 2 * DAY }],
      }),
    );
    expect(items.map((i) => i.category)).toEqual(["ticket", "resolution", "programming"]);
    expect(items.every((i) => i.provenance === "canonical")).toBe(true);
    expect(items[0]!.evidence).toEqual([{ type: "ticket", id: "t1" }]);
    expect(items[0]!.link).toEqual({
      to: "/freshdesk-tickets/$ticketId/work",
      params: { ticketId: "t1" },
    });
  });

  it("surfaces only ledger-only categories (ai/intelligence), never double-counting", () => {
    const items = buildAccountTimeline(
      input({
        tickets: [{ id: "t1", status: "completed", atMs: NOW - 1 * DAY }],
        ledger: [
          { id: "e1", type: "ticket.completed", category: "ticket", atMs: NOW - 1 * DAY }, // dropped (canonical covers it)
          {
            id: "e2",
            type: "capability.completed",
            category: "ai",
            atMs: NOW - 2 * DAY,
            label: "AI action",
          },
          {
            id: "e3",
            type: "intelligence.feedback_recorded",
            category: "intelligence",
            atMs: NOW - 3 * DAY,
          },
        ],
      }),
    );
    const ledgerItems = items.filter((i) => i.provenance === "ledger");
    expect(ledgerItems.map((i) => i.eventId)).toEqual(["e2", "e3"]);
  });

  it("filters by category", () => {
    const items = buildAccountTimeline(
      input({
        tickets: [{ id: "t1", status: "completed", atMs: NOW - 1 * DAY }],
        work: [{ id: "w1", label: "job", atMs: NOW - 2 * DAY }],
      }),
    );
    expect(filterTimeline(items, "work").map((i) => i.id)).toEqual(["tl:work:w1"]);
    expect(filterTimeline(items, "all")).toHaveLength(2);
  });

  it("returns empty for an account with no history", () => {
    expect(buildAccountTimeline(input())).toEqual([]);
  });
});
