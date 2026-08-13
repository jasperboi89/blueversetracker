import { beforeEach, describe, expect, it } from "vitest";
import { reduceShiftContext, type ShiftWorkingContext } from "./shift-context";
import { blockerId, safeLabel, SAFE_LABEL_MAX } from "./blockers";
import { sanitizeMetadata, type AccEvent, type AccEventInput } from "./events";
import { desiredTicketBlockers, planTicketReconcile } from "./blocker-reconciler";
import { buildFocusWorkspace, FOCUS_LIMITS } from "./focus-workspace";

const BASE: ShiftWorkingContext = {
  shiftKey: "test",
  recentActivity: [],
  blockers: [],
  warnings: [],
};

let seq = 0;
function ev(input: AccEventInput): AccEvent {
  seq += 1;
  return {
    id: `e${seq}`,
    timestamp: new Date(1_700_000_000_000 + seq * 1000).toISOString(),
    ...input,
    metadata: sanitizeMetadata(input.metadata),
  } as AccEvent;
}

function blockerEvent(
  kind: "blocker.created" | "blocker.updated" | "blocker.resolved",
  extra: Record<string, unknown> = {},
): AccEventInput {
  return {
    type: kind,
    source: "tickets-store",
    ticketId: "t1",
    metadata: {
      blockerId: "waiting_customer:ticket:t1",
      blockerType: "waiting_customer",
      entityType: "ticket",
      entityId: "t1",
      reasonCode: "TICKET_WAITING_CS",
      blockerSource: "ticket",
      safeLabel: "Waiting on Customer Service",
      ...extra,
    },
  };
}

function run(events: AccEventInput[], start: ShiftWorkingContext = BASE) {
  return events.reduce((ctx, e) => reduceShiftContext(ctx, ev(e)), start);
}

describe("blocker events · shift context", () => {
  beforeEach(() => {
    seq = 0;
  });

  it("created adds an active blocker", () => {
    const ctx = run([blockerEvent("blocker.created")]);
    expect(ctx.blockers).toHaveLength(1);
    expect(ctx.blockers[0]?.type).toBe("waiting_customer");
    expect(ctx.blockers[0]?.entity).toEqual({ type: "ticket", id: "t1" });
  });

  it("repeated create dedupes on stable identity", () => {
    const ctx = run([blockerEvent("blocker.created"), blockerEvent("blocker.created")]);
    expect(ctx.blockers).toHaveLength(1);
  });

  it("updated changes meaningful metadata only", () => {
    const created = run([blockerEvent("blocker.created")]);
    const same = run([blockerEvent("blocker.updated")], created);
    expect(same).toBe(created);
    const changed = run(
      [blockerEvent("blocker.updated", { reasonCode: "TICKET_WAITING_PROG" })],
      created,
    );
    expect(changed.blockers[0]?.reasonCode).toBe("TICKET_WAITING_PROG");
    expect(changed.blockers[0]?.createdAt).toBe(created.blockers[0]?.createdAt);
    expect(changed.blockers[0]?.updatedAt).toBeDefined();
  });

  it("resolved removes the blocker and is idempotent", () => {
    const created = run([blockerEvent("blocker.created")]);
    const resolved = run([blockerEvent("blocker.resolved")], created);
    expect(resolved.blockers).toHaveLength(0);
    expect(run([blockerEvent("blocker.resolved")], resolved)).toBe(resolved);
  });

  it("ignores malformed blocker payloads", () => {
    const ctx = run([
      { type: "blocker.created", source: "system", metadata: { blockerId: "x" } },
    ]);
    expect(ctx.blockers).toHaveLength(0);
  });
});

