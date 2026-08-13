import { describe, expect, it, beforeEach } from "vitest";
import {
  assembleAccountContext,
  knowledgeMatchesAccount,
  type AccountContextPorts,
} from "./account-context";
import { toCopilotAccountContext } from "./account-context-projection";
import {
  getAccountContext,
  invalidateAccountContext,
} from "./account-context-service";

const ACC = "7431";
const now = Date.now();

function ticket(over: Record<string, unknown> = {}) {
  return {
    id: "t1",
    number: "101",
    accountNumber: ACC,
    accountName: "Sheboygan",
    status: "working",
    updatedAt: now,
    issueClassification: "Scripting Issue",
    details: { subject: "Overflow not routing" },
    freshdeskNotes: [],
    hubHistory: [],
    freshdeskAttachments: [],
    hubSnips: [],
    ...over,
  } as never;
}

function ports(over: Partial<AccountContextPorts> = {}): AccountContextPorts {
  return {
    identity: () => ({ number: ACC, name: "Sheboygan", status: "active" }),
    resolutions: async () => [],
    tickets: () => [ticket(), ticket({ id: "t2", number: "102", updatedAt: now - 1000 })],
    work: () => ({
      logged: [
        {
          id: "w1",
          kind: "ticket",
          workId: "t1",
          label: "Ticket #101",
          accountNumber: ACC,
          startedAt: now - 60_000,
          endedAt: now,
          durationMs: 60_000,
          to: "/x",
          params: {},
        },
      ] as never,
      additional: [] as never,
    }),
    changes: async () => [
      {
        id: "c1",
        accountNumber: ACC,
        accountName: "Sheboygan",
        title: "Add overflow step",
        changeType: "script",
        status: "verified",
        risk: "low",
        before: "",
        after: "",
        ticketNumber: "101",
        verifiedAt: new Date(now).toISOString(),
        createdAt: new Date(now - 5000).toISOString(),
      },
      {
        id: "c2",
        accountNumber: ACC,
        accountName: "Sheboygan",
        title: "Change on-call",
        changeType: "script",
        status: "applied",
        risk: "medium",
        createdAt: new Date(now - 9000).toISOString(),
      },
    ] as never,
    coverage: () => ({
      watched: { number: ACC, name: "Sheboygan", onCallThrough: "2026-01-01", addedAt: now },
      gaps: [
        {
          id: "g1",
          kind: "on-call",
          accountNumber: ACC,
          accountName: "Sheboygan",
          label: "On-call rotation expires",
          date: "2026-01-01",
          daysAway: 3,
          severity: "critical",
        },
      ],
    }),
    knowledge: async () => [
      {
        id: "k1",
        title: `Runbook ${ACC}`,
        tags: [],
        noteType: "runbook",
        isArchived: false,
        updatedAt: new Date(now).toISOString(),
      },
    ] as never,
    dispatch: () => [
      { id: "d1", accountNumber: ACC, status: "dispatched", updatedAt: now } as never,
    ],
    recurring: () => ({
      accountNumber: ACC,
      accountName: "Sheboygan",
      tickets: [],
      sixMonthCount: 9,
      rollingCount: 4,
      lastIssueAt: now,
      triggered: true,
      active: true,
    }),
    awareness: () => [],
    ...over,
  };
}

