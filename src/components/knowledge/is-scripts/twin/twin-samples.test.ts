import { describe, expect, it } from "vitest";
import { manualDemoTwin } from "./twin-samples";
import {
  applyValue,
  createSimState,
  navigate,
  visibleElements,
} from "@/lib/script/twin/twin-simulation";

describe("Activation 7 — manual demo twin is honest and simulatable", () => {
  it("never claims real-export validation", () => {
    expect(manualDemoTwin().validatedAgainstRealExport).toBe(false);
  });

  it("drives progressive reveal by caller type", () => {
    const m = manualDemoTwin();
    let s = createSimState(m);
    expect(visibleElements(m, s).some((e) => e.id === "reason")).toBe(false);

    s = applyValue(m, s, "callerType", "patient");
    expect(visibleElements(m, s).some((e) => e.id === "reason")).toBe(true);
    expect(visibleElements(m, s).some((e) => e.id === "callback")).toBe(false);

    s = applyValue(m, s, "callerType", "provider");
    expect(visibleElements(m, s).some((e) => e.id === "callback")).toBe(true);
    expect(visibleElements(m, s).some((e) => e.id === "reason")).toBe(false);
  });

  it("labels reveal behaviour as inferred, never verified", () => {
    const reason = manualDemoTwin().screens[0]!.elements.find((e) => e.id === "reason")!;
    expect(reason.visibility?.provenance.evidence).toBe("inferred");
  });

  it("navigates to a defined review screen", () => {
    const m = manualDemoTwin();
    const s = navigate(m, createSimState(m), "nav:caller:next");
    expect(s.currentScreenId).toBe("screen:review");
  });
});
