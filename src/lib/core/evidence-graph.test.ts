import { describe, expect, it } from "vitest";
import {
  buildEvidenceGraph,
  detectConflicts,
  getEvidenceTimeline,
  getHistoricalEvidence,
  getSupersededEvidence,
} from "./evidence-graph";
import {
  isSafeForOperationalGuidance,
  type EvidenceFact,
} from "./evidence-contract";
import {
  freshnessFor,
  promoteByOperator,
  realityLabel,
  sanitizeEvidenceValue,
  supersede,
} from "./reality-boundary";

const NOW = Date.parse("2026-02-01T00:00:00.000Z");

function fact(over: Partial<EvidenceFact> & { id: string }): EvidenceFact {
  return {
    subject: { type: "account", id: "1234" },
    predicate: "dispatch_method",
    value: "email",
    origin: "retrieved",
    confidence: "probable",
    source: { type: "knowledge_vault", id: "note-1" },
    recordedAt: "2026-01-30T00:00:00.000Z",
    observedAt: "2026-01-30T00:00:00.000Z",
    status: "active",
    ...over,
  } as EvidenceFact;
}

describe("reality boundary", () => {
  it("keeps origin and confidence independent", () => {
    const f = fact({ id: "a", origin: "inferred", confidence: "verified" });
    expect(realityLabel(f)).toContain("VERIFIED");
    expect(realityLabel(f)).toContain("INFERRED");
  });

  it("applies domain-specific freshness windows", () => {
    const twoHoursAgo = new Date(NOW - 2 * 60 * 60 * 1000).toISOString();
    expect(freshnessFor("freshdesk", twoHoursAgo, NOW)).toBe("recent");
    expect(freshnessFor("knowledge_vault", twoHoursAgo, NOW)).toBe("current");
  });

  it("never lets generated content act as verified guidance", () => {
    const generated = fact({ id: "g", origin: "generated", confidence: "verified" });
    expect(isSafeForOperationalGuidance(generated, { now: NOW })).toBe(false);
  });

  it("promotes to verified only through operator confirmation", () => {
    const generated = fact({ id: "g", origin: "generated", confidence: "unknown" });
    const promoted = promoteByOperator(generated, "2026-02-01T00:00:00.000Z").fact;
    expect(promoted.origin).toBe("operator_confirmed");
    expect(isSafeForOperationalGuidance(promoted, { now: NOW })).toBe(true);
  });

  it("drops values carrying sensitive data instead of storing them", () => {
    expect(sanitizeEvidenceValue("call 555-123-4567")).toBeNull();
    expect(sanitizeEvidenceValue("ops@example.com")).toBeNull();
    expect(sanitizeEvidenceValue("<p>Reboot the gateway</p>")).toBe("Reboot the gateway");
  });
});

describe("supersession", () => {
  it("keeps history queryable and excludes it from guidance", () => {
    const older = fact({ id: "old", value: "fax" });
    const newer = fact({
      id: "new",
      value: "email",
      origin: "observed",
      confidence: "verified",
      supersedes: ["old"],
      observedAt: "2026-01-31T00:00:00.000Z",
    });
    const graph = buildEvidenceGraph([older, newer], [], NOW);
    const stale = graph.byId.get("old")!;
    expect(stale.status).toBe("superseded");
    expect(getSupersededEvidence(graph)).toHaveLength(1);
    expect(isSafeForOperationalGuidance(stale, { now: NOW })).toBe(false);
    expect(isSafeForOperationalGuidance(graph.byId.get("new")!, { now: NOW })).toBe(true);
    expect(graph.edges.some((e) => e.relation === "supersedes")).toBe(true);
  });

  it("stamps validUntil when superseding directly", () => {
    const { older } = supersede(fact({ id: "o" }), fact({ id: "n" }), "2026-02-01T00:00:00.000Z");
    expect(older.validUntil).toBe("2026-02-01T00:00:00.000Z");
    expect(older.supersededBy).toEqual(["n"]);
  });
});

describe("conflicts", () => {
  it("detects disagreement without resolving it", () => {
    const documented = fact({ id: "doc", value: "fax" });
    const observed = fact({
      id: "live",
      value: "email",
      origin: "observed",
      confidence: "verified",
      source: { type: "freshdesk", id: "t-1" },
      observedAt: "2026-01-31T23:00:00.000Z",
    });
    const conflicts = detectConflicts([documented, observed], NOW);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]!.status).toBe("unresolved");
    expect(conflicts[0]!.values.map((v) => v.value).sort()).toEqual(["email", "fax"]);

    const graph = buildEvidenceGraph([documented, observed], [], NOW);
    expect(graph.byId.get("doc")!.status).toBe("disputed");
    // A disputed fact is never silently used for a recommendation.
    expect(isSafeForOperationalGuidance(graph.byId.get("doc")!, { now: NOW })).toBe(false);
  });

  it("does not flag multi-valued predicates as conflicts", () => {
    const a = fact({ id: "r1", predicate: "resolution.summary", value: "restarted service" });
    const b = fact({ id: "r2", predicate: "resolution.summary", value: "replaced modem" });
    expect(detectConflicts([a, b], NOW)).toHaveLength(0);
  });
});

describe("historical evidence", () => {
  it("preserves what was true then and excludes it from current guidance", () => {
    const past = fact({ id: "h", status: "historical", freshness: "historical" });
    const graph = buildEvidenceGraph([past], [], NOW);
    expect(getHistoricalEvidence(graph)).toHaveLength(1);
    expect(isSafeForOperationalGuidance(past, { now: NOW })).toBe(false);
    expect(getEvidenceTimeline(graph, { type: "account", id: "1234" })[0]!.status).toBe("historical");
  });
});
