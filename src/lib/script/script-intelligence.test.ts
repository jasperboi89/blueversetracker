import { describe, expect, it } from "vitest";
import { ingestScript } from "./script-ingest";
import { diffStructures } from "./script-diff";
import { analyzeChangeImpact } from "./change-impact";
import { buildRegressionSuite } from "./test-intelligence";
import { analyzeHistory } from "./script-history";
import { buildScriptRadar } from "./script-radar";
import { enumerateStaticPaths } from "./script-simulation";
import { matchResolutions } from "./script-resolution-link";
import { coverageFor, type ScriptVersion } from "./script-contract";

const SCRIPT_V1 = `
SECTION: Greeting
PROMPT: Ask for the account number
SET account_number = input
IF account_number IS EMPTY THEN GOTO Greeting
GOTO Verification

SECTION: Verification
PROMPT: Confirm the address on file
IF verified THEN GOTO Dispatch
GOTO Escalation

SECTION: Dispatch
ACTION: Create dispatch ticket
TRANSFER TO On Call

SECTION: Escalation
MESSAGE: Advise the caller a supervisor will call back
`.trim();

const SCRIPT_V2 = `
SECTION: Greeting
PROMPT: Ask for the account number
SET account_number = input
IF account_number IS EMPTY THEN GOTO Greeting
GOTO Verification

SECTION: Verification
PROMPT: Confirm the address and the callback number
IF verified THEN GOTO Dispatch
GOTO Escalation

SECTION: Dispatch
ACTION: Create dispatch ticket
ACTION: Log the dispatch time
TRANSFER TO On Call

SECTION: Escalation
MESSAGE: Advise the caller a supervisor will call back
GOTO Survey
`.trim();

function versionFrom(source: string, n: number, at: string): ScriptVersion {
  const analysis = ingestScript(source);
  return {
    id: `v${n}`,
    scriptId: "script-1",
    versionNumber: n,
    kind: "is_script",
    title: "Account Verification",
    contentFingerprint: analysis.contentFingerprint,
    structureFingerprint: analysis.structureFingerprint,
    structure: analysis.structure,
    complexity: analysis.complexity,
    ingestedAt: at,
  };
}

describe("safe ingestion", () => {
  it("redacts secrets before anything structural is derived", () => {
    const analysis = ingestScript(
      `SECTION: Intake\nPROMPT: caller ssn is 123-45-6789 and email bob@example.com\napi_key = sk_live_abcdef1234567890`,
    );
    const serialized = JSON.stringify(analysis.structure);
    expect(serialized).not.toContain("123-45-6789");
    expect(serialized).not.toContain("bob@example.com");
    expect(serialized).not.toContain("sk_live_abcdef1234567890");
    expect(Object.values(analysis.redactions).reduce((a, b) => a + b, 0)).toBeGreaterThan(0);
  });

  it("is deterministic — the same source yields the same fingerprints", () => {
    const a = ingestScript(SCRIPT_V1);
    const b = ingestScript(SCRIPT_V1);
    expect(a.contentFingerprint).toBe(b.contentFingerprint);
    expect(a.structureFingerprint).toBe(b.structureFingerprint);
  });

  it("keeps the structure fingerprint stable across cosmetic reformatting", () => {
    const spaced = SCRIPT_V1.split("\n").join("\n\n");
    expect(ingestScript(spaced).structureFingerprint).toBe(
      ingestScript(SCRIPT_V1).structureFingerprint,
    );
    expect(ingestScript(spaced).contentFingerprint).not.toBe(
      ingestScript(SCRIPT_V1).contentFingerprint,
    );
  });

  it("extracts sections and branch targets", () => {
    const { structure } = ingestScript(SCRIPT_V1);
    const names = structure.components.map((c) => c.name);
    expect(names).toContain("Greeting");
    expect(names).toContain("Dispatch");
    expect(structure.dependencies.length).toBeGreaterThan(0);
    expect(coverageFor(structure)).toBeGreaterThan(0);
  });
});

describe("structural diff", () => {
  it("reports added components and dependencies", () => {
    const diff = diffStructures(ingestScript(SCRIPT_V1).structure, ingestScript(SCRIPT_V2).structure);
    expect(diff.structurallyIdentical).toBe(false);
    expect(diff.counts.componentsAdded + diff.counts.dependenciesAdded).toBeGreaterThan(0);
  });

  it("treats a cosmetic edit as structurally identical", () => {
    const diff = diffStructures(
      ingestScript(SCRIPT_V1).structure,
      ingestScript(SCRIPT_V1.split("\n").join("\n\n")).structure,
    );
    expect(diff.structurallyIdentical).toBe(true);
  });
});

