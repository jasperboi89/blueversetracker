import { describe, expect, it, vi } from "vitest";
import {
  buildFocusWorkspace,
  toCopilotFocusContext,
  FOCUS_LIMITS,
  type FocusSnapshot,
} from "./focus-workspace";
import type { AwarenessItem, AwarenessSeverity } from "./awareness";

function snapshot(patch: Partial<FocusSnapshot> = {}): FocusSnapshot {
  return {
    now: Date.parse("2026-08-13T04:00:00Z"),
    shiftKey: "2026-08-12",
    shiftStatus: "active",
    shiftProgress: 0.3,
    activeWork: null,
    context: { blockers: [] },
    nightPlan: [],
    awareness: [],
    tickets: [],
    ...patch,
  };
}

function awareness(
  id: string,
  severity: AwarenessSeverity,
  type = "stale_waiting_ticket",
): AwarenessItem {
  return {
    id,
    type: type as AwarenessItem["type"],
    severity,
    title: `Condition ${id}`,
    message: "message",
    createdAt: "2026-08-13T03:00:00Z",
    updatedAt: "2026-08-13T03:00:00Z",
    dedupeKey: `dk:${id}`,
    actions: [{ id: "dismiss", label: "Dismiss", kind: "dismiss" }],
  };
}

describe("focus · CURRENT", () => {
  it("projects tracked work as CURRENT", () => {
    const f = buildFocusWorkspace(
      snapshot({
        activeWork: {
          kind: "ticket",
          id: "t1",
          label: "Ticket #12345",
          running: true,
          elapsedMs: 22 * 60_000,
          to: "/freshdesk-tickets/$ticketId/work",
          params: { ticketId: "t1" },
          accountNumber: "4821",
        },
      }),
    );
    expect(f.current?.label).toBe("Ticket #12345");
    expect(f.current?.accountId).toBe("4821");
    expect(f.current?.elapsedLabel).toBe("22m");
    expect(f.shift.activeTimers).toBe(1);
  });

  it("does not treat an opened-but-untracked page as CURRENT", () => {
    const f = buildFocusWorkspace(
      snapshot({ context: { activeTicket: { id: "t9" }, blockers: [] } }),
    );
    expect(f.current).toBeUndefined();
    expect(f.shift.activeTimers).toBe(0);
  });

  it("has a calm empty state with no tracked work", () => {
    const f = buildFocusWorkspace(snapshot());
    expect(f.current).toBeUndefined();
    expect(f.next).toEqual([]);
    expect(f.watch).toEqual([]);
    expect(f.blocked).toEqual([]);
  });
});

describe("focus · NEXT", () => {
  const must = { id: "n1", task: "Verify dispatch branch", priority: "must" as const, active: true };

  it("promotes incomplete Must items and drops completed ones", () => {
    const f = buildFocusWorkspace(
      snapshot({ nightPlan: [must, { ...must, id: "n2", task: "Done thing", active: false }] }),
    );
    expect(f.next.map((n) => n.label)).toEqual(["Verify dispatch branch"]);
    expect(f.next[0]?.reason).toBe("MUST_PRIORITY");
    expect(f.next[0]?.source).toBe("night_plan");
    expect(f.shift.mustRemaining).toBe(1);
  });

  it("orders Must before follow-up before Important, with no handoff item", () => {
    const f = buildFocusWorkspace(
      snapshot({
        shiftStatus: "near-end",
        nightPlan: [must, { id: "n3", task: "Nice to have", priority: "important", active: true }],
        activeWork: {
          kind: "ticket",
          id: "t1",
          label: "Ticket #1",
          running: false,
          elapsedMs: 5000,
        },
      }),
    );
    // Shift Handoff was removed: SHIFT_END_HANDOFF is never emitted.
    expect(f.next.map((n) => n.reason)).toEqual([
      "MUST_PRIORITY",
      "ACTIVE_WORK_FOLLOW_UP",
      "IMPORTANT_PRIORITY",
    ]);
    expect(f.next.some((n) => n.reason === "SHIFT_END_HANDOFF")).toBe(false);
  });

  it("stays bounded", () => {
    const f = buildFocusWorkspace(
      snapshot({
        nightPlan: Array.from({ length: 9 }, (_, i) => ({
          id: `n${i}`,
          task: `Task ${i}`,
          priority: "must" as const,
          active: true,
        })),
      }),
    );
    expect(f.next).toHaveLength(FOCUS_LIMITS.next);
  });
});

