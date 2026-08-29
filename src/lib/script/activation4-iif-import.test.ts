import { describe, expect, it } from "vitest";
import { importIif, classifyAgainstExisting, complexityForImport } from "./iif-import";
import { detectDialect, parseIif } from "./iif-parse";
import { mapRecordsToStructure, recognitionMatrix } from "./iif-map";
import { IIF_LIMITS } from "./iif-contract";

/**
 * Activation 4 — Amtelco IIF ingestion.
 *
 * These tests pin the properties that make the importer safe to point at an
 * unfamiliar vendor export: redaction before parsing, no invented structure,
 * every line accounted for, and honest provenance.
 */

const TAB_EXPORT = [
  "!SECTION\tNAME\tNEXT",
  "SECTION\tGreeting\tVerify Caller",
  "!PROMPT\tNAME\tGOTO",
  "PROMPT\tVerify Caller\tCollect Reason",
  "PROMPT\tCollect Reason\tDispatch",
  "!TRANSFER\tNAME\tDEST",
  "TRANSFER\tDispatch\tOn Call Tech",
].join("\n");

const INI_EXPORT = [
  "; exported by IS",
  "[Section: Greeting]",
  "next = Verify Caller",
  "",
  "[Prompt: Verify Caller]",
  "goto = Collect Reason",
  "[Branch: Collect Reason]",
  "then = Dispatch",
  "else = Greeting",
  "[Transfer: Dispatch]",
  "dest = On Call Tech",
].join("\n");

const XML_EXPORT = [
  '<?xml version="1.0"?>',
  '<Section name="Greeting" next="Verify Caller" />',
  '<Prompt name="Verify Caller" goto="Collect Reason" />',
  '<Branch name="Collect Reason" then="Dispatch" else="Greeting" />',
  '<Transfer name="Dispatch" dest="On Call Tech" />',
].join("\n");

describe("dialect detection", () => {
  it("recognises each supported layout from punctuation shape", () => {
    expect(detectDialect(TAB_EXPORT)).toBe("tab_records");
    expect(detectDialect(INI_EXPORT)).toBe("ini_sections");
    expect(detectDialect(XML_EXPORT)).toBe("xml_elements");
  });

  it("refuses to guess on unfamiliar prose", () => {
    const prose = "The caller says hello\nWe then ask for their name\nFinally we page the tech";
    expect(detectDialect(prose)).toBe("unknown");
  });
});

describe("structural recognition", () => {
  it.each([
    ["tab", TAB_EXPORT],
    ["ini", INI_EXPORT],
    ["xml", XML_EXPORT],
  ])("extracts components and edges from the %s export", (_label, source) => {
    const result = importIif({ fileName: "export.iif", text: source });
    expect(result.accepted).toBe(true);
    if (!result.accepted) return;

    const names = result.structure.components.map((c) => c.name);
    expect(names).toContain("Greeting");
    expect(names).toContain("Dispatch");
    expect(result.structure.dependencies.length).toBeGreaterThan(0);
    expect(result.coverage.mappedComponentCount).toBe(result.structure.components.length);
  });

  it("resolves internal edges and flags targets that are not in the file", () => {
    const result = importIif({ fileName: "export.iif", text: XML_EXPORT });
    if (!result.accepted) throw new Error("expected acceptance");

    const internal = result.structure.dependencies.filter((d) => d.resolution === "internal");
    const unresolved = result.structure.dependencies.filter((d) => d.resolution === "unresolved");
    expect(internal.length).toBeGreaterThan(0);
    // "On Call Tech" is a transfer destination with no component in this file.
    expect(unresolved.map((d) => d.toKey)).toContain("on call tech");
  });

  it("never invents structure for an unrecognised record type", () => {
    const source = ['<Prompt name="Ask" />', '<Widget name="Mystery" goto="Ask" />'].join("\n");
    const result = importIif({ fileName: "x.xml", text: source });
    if (!result.accepted) throw new Error("expected acceptance");

    expect(result.structure.components.map((c) => c.name)).toEqual(["Ask"]);
    expect(result.coverage.unrecognizedTypes).toContain("Widget");
    // The unrecognised node contributes no edges into the graph.
    expect(result.structure.dependencies).toHaveLength(0);
    expect(result.unknowns.some((u) => u.reason === "unrecognized_construct")).toBe(true);
  });

  it("reports every substantive line as unknown when the layout is not recognised", () => {
    const prose = "caller greeting happens here\nthen we do a thing\nand another thing";
    const result = importIif({ fileName: "notes.txt", text: prose });
    if (!result.accepted) throw new Error("expected acceptance");

    expect(result.coverage.dialect).toBe("unknown");
    expect(result.structure.components).toHaveLength(0);
    expect(result.unknowns).toHaveLength(3);
    expect(result.coverage.limitations.join(" ")).toMatch(/layout was not recognised/i);
  });
});

