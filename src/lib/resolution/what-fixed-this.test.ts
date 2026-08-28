import { describe, it, expect } from "vitest";
import {
  buildWhatFixedThis,
  rankWhatFixedThis,
  tierForResolution,
  type WhatFixedThisResult,
} from "./what-fixed-this";
import type { ResolutionMemory } from "./resolution-types";

function mem(over: Partial<ResolutionMemory> = {}): ResolutionMemory {
  return {
    id: over.id ?? "r1",
    accountNumber: over.accountNumber ?? "7431",
    accountName: over.accountName ?? "Acme",
    problem: over.problem ?? "routing broke",
    rootCause: "",
    resolution: over.resolution ?? "reset routing table",
    testing: over.testing ?? "",
    rollback: "",
    affectedArea: over.affectedArea ?? "routing",
    confidence: over.confidence ?? "verified",
    source: {},
    status: over.status ?? "active",
    createdAt: over.createdAt ?? "2026-08-01T00:00:00.000Z",
    updatedAt: over.updatedAt ?? "2026-08-10T00:00:00.000Z",
  };
}

describe("tierForResolution", () => {
  it("verified same-account is the top tier", () => {
    expect(tierForResolution(mem({ confidence: "verified" }), "7431")).toBe(
      "same_account_verified",
    );
  });
  it("unverified same-account is next", () => {
    expect(tierForResolution(mem({ confidence: "probable" }), "7431")).toBe("same_account");
  });
  it("matching component on another account is the component tier", () => {
    expect(
      tierForResolution(mem({ accountNumber: "9000", affectedArea: "routing" }), "7431", "routing"),
    ).toBe("component");
  });
  it("otherwise cross-account", () => {
    expect(
      tierForResolution(mem({ accountNumber: "9000", affectedArea: "billing" }), "7431", "routing"),
    ).toBe("cross_account");
  });
});

describe("buildWhatFixedThis", () => {
  it("orders verified same-account before component before cross-account", () => {
    const memories = [
      mem({ id: "cross", accountNumber: "9000", affectedArea: "billing", confidence: "verified" }),
      mem({ id: "sa", accountNumber: "7431", confidence: "verified", affectedArea: "routing" }),
      mem({ id: "comp", accountNumber: "5555", affectedArea: "routing", confidence: "probable" }),
    ];
    const out = buildWhatFixedThis({ accountNumber: "7431", affectedArea: "routing", memories });
    expect(out.map((r) => r.id)).toEqual(["sa", "comp", "cross"]);
    expect(out.every((r) => r.advisoryOnly === true)).toBe(true);
  });

  it("excludes archived/superseded memories", () => {
    const memories = [
      mem({ id: "old", status: "archived" }),
      mem({ id: "live", status: "active" }),
    ];
    expect(buildWhatFixedThis({ accountNumber: "7431", memories }).map((r) => r.id)).toEqual([
      "live",
    ]);
  });

  it("merges extra tiers (freshdesk/knowledge) after resolution tiers", () => {
    const extra: WhatFixedThisResult[] = [
      {
        id: "fd1",
        tier: "freshdesk",
        problem: "old ticket",
        resolution: "did a thing",
        accountNumber: "7431",
        verification: "unknown",
        date: "2026-07-01T00:00:00.000Z",
        basis: "Relevant historical Freshdesk ticket",
        evidence: { type: "ticket", id: "fd1" },
        advisoryOnly: true,
      },
    ];
    const out = buildWhatFixedThis({
      accountNumber: "7431",
      memories: [mem({ id: "sa" })],
      extra,
    });
    expect(out[0]!.id).toBe("sa");
    expect(out[out.length - 1]!.id).toBe("fd1");
  });

  it("respects the limit", () => {
    const memories = Array.from({ length: 20 }, (_, i) => mem({ id: `m${i}` }));
    expect(
      rankWhatFixedThis(buildWhatFixedThis({ accountNumber: "7431", memories }), 3),
    ).toHaveLength(3);
  });
});