describe("focus · WATCH", () => {
  it("takes warnings from Awareness and ranks by severity", () => {
    const f = buildFocusWorkspace(
      snapshot({
        awareness: [awareness("a", "info"), awareness("b", "critical"), awareness("c", "warning")],
      }),
    );
    expect(f.watch.map((w) => w.severity)).toEqual(["critical", "warning", "info"]);
    expect(f.actionableWatchCount).toBe(2);
    expect(f.infoWatchCount).toBe(1);
  });

  it("keeps dismissal semantics on the Awareness dedupe key", () => {
    const f = buildFocusWorkspace(snapshot({ awareness: [awareness("a", "warning")] }));
    expect(f.watch[0]?.actions[0]).toMatchObject({ kind: "dismiss", dedupeKey: "dk:a" });
  });

  it("does not duplicate Must items already shown in NEXT", () => {
    const f = buildFocusWorkspace(
      snapshot({ awareness: [awareness("m", "warning", "must_items_remaining")] }),
    );
    expect(f.watch).toHaveLength(0);
  });

  it("stays bounded", () => {
    const f = buildFocusWorkspace(
      snapshot({
        awareness: Array.from({ length: 12 }, (_, i) => awareness(`a${i}`, "warning")),
      }),
    );
    expect(f.watch).toHaveLength(FOCUS_LIMITS.watch);
  });
});

describe("focus · BLOCKED", () => {
  it("shows recorded blockers and waiting tickets", () => {
    const f = buildFocusWorkspace(
      snapshot({
        context: {
          blockers: [
            {
              id: "manual:work:w1",
              type: "manual" as const,
              entity: { type: "work" as const, id: "w1" },
              reasonCode: "OPERATOR_BLOCKED",
              safeLabel: "Awaiting vendor callback",
              createdAt: "2026-08-13T02:00:00Z",
              source: "operator" as const,
              label: "Awaiting vendor callback",
              since: "2026-08-13T02:00:00Z",
            },
          ],
        },
        tickets: [
          { id: "t2", number: "12114", status: "waiting-cs", updatedAt: 1, accountNumber: "4821" },
        ],
      }),
    );
    expect(f.blocked.map((b) => b.reason)).toEqual(["RECORDED_BLOCKER", "WAITING_RESPONSE"]);
    expect(f.blocked[1]?.detail).toBe("Waiting on Customer Service");
  });

  it("never fabricates a blocker from elapsed time alone", () => {
    const f = buildFocusWorkspace(
      snapshot({
        activeWork: {
          kind: "ticket",
          id: "t1",
          label: "Ticket #1",
          running: true,
          elapsedMs: 5 * 60 * 60_000,
        },
        tickets: [
          { id: "t1", number: "1", status: "working", updatedAt: 1, accountNumber: "4821" },
        ],
      }),
    );
    expect(f.blocked).toEqual([]);
  });

  it("drops a blocker once the waiting state resolves", () => {
    const base = snapshot({
      tickets: [{ id: "t2", number: "2", status: "waiting-prog", updatedAt: 1, accountNumber: "1" }],
    });
    expect(buildFocusWorkspace(base).blocked).toHaveLength(1);
    const resolved = buildFocusWorkspace({
      ...base,
      tickets: [{ id: "t2", number: "2", status: "working", updatedAt: 2, accountNumber: "1" }],
    });
    expect(resolved.blocked).toHaveLength(0);
  });

  it("stays bounded", () => {
    const f = buildFocusWorkspace(
      snapshot({
        tickets: Array.from({ length: 8 }, (_, i) => ({
          id: `t${i}`,
          number: `${i}`,
          status: "waiting-cs" as const,
          updatedAt: 1,
          accountNumber: "1",
        })),
      }),
    );
    expect(f.blocked).toHaveLength(FOCUS_LIMITS.blocked);
  });
});

describe("focus · integration and privacy", () => {
  it("is deterministic and invokes no model or retrieval", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const s = snapshot({ nightPlan: [{ id: "n1", task: "T", priority: "must", active: true }] });
    const a = buildFocusWorkspace(s);
    const b = buildFocusWorkspace(s);
    expect(a).toEqual(b);
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it("projects a bounded account summary, never the whole pack", () => {
    const f = buildFocusWorkspace(
      snapshot({
        account: {
          accountNumber: "4821",
          activeTickets: 1,
          verifiedResolutions: 2,
          coverageLabel: "Coverage valid through Friday",
        },
      }),
    );
    expect(Object.keys(f.account ?? {})).toEqual([
      "accountNumber",
      "activeTickets",
      "verifiedResolutions",
      "coverageLabel",
    ]);
  });

  it("keeps provenance on every derived item", () => {
    const f = buildFocusWorkspace(
      snapshot({
        nightPlan: [{ id: "n1", task: "T", priority: "must", active: true }],
        awareness: [awareness("a", "warning")],
        tickets: [{ id: "t", number: "9", status: "waiting-cs", updatedAt: 1, accountNumber: "1" }],
      }),
    );
    for (const item of [...f.next, ...f.watch, ...f.blocked]) {
      expect(item.source).toBeTruthy();
      expect(item.reason).toBeTruthy();
    }
  });

  it("gives Copilot a bounded snapshot with no bodies", () => {
    const f = buildFocusWorkspace(
      snapshot({
        activeWork: {
          kind: "ticket",
          id: "t1",
          label: "Ticket #12345",
          running: true,
          elapsedMs: 60_000,
          accountNumber: "4821",
        },
        awareness: [awareness("a", "warning")],
      }),
    );
    const text = toCopilotFocusContext(f);
    expect(text).toContain("Current: Ticket #12345");
    expect(text.length).toBeLessThanOrEqual(1000);
    expect(text).not.toContain("dedupeKey");
  });
});
