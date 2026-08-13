import { describe, expect, it } from "vitest";
import {
  rankResolutions,
  resolutionFingerprint,
  resolutionSourceKey,
  summarizeResolution,
  type ResolutionMemory,
} from "./resolution-types";
import { assembleAccountContext, type AccountContextPorts } from "@/lib/core/account-context";

const ACC = "7431";
const now = Date.now();

function memory(over: Partial<ResolutionMemory> = {}): ResolutionMemory {
  return {
    id: "r1",
    accountNumber: ACC,
    accountName: "Sheboygan",
    problem: "On-call rotation not updating",
    rootCause: "Stale scheduler entry",
    resolution: "Reinitialized the scheduler",
    testing: "Verified correct provider",
    rollback: "Restore prior rotation",
    affectedArea: "on-call",
    confidence: "verified",
    source: { ticketId: "101" },
    status: "active",
    createdAt: new Date(now - 60_000).toISOString(),
    updatedAt: new Date(now - 60_000).toISOString(),
    ...over,
  };
}

function ports(over: Partial<AccountContextPorts> = {}): AccountContextPorts {
  return {
    identity: () => ({ number: ACC, name: "Sheboygan", status: "active" }),
    tickets: () => [],
    work: () => ({ logged: [] as never, additional: [] as never }),
    changes: async () => [
      {
        id: "c1",
        accountNumber: ACC,
        accountName: "Sheboygan",
        title: "Add overflow step",
        changeType: "scripting",
        status: "verified",
        createdAt: new Date(now).toISOString(),
        verifiedAt: new Date(now).toISOString(),
      },
    ] as never,
    resolutions: async () => [memory()],
    coverage: () => [] as never,
    knowledge: () => [] as never,
    dispatch: () => [] as never,
    awareness: () => [] as never,
    ...over,
  } as AccountContextPorts;
}

describe("resolution identity", () => {
  it("fingerprints on normalized problem + resolution", () => {
    expect(resolutionFingerprint(" On-Call  Rotation ", "Reinitialized\tthe scheduler")).toBe(
      resolutionFingerprint("on-call rotation", "reinitialized the scheduler"),
    );
    expect(resolutionFingerprint("a", "b")).not.toBe(resolutionFingerprint("a", "c"));
  });

  it("keys sources stably regardless of key order", () => {
    expect(resolutionSourceKey({ ticketId: "1", workItemId: "w" })).toBe(
      resolutionSourceKey({ workItemId: "w", ticketId: "1" }),
    );
  });

  it("summarizes without leaking long bodies", () => {
    const long = memory({ resolution: "x".repeat(400) });
    expect(summarizeResolution(long).length).toBeLessThanOrEqual(141);
  });
});

describe("ranking", () => {
  it("puts active verified ahead of active probable and superseded", () => {
    const ranked = rankResolutions(
      [
        memory({ id: "sup", status: "superseded", confidence: "verified" }),
        memory({ id: "prob", confidence: "probable" }),
        memory({ id: "ver" }),
      ],
      { accountNumber: ACC },
    );
    expect(ranked.map((r) => r.id)).toEqual(["ver", "prob", "sup"]);
  });

  it("prefers the same account over other accounts", () => {
    const ranked = rankResolutions([
      memory({ id: "other", accountNumber: "9999" }),
      memory({ id: "mine" }),
    ], { accountNumber: ACC });
    expect(ranked[0]?.id).toBe("mine");
  });
});

describe("account context integration", () => {
  it("ranks verified resolutions above verified change records", async () => {
    const pack = await assembleAccountContext(ACC, ports());
    expect(pack.knownFixes[0]?.kind).toBe("resolution");
    expect(pack.knownFixes[0]?.confidence).toBe("verified");
    expect(pack.knownFixes.some((f) => f.kind === "change_record")).toBe(true);
  });

  it("keeps provenance on every fix", async () => {
    const pack = await assembleAccountContext(ACC, ports());
    for (const fix of pack.knownFixes) {
      expect(fix.source.name).toBeTruthy();
      expect(fix.source.id).toBeTruthy();
    }
  });

  it("omits superseded resolutions from known fixes but keeps them listed", async () => {
    const pack = await assembleAccountContext(
      ACC,
      ports({ resolutions: async () => [memory({ id: "sup", status: "superseded" })] }),
    );
    expect(pack.knownFixes.every((f) => f.kind === "change_record")).toBe(true);
    expect(pack.resolutions.map((r) => r.status)).toEqual(["superseded"]);
  });

  it("reports a context gap instead of failing when resolutions are unavailable", async () => {
    const pack = await assembleAccountContext(
      ACC,
      ports({
        resolutions: async () => {
          throw new Error("offline");
        },
      }),
    );
    expect(pack.resolutions).toEqual([]);
    expect(pack.gaps.some((g) => g.includes("resolution"))).toBe(true);
    expect(pack.knownFixes.length).toBeGreaterThan(0);
  });
});
