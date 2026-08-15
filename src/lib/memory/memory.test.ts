import { describe, expect, it } from "vitest";
import type { AccEvent } from "@/lib/core/events";
import { compileEpisode, compressEvents, deriveCandidates, scoreImportance } from "./experience-compiler";
import { isOperationallyBinding, isRetrievableMemory, type OperationalMemory } from "./memory-contract";
import { scoreMemories } from "./memory-retrieval";

const T0 = "2026-02-01T00:00:00.000Z";

function ev(type: string, mins: number, extra: Partial<AccEvent> = {}): AccEvent {
  return {
    id: `${type}-${mins}`,
    type: type as AccEvent["type"],
    timestamp: new Date(Date.parse(T0) + mins * 60_000).toISOString(),
    source: "system",
    ...extra,
  } as AccEvent;
}

const WORK: AccEvent[] = [
  ev("ticket.opened", 0, { ticketId: "123", accountId: "A100" }),
  ev("work.started", 1, { ticketId: "123", accountId: "A100", metadata: { label: "Investigate routing" } }),
  ev("change.applied", 8, { ticketId: "123", accountId: "A100", metadata: { label: "Fixed on-call group" } }),
  ev("blocker.created", 9, { ticketId: "123", metadata: { blockerId: "b1", label: "Awaiting client callback" } }),
  ev("ticket.completed", 20, { ticketId: "123", accountId: "A100", metadata: { label: "Resolved" } }),
];

describe("experience compiler", () => {
  it("drops navigation noise and collapses repeats", () => {
    const t = compressEvents([
      ...WORK,
      ev("dispatch.retested", 21, { metadata: { label: "retest" } }),
      ev("dispatch.retested", 22, { metadata: { label: "retest" } }),
    ]);
    expect(t.some((x) => x.type === "ticket.opened")).toBe(false);
    expect(t.find((x) => x.type === "dispatch.retested")?.repeats).toBe(2);
  });

  it("compiles a bounded episode with actions, findings and outcomes", () => {
    const m = compileEpisode({ events: WORK, scope: { shiftKey: "s1", ticketId: "123", accountNumber: "A100" }, trigger: "ticket_completed" })!;
    expect(m.class).toBe("episodic");
    expect(m.origin).toBe("observed");
    expect(m.confidence).toBe("probable");
    expect(m.episode?.outcomes.length).toBeGreaterThan(0);
    expect(m.episode?.unresolved).toContain("Awaiting client callback");
    expect(m.summary.length).toBeLessThanOrEqual(900);
    // Memory points back at truth; it never copies it.
    expect(m.evidence.map((e) => e.sourceType)).toContain("freshdesk");
  });

  it("returns null for thin activity", () => {
    expect(
      compileEpisode({ events: [ev("account.opened", 0, { accountId: "A1" })], scope: {}, trigger: "manual_capture" }),
    ).toBeNull();
  });

  it("drops experiences containing sensitive content instead of redacting", () => {
    const leaky = [
      ev("work.started", 0, { ticketId: "9", metadata: { label: "call 555-123-4567 back" } }),
      ev("work.completed", 5, { ticketId: "9", metadata: { label: "done" } }),
    ];
    expect(compileEpisode({ events: leaky, scope: { ticketId: "9" }, trigger: "work_completed" })).toBeNull();
  });

  it("is deterministic", () => {
    const args = { events: WORK, scope: { shiftKey: "s1", ticketId: "123" }, trigger: "ticket_completed" as const, now: 1 };
    expect(compileEpisode(args)).toEqual(compileEpisode(args));
  });

  it("emits learning proposals as unverified candidates only", () => {
    const m = compileEpisode({ events: WORK, scope: { shiftKey: "s1", ticketId: "123", accountNumber: "A100" }, trigger: "ticket_completed" })!;
    const cands = deriveCandidates(m);
    const learning = cands.filter((c) => c.class.endsWith("_candidate"));
    expect(learning.length).toBeGreaterThan(0);
    for (const c of learning) {
      expect(c.status).toBe("candidate");
      expect(c.confidence).toBe("unknown");
      expect(isOperationallyBinding(c)).toBe(false);
    }
  });

  it("scores importance deterministically and within bounds", () => {
    const s = scoreImportance({ durationMs: 45 * 60_000, actions: 6, outcomes: 3, findings: 3, unresolved: 2 });
    expect(s).toBe(1);
    expect(scoreImportance({ durationMs: 0, actions: 0, outcomes: 0, findings: 0, unresolved: 0 })).toBe(0);
  });
});

function mem(over: Partial<OperationalMemory>): OperationalMemory {
  return {
    id: "m1",
    class: "episodic",
    title: "t",
    summary: "routing failure resolved",
    subject: { type: "ticket", id: "123" },
    scope: { accountNumber: "A100", ticketId: "123" },
    evidence: [],
    origin: "observed",
    confidence: "probable",
    status: "active",
    importance: 0.5,
    tags: [],
    occurredAt: T0,
    recordedAt: T0,
    fingerprint: "fp",
    compiler: "test",
    ...over,
  };
}

describe("memory retrieval", () => {
  const now = Date.parse(T0) + 86_400_000;

  it("ranks same-ticket experience above account-only experience", () => {
    const pool = [mem({ id: "acct", scope: { accountNumber: "A100" } }), mem({ id: "tick" })];
    const ranked = scoreMemories({ accountNumber: "A100", ticketId: "123", now }, pool);
    expect(ranked[0]?.memory.id).toBe("tick");
  });

  it("never returns rejected, archived or superseded memory", () => {
    const pool = [
      mem({ id: "r", status: "rejected" }),
      mem({ id: "a", status: "archived" }),
      mem({ id: "s", status: "superseded" }),
    ];
    expect(scoreMemories({ ticketId: "123", now }, pool)).toHaveLength(0);
    expect(pool.every((m) => !isRetrievableMemory(m))).toBe(true);
  });

  it("hides unreviewed candidates unless explicitly requested", () => {
    const pool = [mem({ id: "c", class: "semantic_candidate", status: "candidate", confidence: "unknown" })];
    expect(scoreMemories({ ticketId: "123", now }, pool)).toHaveLength(0);
    expect(scoreMemories({ ticketId: "123", includeCandidates: true, now }, pool)).toHaveLength(1);
  });
});