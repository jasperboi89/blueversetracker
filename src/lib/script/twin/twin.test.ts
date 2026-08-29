import { describe, expect, it } from "vitest";
import { weakestEvidence, isTrustworthy, byEvidenceRank, EVIDENCE_STATES } from "./evidence-state";
import { normalizeModel, screenEvidenceStates, type TwinScriptModel } from "./twin-model";
import {
  createSimState,
  applyValue,
  navigate,
  visibleElements,
  pendingReveals,
  isElementVisible,
  summarizeSim,
  clearValue,
} from "./twin-simulation";
import { buildTwinFromStructure } from "./twin-from-structure";
import type { ScriptStructure } from "../script-contract";

function sampleModel(): TwinScriptModel {
  return normalizeModel({
    scriptId: "s1",
    title: "Intake",
    entryScreenId: "screen:a",
    validatedAgainstRealExport: false,
    screens: [
      {
        id: "screen:a",
        title: "Caller",
        provenance: { source: "MANUAL", evidence: "observed" },
        navigation: [
          {
            id: "nav:next",
            label: "Next",
            toScreenId: "screen:b",
            provenance: { source: "MANUAL", evidence: "verified" },
          },
          {
            id: "nav:bad",
            label: "Bad",
            toScreenId: "screen:missing",
            provenance: { source: "MANUAL", evidence: "unknown" },
          },
        ],
        elements: [
          {
            id: "callerType",
            type: "combo",
            label: "Caller type",
            order: 0,
            provenance: { source: "MANUAL", evidence: "verified" },
            options: [
              {
                value: "patient",
                label: "Patient",
                provenance: { source: "MANUAL", evidence: "verified" },
              },
              {
                value: "provider",
                label: "Provider",
                provenance: { source: "MANUAL", evidence: "verified" },
              },
            ],
          },
          {
            id: "reason",
            type: "text",
            label: "Reason",
            order: 1,
            provenance: { source: "INFERRED", evidence: "inferred" },
            visibility: {
              whenElementId: "callerType",
              equals: ["patient"],
              provenance: { source: "INFERRED", evidence: "inferred" },
            },
          },
          {
            id: "note",
            type: "readonly",
            label: "Note",
            order: 2,
            readOnly: true,
            value: "n/a",
            provenance: { source: "MANUAL", evidence: "observed" },
          },
        ],
      },
      {
        id: "screen:b",
        title: "Confirm",
        provenance: { source: "MANUAL", evidence: "observed" },
        navigation: [],
        elements: [],
      },
    ],
  });
}

describe("Activation 7 — evidence-state vocabulary", () => {
  it("has all seven honest states", () => {
    expect(EVIDENCE_STATES).toHaveLength(7);
  });
  it("only verified reads as trustworthy", () => {
    expect(isTrustworthy("verified")).toBe(true);
    expect(isTrustworthy("observed")).toBe(false);
    expect(isTrustworthy("inferred")).toBe(false);
  });
  it("a summary is never more confident than its weakest part", () => {
    expect(weakestEvidence(["verified", "unknown"])).toBe("unknown");
    expect(weakestEvidence(["verified", "observed"])).toBe("observed");
    expect(weakestEvidence([])).toBe("unknown");
  });
  it("sorts best-known first", () => {
    expect(byEvidenceRank("verified", "inferred")).toBeLessThan(0);
  });
});