describe("change impact", () => {
  it("stays within observed structure and always carries caveats", () => {
    const after = ingestScript(SCRIPT_V2).structure;
    const diff = diffStructures(ingestScript(SCRIPT_V1).structure, after);
    const impact = analyzeChangeImpact(after, diff);

    expect(impact.seeds.length).toBeGreaterThan(0);
    expect(impact.caveats.length).toBeGreaterThan(0);
    const ids = new Set(after.components.map((c) => c.id));
    for (const hit of impact.impacted) expect(ids.has(hit.id)).toBe(true);
  });

  it("never uses causal language", () => {
    const after = ingestScript(SCRIPT_V2).structure;
    const diff = diffStructures(ingestScript(SCRIPT_V1).structure, after);
    const text = JSON.stringify(analyzeChangeImpact(after, diff)).toLowerCase();
    for (const phrase of ["caused by", "root cause", "will break", "because of"]) {
      expect(text).not.toContain(phrase);
    }
  });

  it("degrades confidence when the target is unresolved", () => {
    const after = ingestScript(SCRIPT_V2).structure;
    const diff = diffStructures(ingestScript(SCRIPT_V1).structure, after);
    const impact = analyzeChangeImpact(after, diff);
    // SCRIPT_V2 jumps to "Survey", which does not exist in the script.
    expect(impact.confidence).not.toBe("supported");
  });
});

describe("test intelligence", () => {
  it("proposes required cases for changed components and unresolved targets", () => {
    const after = ingestScript(SCRIPT_V2).structure;
    const diff = diffStructures(ingestScript(SCRIPT_V1).structure, after);
    const suite = buildRegressionSuite(after, diff, analyzeChangeImpact(after, diff));

    expect(suite.cases.length).toBeGreaterThan(0);
    expect(suite.cases.some((c) => c.priority === "required")).toBe(true);
    for (const c of suite.cases) expect(c.rationale.length).toBeGreaterThan(0);
  });

  it("returns no cases when nothing changed", () => {
    const s = ingestScript(SCRIPT_V1).structure;
    const diff = diffStructures(s, s);
    const suite = buildRegressionSuite(s, diff, analyzeChangeImpact(s, diff));
    expect(suite.cases).toHaveLength(0);
  });
});

describe("history + radar", () => {
  const versions = [
    versionFrom(SCRIPT_V1, 1, "2026-01-01T00:00:00.000Z"),
    versionFrom(SCRIPT_V2, 2, "2026-01-05T00:00:00.000Z"),
  ];

  it("separates structural from cosmetic revisions", () => {
    const insight = analyzeHistory(versions);
    expect(insight.versionCount).toBe(2);
    expect(insight.structuralRevisions).toBe(1);
    expect(insight.cosmeticRevisions).toBe(0);
  });

  it("reports unknown history safely", () => {
    expect(analyzeHistory([]).complexityTrend).toBe("unknown");
  });

  it("emits at most three radar observations", () => {
    const inputs = versions.map((v, i) => ({
      scriptId: `s${i}`,
      title: v.title,
      latest: v,
      history: analyzeHistory(versions),
    }));
    const items = buildScriptRadar(inputs);
    expect(items.length).toBeLessThanOrEqual(3);
    for (const item of items) expect(item.generatedAt).toBeTruthy();
  });
});

describe("simulation seam", () => {
  it("enumerates static paths and refuses to claim prediction", () => {
    const report = enumerateStaticPaths(ingestScript(SCRIPT_V1).structure);
    expect(report.support).toBe("static_paths_only");
    expect(report.paths.length).toBeGreaterThan(0);
    expect(report.caveats.join(" ")).toContain("not executions");
  });

  it("terminates on a cyclic script", () => {
    const cyclic = ingestScript(
      "SECTION: A\nGOTO B\n\nSECTION: B\nGOTO A",
    ).structure;
    const report = enumerateStaticPaths(cyclic);
    expect(report.paths.some((p) => p.loopedBack)).toBe(true);
  });
});

describe("resolution linkage", () => {
  it("only matches on shared vocabulary and labels itself correlational", () => {
    const after = ingestScript(SCRIPT_V2).structure;
    const diff = diffStructures(ingestScript(SCRIPT_V1).structure, after);
    const impact = analyzeChangeImpact(after, diff);

    const matches = matchResolutions(after, impact, [
      { id: "r1", title: "Dispatch escalation ticket loop", summary: "escalation and dispatch handling" },
      { id: "r2", title: "Printer offline", summary: "hardware swap" },
    ]);

    expect(matches.every((m) => m.note.includes("Correlation only"))).toBe(true);
    expect(matches.find((m) => m.resolutionId === "r2")).toBeUndefined();
  });
});