describe("redaction runs before parsing", () => {
  it("keeps credentials out of component names, excerpts and fingerprints", () => {
    const source = [
      '<Prompt name="Verify" />',
      '<Action name="Login" password="hunter2SuperSecret" />',
      "call the tech at 555-867-5309 or nurse@example.com",
    ].join("\n");

    const result = importIif({ fileName: "secret.xml", text: source });
    if (!result.accepted) throw new Error("expected acceptance");

    const blob = JSON.stringify({
      structure: result.structure,
      coverage: result.coverage,
      provenance: result.provenance,
      safeText: result.safeText,
    });
    expect(blob).not.toContain("hunter2SuperSecret");
    expect(blob).not.toContain("555-867-5309");
    expect(blob).not.toContain("nurse@example.com");
    expect(Object.values(result.provenance.redactions).some((n) => n > 0)).toBe(true);
  });

  it("fingerprints the redacted text, so two files differing only by a secret match", () => {
    const a = importIif({ fileName: "a.xml", text: '<Action name="Login" password="aaa111bbb222" />' });
    const b = importIif({ fileName: "b.xml", text: '<Action name="Login" password="zzz999yyy888" />' });
    if (!a.accepted || !b.accepted) throw new Error("expected acceptance");
    expect(a.provenance.contentFingerprint).toBe(b.provenance.contentFingerprint);
  });
});

describe("provenance", () => {
  it("records the source without ever claiming vendor validation", () => {
    const result = importIif({
      fileName: "../../etc/passwd\u0000.iif",
      text: XML_EXPORT,
      sizeBytes: 1234,
      now: new Date("2026-02-01T05:00:00.000Z"),
    });
    if (!result.accepted) throw new Error("expected acceptance");

    expect(result.provenance.validatedAgainstRealExport).toBe(false);
    expect(result.provenance.fileName).not.toMatch(/[\\/\u0000]/);
    expect(result.provenance.fileSizeBytes).toBe(1234);
    expect(result.provenance.importedAt).toBe("2026-02-01T05:00:00.000Z");
    expect(result.coverage.limitations[0]).toMatch(/not been validated/i);
  });
});

describe("validation", () => {
  it("rejects empty, oversized and binary input without parsing it", () => {
    expect(importIif({ fileName: "e.iif", text: "   " })).toMatchObject({
      accepted: false,
      reason: "empty_file",
    });
    expect(
      importIif({ fileName: "big.iif", text: "x", sizeBytes: IIF_LIMITS.maxBytes + 1 }),
    ).toMatchObject({ accepted: false, reason: "too_large" });
    expect(importIif({ fileName: "b.iif", text: "PK\u0003\u0004 binary" })).toMatchObject({
      accepted: false,
      reason: "binary_content",
    });
    expect(importIif({ fileName: "m.iif", text: "bad \uFFFD bytes" })).toMatchObject({
      accepted: false,
      reason: "unreadable_encoding",
    });
  });
});

describe("bounded ingestion", () => {
  it("caps a very large export and says so", () => {
    const huge = Array.from(
      { length: IIF_LIMITS.maxLines + 500 },
      (_, i) => `<Prompt name="P${i}" />`,
    ).join("\n");
    const parsed = parseIif(huge);
    expect(parsed.truncated).toBe(true);
    expect(parsed.lineCount).toBe(IIF_LIMITS.maxLines);

    const { coverage } = mapRecordsToStructure(parsed);
    expect(coverage.limitations.join(" ")).toMatch(/exceeded/i);
  });

  it("accounts for every line as recognised, unknown or ignorable", () => {
    const parsed = parseIif(INI_EXPORT);
    const unknownLines = new Set(parsed.unknowns.map((u) => u.line)).size;
    expect(parsed.recognizedLines + unknownLines + parsed.ignoredLines).toBe(parsed.lineCount);
  });
});

describe("duplicate + drift classification", () => {
  const existing = [
    { versionNumber: 1, contentFingerprint: "c1", structureFingerprint: "s1" },
    { versionNumber: 2, contentFingerprint: "c2", structureFingerprint: "s1" },
  ];

  it("identifies re-imports, cosmetic revisions and genuinely new content", () => {
    expect(
      classifyAgainstExisting({ contentFingerprint: "c1", structureFingerprint: "s1" }, existing),
    ).toEqual({ kind: "duplicate", matchedVersion: 1 });
    expect(
      classifyAgainstExisting({ contentFingerprint: "c9", structureFingerprint: "s1" }, existing),
    ).toEqual({ kind: "cosmetic_revision", matchedVersion: 1 });
    expect(
      classifyAgainstExisting({ contentFingerprint: "c9", structureFingerprint: "s9" }, existing),
    ).toEqual({ kind: "new" });
  });
});

describe("determinism and downstream reuse", () => {
  it("produces identical structure for identical input", () => {
    const a = importIif({ fileName: "a.iif", text: TAB_EXPORT, now: new Date(0) });
    const b = importIif({ fileName: "a.iif", text: TAB_EXPORT, now: new Date(0) });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("feeds the existing Phase 4 complexity scorer", () => {
    const result = importIif({ fileName: "a.iif", text: INI_EXPORT });
    const complexity = complexityForImport(result);
    expect(complexity).not.toBeNull();
    expect(complexity!.componentCount).toBeGreaterThan(0);
    expect(["simple", "moderate", "involved", "intricate"]).toContain(complexity!.band);
  });

  it("declares its recognition surface up front", () => {
    const matrix = recognitionMatrix();
    expect(matrix.length).toBeGreaterThan(5);
    expect(matrix.every((m) => ["recognized", "partial", "unrecognized"].includes(m.support))).toBe(
      true,
    );
    // Every "recognized" construct must actually map somewhere.
    expect(matrix.filter((m) => m.support === "recognized").every((m) => m.mapsTo)).toBe(true);
  });
});