describe("Activation 7 — Script Twin simulation is bounded, isolated and honest", () => {
  it("hides conditional controls until their rule is satisfied (progressive reveal)", () => {
    const model = sampleModel();
    const st = createSimState(model);
    const reason = model.screens[0]!.elements.find((e) => e.id === "reason")!;
    expect(isElementVisible(reason, st.values)).toBe(false);
    expect(visibleElements(model, st)).toHaveLength(2);
    expect(pendingReveals(model, st)).toHaveLength(1);
  });

  it("reveals a control only when the controlling value matches, and hides it again", () => {
    const model = sampleModel();
    let st = createSimState(model);
    st = applyValue(model, st, "callerType", "patient");
    expect(visibleElements(model, st).some((e) => e.id === "reason")).toBe(true);
    st = applyValue(model, st, "callerType", "provider");
    expect(visibleElements(model, st).some((e) => e.id === "reason")).toBe(false);
  });

  it("ignores values for hidden or read-only elements", () => {
    const model = sampleModel();
    let st = createSimState(model);
    st = applyValue(model, st, "reason", "x"); // hidden
    expect(st.values.reason).toBeUndefined();
    st = applyValue(model, st, "note", "y"); // read-only
    expect(st.values.note).toBeUndefined();
  });

  it("navigates only to defined screens via declared links", () => {
    const model = sampleModel();
    const st = createSimState(model);
    expect(navigate(model, st, "nav:next").currentScreenId).toBe("screen:b");
    expect(navigate(model, st, "nav:bad").currentScreenId).toBe("screen:a"); // target undefined
    expect(navigate(model, st, "nav:nope")).toBe(st); // link undefined
  });

  it("never mutates the model or the prior state (twin isolation)", () => {
    const model = sampleModel();
    const st = createSimState(model);
    applyValue(model, st, "callerType", "patient");
    expect(model.screens).toHaveLength(2);
    expect(Object.keys(st.values)).toHaveLength(0);
  });

  it("summarizes current simulated state safely", () => {
    const model = sampleModel();
    let st = createSimState(model);
    st = applyValue(model, st, "callerType", "patient");
    st = applyValue(model, st, "reason", "appt");
    const sum = summarizeSim(model, st);
    expect(sum.currentScreenTitle).toBe("Caller");
    expect(sum.filledCount).toBe(2);
    expect(clearValue(st, "callerType").values.callerType).toBeUndefined();
  });

  it("exposes distinct evidence states for a screen-level badge", () => {
    const model = sampleModel();
    expect(screenEvidenceStates(model.screens[0]!)).toContain("inferred");
  });
});

describe("Activation 7 — Twin from recognised structure stays honest", () => {
  const structure: ScriptStructure = {
    lineCount: 10,
    recognizedLines: 8,
    unknowns: [],
    components: [
      {
        id: "section:intro",
        kind: "section",
        name: "Intro",
        key: "intro",
        line: 1,
        occurrences: 1,
      },
      {
        id: "prompt:greeting",
        kind: "prompt",
        name: "Greeting",
        key: "greeting",
        line: 2,
        occurrences: 1,
      },
      { id: "field:name", kind: "field", name: "Name", key: "name", line: 3, occurrences: 1 },
      {
        id: "section:dispatch",
        kind: "section",
        name: "Dispatch",
        key: "dispatch",
        line: 5,
        occurrences: 1,
      },
      {
        id: "branch:oncall",
        kind: "branch",
        name: "OnCall",
        key: "oncall",
        line: 6,
        occurrences: 1,
      },
    ],
    dependencies: [
      {
        id: "d1",
        kind: "branches_to",
        fromId: "branch:oncall",
        toKey: "missing",
        resolution: "unresolved",
        line: 6,
      },
    ],
  };

  it("projects sections to screens without claiming real-export validation", () => {
    const twin = buildTwinFromStructure(structure, { scriptId: "sc1", title: "Sample" });
    expect(twin.validatedAgainstRealExport).toBe(false);
    expect(twin.screens).toHaveLength(2);
    expect(twin.screens[0]!.elements).toHaveLength(2);
  });

  it("marks a component with an unresolved dependency as partial, never verified", () => {
    const twin = buildTwinFromStructure(structure, { scriptId: "sc1", title: "Sample" });
    const oncall = twin.screens[1]!.elements.find((e) => e.id === "branch:oncall")!;
    expect(oncall.provenance.evidence).toBe("partial");
    expect(oncall.provenance.source).toBe("STRUCTURAL_IMPORT");
  });
});