describe("blocker reconciliation · ticket waiting states", () => {
  const ticket = (status: string) => [
    { id: "t1", number: "12345", status, accountNumber: "4821" },
  ];

  it("maps waiting-cs and waiting-prog to the right blocker types", () => {
    expect(desiredTicketBlockers(ticket("waiting-cs"))[0]?.type).toBe("waiting_customer");
    expect(desiredTicketBlockers(ticket("waiting-prog"))[0]?.type).toBe("waiting_internal");
    expect(desiredTicketBlockers(ticket("working"))).toEqual([]);
    expect(desiredTicketBlockers(ticket("completed"))).toEqual([]);
  });

  it("creates on entry, no-ops when already recorded, resolves on exit", () => {
    const desired = desiredTicketBlockers(ticket("waiting-cs"));
    const first = planTicketReconcile([], desired);
    expect(first.create).toHaveLength(1);
    expect(first.resolve).toHaveLength(0);

    const active = run([blockerEvent("blocker.created")]).blockers;
    const second = planTicketReconcile(active, desired);
    expect(second.create).toHaveLength(0);
    expect(second.resolve).toHaveLength(0);

    const third = planTicketReconcile(active, desiredTicketBlockers(ticket("working")));
    expect(third.resolve.map((b) => b.id)).toEqual(["waiting_customer:ticket:t1"]);
  });

  it("never resolves non-ticket blockers", () => {
    const active = [
      {
        id: "action_uncertain:action:a1",
        type: "action_uncertain" as const,
        entity: { type: "action" as const, id: "a1" },
        reasonCode: "ACTION_OUTCOME_UNCERTAIN",
        createdAt: "2026-01-01T00:00:00Z",
        source: "action_executor" as const,
      },
    ];
    expect(planTicketReconcile(active, []).resolve).toEqual([]);
  });

  it("ticket completion resolves the waiting blocker", () => {
    const active = run([blockerEvent("blocker.created")]).blockers;
    expect(
      planTicketReconcile(active, desiredTicketBlockers(ticket("completed"))).resolve,
    ).toHaveLength(1);
  });
});

describe("blocker privacy", () => {
  it("strips anything outside the metadata allowlist", () => {
    const e = ev(
      blockerEvent("blocker.created", {
        ticketBody: "Patient John Doe called about...",
        payload: { note: "secret" },
      }),
    );
    expect(e.metadata).not.toHaveProperty("ticketBody");
    expect(e.metadata).not.toHaveProperty("payload");
    expect(Object.keys(e.metadata ?? {}).sort()).toEqual([
      "blockerId",
      "blockerSource",
      "blockerType",
      "entityId",
      "entityType",
      "reasonCode",
      "safeLabel",
    ]);
  });

  it("bounds safe labels", () => {
    const long = "x".repeat(400);
    expect(safeLabel(long)?.length).toBe(SAFE_LABEL_MAX);
    const e = ev(blockerEvent("blocker.created", { safeLabel: long }));
    expect(String(e.metadata?.safeLabel).length).toBeLessThanOrEqual(SAFE_LABEL_MAX + 1);
  });

  it("builds stable ids", () => {
    expect(blockerId("waiting_customer", { type: "ticket", id: "12345" })).toBe(
      "waiting_customer:ticket:12345",
    );
  });
});

describe("focus BLOCKED · explicit blockers", () => {
  const snapshot = (blockers: ShiftWorkingContext["blockers"], tickets: unknown[] = []) =>
    ({
      now: Date.now(),
      shiftKey: "s",
      shiftStatus: "active",
      shiftProgress: 0.2,
      activeWork: null,
      context: { blockers },
      nightPlan: [],
      awareness: [],
      tickets,
    }) as never;

  const waitingBlocker = run([blockerEvent("blocker.created")]).blockers;
  const waitingTicket = [
    { id: "t1", number: "12345", status: "waiting-cs", updatedAt: 1, accountNumber: "4821" },
  ];

  it("shows the explicit blocker and does not duplicate the fallback row", () => {
    const f = buildFocusWorkspace(snapshot(waitingBlocker, waitingTicket));
    expect(f.blocked).toHaveLength(1);
    expect(f.blocked[0]?.reason).toBe("RECORDED_BLOCKER");
    expect(f.blocked[0]?.detail).toBe("Waiting on Customer Service");
  });

  it("surfaces uncertain actions as blocked", () => {
    const f = buildFocusWorkspace(
      snapshot(
        run([
          blockerEvent("blocker.created", {
            blockerId: "action_uncertain:action:a1",
            blockerType: "action_uncertain",
            entityType: "action",
            entityId: "a1",
            reasonCode: "ACTION_OUTCOME_UNCERTAIN",
            blockerSource: "action_executor",
            safeLabel: "Outcome needs verification",
          }),
        ]).blockers,
      ),
    );
    expect(f.blocked[0]?.reason).toBe("ACTION_OUTCOME_UNCERTAIN");
    expect(f.blocked[0]?.severity).toBe("warning");
  });

  it("drops the row once the blocker resolves", () => {
    const f = buildFocusWorkspace(snapshot([], []));
    expect(f.blocked).toEqual([]);
  });

  it("stays bounded", () => {
    const many = Array.from({ length: 10 }, (_, i) =>
      run([
        blockerEvent("blocker.created", {
          blockerId: `manual:work:w${i}`,
          blockerType: "manual",
          entityType: "work",
          entityId: `w${i}`,
          blockerSource: "operator",
        }),
      ]).blockers[0]!,
    );
    expect(buildFocusWorkspace(snapshot(many)).blocked).toHaveLength(FOCUS_LIMITS.blocked);
  });
});
