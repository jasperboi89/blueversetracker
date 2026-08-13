import { beforeEach, describe, expect, it } from "vitest";
import {
  AWARENESS_THRESHOLDS as T,
  dismissAwareness,
  evaluateAwareness,
  mergeAwareness,
  EMPTY_AWARENESS_STATE,
  type AwarenessSnapshot,
  type AwarenessState,
} from "./awareness";

const NOW = Date.parse("2026-08-13T04:00:00.000Z");
const SHIFT = "2026-08-12";

function snap(over: Partial<AwarenessSnapshot> = {}): AwarenessSnapshot {
  return {
    now: NOW,
    shiftKey: SHIFT,
    shiftStatus: "active",
    shiftProgress: 0.4,
    activeWork: null,
    contextWorkItem: undefined,
    contextTicketId: undefined,
    tickets: [],
    mustItemsRemaining: 0,
    recurringAccounts: [],
    ...over,
  };
}

function trackedWork(over: Partial<AwarenessSnapshot["activeWork"] & object> = {}) {
  return {
    kind: "ticket" as const,
    id: "t1",
    label: "Ticket #12345",
    running: true,
    elapsedMs: 48 * 60 * 1000,
    to: "/freshdesk-tickets/$ticketId/work",
    params: { ticketId: "t1" },
    ...over,
  };
}

function ctxFor(id: string) {
  return { id, startedAt: new Date(NOW - 60_000).toISOString() };
}

function types(s: AwarenessSnapshot) {
  return evaluateAwareness(s).map((c) => c.type);
}

describe("awareness rules", () => {
  it("flags long tracked work with escalating severity", () => {
    const base = { contextWorkItem: ctxFor("t1") };
    const at = (ms: number) =>
      evaluateAwareness(snap({ ...base, activeWork: trackedWork({ elapsedMs: ms }) })).find(
        (c) => c.type === "long_running_work",
      );

    expect(at(10 * 60 * 1000)).toBeUndefined();
    expect(at(T.longWorkInfoMs + 1)?.severity).toBe("info");
    const warn = at(48 * 60 * 1000);
    expect(warn?.severity).toBe("warning");
    expect(warn?.message).toBe("Ticket #12345 has been active for 48m.");
    expect(warn?.dedupeKey).toBe("long-work:ticket:t1");
    expect(at(T.longWorkCriticalMs + 1)?.severity).toBe("critical");
  });

  it("does not flag long work from a view-only open (no tracked time)", () => {
    // work.opened puts the item in context without a startedAt and banks no time.
    const s = snap({
      activeWork: { ...trackedWork(), running: false, elapsedMs: 0 },
      contextWorkItem: { id: "t1" },
    });
    expect(types(s)).not.toContain("long_running_work");
    expect(types(s)).not.toContain("work_without_timer");
  });

  it("detects a stale waiting ticket", () => {
    const s = snap({
      tickets: [
        {
          id: "t9",
          number: "12114",
          status: "waiting-cs",
          updatedAt: NOW - (T.staleWaitingMs + 3 * 60 * 60 * 1000 + 12 * 60 * 1000),
          accountNumber: "4821",
        },
        {
          id: "t8",
          number: "12115",
          status: "waiting-prog",
          updatedAt: NOW - 60_000,
          accountNumber: "4821",
        },
      ],
    });
    const stale = evaluateAwareness(s).filter((c) => c.type === "stale_waiting_ticket");
    expect(stale).toHaveLength(1);
    expect(stale[0].dedupeKey).toBe("stale-waiting:ticket:t9");
    expect(stale[0].message).toContain("Ticket #12114 has been waiting for");
  });

  it("warns about Must items only near shift end", () => {
    const near = snap({ shiftStatus: "near-end", shiftProgress: 0.95, mustItemsRemaining: 2 });
    const item = evaluateAwareness(near).find((c) => c.type === "must_items_remaining");
    expect(item?.message).toBe("2 Must items remain before shift end.");
    expect(item?.dedupeKey).toBe(`must-items:shift:${SHIFT}`);

    const early = snap({ shiftStatus: "active", shiftProgress: 0.2, mustItemsRemaining: 2 });
    expect(types(early)).not.toContain("must_items_remaining");
  });

  it("detects tracked work whose timer is not running", () => {
    const s = snap({
      activeWork: trackedWork({ running: false, elapsedMs: 15 * 60 * 1000 }),
      contextWorkItem: ctxFor("t1"),
    });
    const item = evaluateAwareness(s).find((c) => c.type === "work_without_timer");
    expect(item?.severity).toBe("info");
    expect(item?.dedupeKey).toBe("work-no-timer:ticket:t1");
  });

  it("detects a running timer with no matching tracked work in context", () => {
    const mismatch = snap({ activeWork: trackedWork(), contextWorkItem: undefined });
    const item = evaluateAwareness(mismatch).find((c) => c.type === "timer_without_work");
    expect(item?.severity).toBe("warning");

    const consistent = snap({ activeWork: trackedWork(), contextWorkItem: ctxFor("t1") });
    expect(types(consistent)).not.toContain("timer_without_work");

    // Freshly started timers are inside the grace window.
    const fresh = snap({ activeWork: trackedWork({ elapsedMs: 5_000 }) });
    expect(types(fresh)).not.toContain("timer_without_work");
  });

  it("surfaces recurring account activity for the active ticket", () => {
    const s = snap({
      contextTicketId: "t1",
      tickets: [
        { id: "t1", number: "12345", status: "working", updatedAt: NOW, accountNumber: "4821" },
      ],
      recurringAccounts: [{ accountNumber: "4821", rollingCount: 5 }],
    });
    const item = evaluateAwareness(s).find((c) => c.type === "recurring_account");
    expect(item?.severity).toBe("info");
    expect(item?.dedupeKey).toBe("recurring:account:4821");
  });

  it("raises handoff risk for tracked work near shift end", () => {
    const s = snap({
      shiftStatus: "near-end",
      shiftProgress: 0.95,
      activeWork: trackedWork(),
      contextWorkItem: ctxFor("t1"),
    });
    const item = evaluateAwareness(s).find((c) => c.type === "handoff_risk");
    expect(item?.message).toBe("Ticket #12345 is still active and may need handoff.");
    // Phase 3 actions are navigation only.
    expect(item?.actions?.every((a) => a.kind === "navigate")).toBe(true);
  });

  it("stores no ticket bodies or free text beyond short labels", () => {
    const s = snap({ activeWork: trackedWork(), contextWorkItem: ctxFor("t1") });
    for (const c of evaluateAwareness(s)) {
      expect(JSON.stringify(c)).not.toContain("patient");
      expect(c.message.length).toBeLessThan(200);
    }
  });
});