describe("account context pack", () => {
  it("assembles every category with provenance", async () => {
    const pack = await assembleAccountContext(ACC, ports());
    expect(pack.account.name).toBe("Sheboygan");
    expect(pack.recentTickets).toHaveLength(2);
    expect(pack.recentWork).toHaveLength(1);
    expect(pack.recentChanges).toHaveLength(2);
    expect(pack.recentDispatches).toHaveLength(1);
    expect(pack.runbooks).toHaveLength(1);
    expect(pack.recurringPatterns[0]?.count30d).toBe(4);
    expect(pack.errors).toHaveLength(0);
    expect(pack.provenance.sources.tickets?.ok).toBe(true);
    expect(pack.recentTickets[0]?.source.source).toBe("tickets");
  });

  it("ranks verified fixes above applied ones", async () => {
    const pack = await assembleAccountContext(ACC, ports());
    expect(pack.knownFixes.map((f) => f.confidence)).toEqual(["verified", "probable"]);
  });

  it("bounds requested limits", async () => {
    const many = Array.from({ length: 60 }, (_, i) =>
      ticket({ id: `t${i}`, number: String(i), updatedAt: now - i }),
    );
    const pack = await assembleAccountContext(
      ACC,
      ports({ tickets: () => many }),
      { recentTicketLimit: 500 },
    );
    expect(pack.recentTickets).toHaveLength(25);
  });

  it("returns partial context when a source fails", async () => {
    const pack = await assembleAccountContext(
      ACC,
      ports({
        changes: async () => {
          throw new Error("network down");
        },
      }),
    );
    expect(pack.recentChanges).toHaveLength(0);
    expect(pack.recentTickets).toHaveLength(2);
    expect(pack.errors[0]).toMatchObject({ source: "change_record" });
    expect(pack.provenance.sources.change_record?.ok).toBe(false);
  });

  it("raises deterministic warnings from coverage, changes and patterns", async () => {
    const pack = await assembleAccountContext(ACC, ports());
    const labels = pack.warnings.map((w) => w.label).join(" | ");
    expect(labels).toContain("On-call rotation expires");
    expect(labels).toContain("Applied but unverified change");
    expect(labels).toContain("scripting issues");
  });

  it("skips optional categories when disabled", async () => {
    const pack = await assembleAccountContext(ACC, ports(), {
      includeCoverage: false,
      includeKnowledge: false,
    });
    expect(pack.coverage).toBeUndefined();
    expect(pack.runbooks).toHaveLength(0);
  });

  it("matches knowledge notes only on explicit account references", () => {
    expect(knowledgeMatchesAccount({ title: "Runbook 7431", tags: [], isArchived: false }, ACC)).toBe(true);
    expect(knowledgeMatchesAccount({ title: "General", tags: ["7431"], isArchived: false }, ACC)).toBe(true);
    expect(knowledgeMatchesAccount({ title: "Runbook 7431", tags: [], isArchived: true }, ACC)).toBe(false);
    expect(knowledgeMatchesAccount({ title: "Unrelated", tags: [], isArchived: false }, ACC)).toBe(false);
  });
});

describe("copilot projection", () => {
  it("emits short labelled facts and no record bodies", async () => {
    const pack = await assembleAccountContext(ACC, ports());
    const text = toCopilotAccountContext(pack);
    expect(text).toContain("ACCOUNT 7431 Sheboygan");
    expect(text).toContain("Known fixes:");
    expect(text.length).toBeLessThanOrEqual(2500);
  });

  it("declares unavailable sources instead of implying emptiness", async () => {
    const pack = await assembleAccountContext(
      ACC,
      ports({
        changes: async () => {
          throw new Error("offline");
        },
      }),
    );
    expect(toCopilotAccountContext(pack)).toContain("Context gaps: change_record");
  });
});

describe("account context caching", () => {
  beforeEach(() => invalidateAccountContext());

  it("reuses the cached pack inside the TTL", async () => {
    let calls = 0;
    const p = ports({
      tickets: () => {
        calls += 1;
        return [ticket()];
      },
    });
    const a = await getAccountContext(ACC, { ports: p });
    const b = await getAccountContext(ACC, { ports: p });
    expect(calls).toBe(1);
    expect(b).toBe(a);
  });

  it("shares one assembly pass across concurrent callers", async () => {
    let calls = 0;
    const p = ports({
      changes: async () => {
        calls += 1;
        return [];
      },
    });
    const [a, b] = await Promise.all([
      getAccountContext(ACC, { ports: p }),
      getAccountContext(ACC, { ports: p }),
    ]);
    expect(calls).toBe(1);
    expect(a).toBe(b);
  });

  it("re-reads after invalidation or force", async () => {
    let calls = 0;
    const p = ports({
      tickets: () => {
        calls += 1;
        return [ticket()];
      },
    });
    await getAccountContext(ACC, { ports: p });
    invalidateAccountContext(ACC);
    await getAccountContext(ACC, { ports: p });
    await getAccountContext(ACC, { ports: p, force: true });
    expect(calls).toBe(3);
  });
});
