/**
 * Phase 4.5 — verification gate tests.
 *
 * These assert the *safety* properties of Script Intelligence rather than its
 * features: no raw source or secret escapes the analysis boundary, unknown
 * structure stays unknown, versions stay isolated, and no layer states a
 * causal claim the parser cannot support.
 */

import { describe, expect, it } from "vitest";
import { ingestScript } from "./script-ingest";
import { diffStructures } from "./script-diff";
import { analyzeChangeImpact } from "./change-impact";
import { buildRegressionSuite } from "./test-intelligence";
import { versionInsert } from "./script-version-map";
import type { ScriptAnalysis } from "./script-contract";

const SENSITIVE = [
  'Say "Thank you for calling Mercy Clinic, this is the answering service."',
  "PASSWORD=hunter2secret",
  "Caller phone 555-867-5309 patient DOB 04/11/1972",
  "api_key: sk-live-abcdef123456",
];

const SCRIPT_A = [
  "PAGE Greeting",
  ...SENSITIVE,
  "FIELD CallerName",
  "IF Emergency THEN GOTO Dispatch",
  "PAGE Dispatch",
  "CALL RegDr",
  "%%$$ unparseable gibberish ~~^^",
  "GOTO NowhereAtAll",
].join("\n");

const SCRIPT_B = [
  "PAGE Greeting",
  "FIELD CallerName",
  "FIELD CallbackNumber",
  "IF Emergency THEN GOTO Dispatch",
  "PAGE Dispatch",
  "CALL RegDr",
].join("\n");

function allText(value: unknown): string {
  return JSON.stringify(value);
}

describe("raw source privacy boundary", () => {
  const analysis = ingestScript(SCRIPT_A);

  it("never carries greeting prose, credentials or caller details into the analysis", () => {
    const serialized = allText(analysis);
    expect(serialized).not.toContain("hunter2secret");
    expect(serialized).not.toContain("sk-live-abcdef123456");
    expect(serialized).not.toContain("555-867-5309");
    expect(serialized).not.toContain("Thank you for calling Mercy Clinic");
  });

  it("reports the redactions it made instead of hiding them", () => {
    const total = Object.values(analysis.redactions).reduce((a, b) => a + b, 0);
    expect(total).toBeGreaterThan(0);
  });

  it("persists structural metadata only — no source column exists", () => {
    const row = versionInsert({
      operatorUserId: "00000000-0000-0000-0000-000000000001",
      scriptId: "00000000-0000-0000-0000-000000000002",
      versionNumber: 1,
      kind: "is_script",
      title: "Mercy Clinic",
      analysis,
    }) as Record<string, unknown>;
    expect(Object.keys(row)).not.toContain("source");
    expect(Object.keys(row)).not.toContain("script_body");
    expect(allText(row)).not.toContain("hunter2secret");
  });
});

describe("unknown structure stays unknown", () => {
  const analysis = ingestScript(SCRIPT_A);

  it("records unparseable lines explicitly rather than guessing a component", () => {
    expect(analysis.structure.unknowns.length).toBeGreaterThan(0);
    expect(analysis.complexity.coverage).toBeLessThan(1);
  });

  it("marks a reference with no matching component as unresolved, not as an edge to nowhere", () => {
    const unresolved = analysis.structure.dependencies.filter(
      (d) => d.resolution === "unresolved",
    );
    expect(unresolved.length).toBeGreaterThan(0);
    for (const dep of unresolved) {
      expect(dep.toId).toBeUndefined();
    }
  });
});

describe("version isolation", () => {
  const a = ingestScript(SCRIPT_A);
  const b = ingestScript(SCRIPT_B);

  it("gives structurally different versions different fingerprints", () => {
    expect(a.structureFingerprint).not.toEqual(b.structureFingerprint);
  });

  it("gives identical source a stable identity", () => {
    expect(ingestScript(SCRIPT_B).contentFingerprint).toEqual(b.contentFingerprint);
    expect(ingestScript(SCRIPT_B).structureFingerprint).toEqual(b.structureFingerprint);
  });

  it("resolves each version's dependencies inside that version only", () => {
    const ids = new Set(b.structure.components.map((c) => c.id));
    for (const dep of b.structure.dependencies) {
      expect(ids.has(dep.fromId)).toBe(true);
      if (dep.toId) expect(ids.has(dep.toId)).toBe(true);
    }
  });
});

describe("diff and impact never overstate", () => {
  const a = ingestScript(SCRIPT_A);
  const b = ingestScript(SCRIPT_B);
  const diff = diffStructures(a.structure, b.structure);

  it("reports only differences present in both structures", () => {
    const names = new Set([
      ...a.structure.components.map((c) => c.name),
      ...b.structure.components.map((c) => c.name),
    ]);
    for (const delta of diff.components) {
      expect(names.has(delta.component.name)).toBe(true);
    }
  });

  it("labels impact as reachability and always attaches caveats", () => {
    const impact = analyzeChangeImpact(b.structure, diff);
    expect(impact.caveats.join(" ")).toMatch(/does not predict runtime behaviour/i);
    for (const hit of impact.impacted) {
      expect(["changed", "depends on a changed component", "is used by a changed component"]).toContain(
        hit.relation,
      );
    }
  });

  it("never emits a probability or a certainty claim", () => {
    const impact = analyzeChangeImpact(b.structure, diff);
    const prose = `${allText(diff)} ${allText(impact)}`;
    expect(prose).not.toMatch(/will break|root cause|caused the|guaranteed|\d+% (likely|chance)/i);
  });
});

describe("test intelligence prepares, never passes", () => {
  const a = ingestScript(SCRIPT_A);
  const b = ingestScript(SCRIPT_B);
  const diff = diffStructures(a.structure, b.structure);
  const plan = buildRegressionSuite(b.structure, diff, analyzeChangeImpact(b.structure, diff));

  it("produces checks that are not marked executed", () => {
    const serialized = allText(plan).toLowerCase();
    expect(serialized).not.toContain('"passed"');
    expect(serialized).not.toContain('"status":"pass"');
  });

  it("surfaces its own gaps rather than implying full coverage", () => {
    expect(Array.isArray(plan.gaps)).toBe(true);
    expect(plan.coverageOfImpact).toBeLessThanOrEqual(1);
  });
});

describe("complexity is a band, not a forecast", () => {
  it("classifies into interpretable bands with named drivers", () => {
    const { complexity } = ingestScript(SCRIPT_A) as ScriptAnalysis;
    expect(["low", "moderate", "high", "insufficient"]).toContain(complexity.band);
    expect(Array.isArray(complexity.drivers)).toBe(true);
  });
});