describe("dedupe, cooldown and dismissal", () => {
  let state: AwarenessState;
  const s = () =>
    snap({ activeWork: trackedWork(), contextWorkItem: ctxFor("t1") });

  beforeEach(() => {
    state = { ...EMPTY_AWARENESS_STATE, shiftKey: SHIFT };
  });

  it("does not duplicate items across recomputations", () => {
    const first = mergeAwareness(evaluateAwareness(s()), state, NOW, SHIFT);
    const second = mergeAwareness(evaluateAwareness(s()), first.state, NOW + 60_000, SHIFT);
    const keys = second.items.map((i) => i.dedupeKey);
    expect(new Set(keys).size).toBe(keys.length);
    const long = second.items.find((i) => i.type === "long_running_work");
    const longFirst = first.items.find((i) => i.type === "long_running_work");
    // Same item updated in place — creation time is preserved.
    expect(long?.createdAt).toBe(longFirst?.createdAt);
    expect(long?.updatedAt).not.toBe(longFirst?.updatedAt);
  });

  it("puts a re-seen condition on cooldown instead of re-alerting", () => {
    const first = mergeAwareness(evaluateAwareness(s()), state, NOW, SHIFT);
    expect(first.items.find((i) => i.type === "long_running_work")?.cooldownUntil).toBeUndefined();
    const second = mergeAwareness(evaluateAwareness(s()), first.state, NOW + 60_000, SHIFT);
    expect(second.items.find((i) => i.type === "long_running_work")?.cooldownUntil).toBeTruthy();
  });

  it("hides a dismissed condition but not other entities", () => {
    const first = mergeAwareness(evaluateAwareness(s()), state, NOW, SHIFT);
    const dismissed = dismissAwareness(first.state, "long-work:ticket:t1", "warning", NOW);
    const after = mergeAwareness(evaluateAwareness(s()), dismissed, NOW + 60_000, SHIFT);
    expect(after.items.find((i) => i.dedupeKey === "long-work:ticket:t1")).toBeUndefined();

    // A different ticket still triggers.
    const other = snap({
      activeWork: trackedWork({ id: "t2", label: "Ticket #99999" }),
      contextWorkItem: ctxFor("t2"),
    });
    const otherRes = mergeAwareness(evaluateAwareness(other), after.state, NOW + 120_000, SHIFT);
    expect(otherRes.items.find((i) => i.dedupeKey === "long-work:ticket:t2")).toBeTruthy();
  });

  it("reappears when a dismissed condition escalates", () => {
    const first = mergeAwareness(evaluateAwareness(s()), state, NOW, SHIFT);
    const dismissed = dismissAwareness(first.state, "long-work:ticket:t1", "warning", NOW);
    const worse = snap({
      activeWork: trackedWork({ elapsedMs: T.longWorkCriticalMs + 1 }),
      contextWorkItem: ctxFor("t1"),
    });
    const after = mergeAwareness(evaluateAwareness(worse), dismissed, NOW + 60_000, SHIFT);
    const item = after.items.find((i) => i.dedupeKey === "long-work:ticket:t1");
    expect(item?.severity).toBe("critical");
  });

  it("clears a condition once the entity is resolved", () => {
    const first = mergeAwareness(evaluateAwareness(s()), state, NOW, SHIFT);
    expect(first.items.some((i) => i.type === "long_running_work")).toBe(true);
    // Work completed: no active work at all.
    const done = mergeAwareness(evaluateAwareness(snap()), first.state, NOW + 60_000, SHIFT);
    expect(done.items.some((i) => i.type === "long_running_work")).toBe(false);
    expect(done.state.records["long-work:ticket:t1"]).toBeUndefined();
  });

  it("clears shift-scoped awareness state on shift rollover", () => {
    const first = mergeAwareness(evaluateAwareness(s()), state, NOW, SHIFT);
    const dismissed = dismissAwareness(first.state, "long-work:ticket:t1", "warning", NOW);
    const nextShift = mergeAwareness(
      evaluateAwareness(s()),
      dismissed,
      NOW + 6 * 60 * 60 * 1000,
      "2026-08-13",
    );
    expect(nextShift.state.shiftKey).toBe("2026-08-13");
    // The dismissal did not carry into the new shift.
    expect(nextShift.items.find((i) => i.dedupeKey === "long-work:ticket:t1")).toBeTruthy();
  });
});