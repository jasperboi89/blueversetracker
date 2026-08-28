import { describe, it, expect } from "vitest";
import {
  capabilityAutonomy,
  isWithinPhase3AiAutonomy,
  MAX_AI_AUTONOMY_PHASE3,
  type CapabilityConfirmation,
  type CapabilityOperation,
} from "./capability-contract";

function def(
  operation: CapabilityOperation,
  mode: CapabilityConfirmation = "none",
  autonomy?: never,
) {
  return { operation, confirmation: { mode }, ...(autonomy ? { autonomy } : {}) } as const;
}

describe("capabilityAutonomy derivation", () => {
  it("read/search → observe, analyze → explain, prepare → prepare", () => {
    expect(capabilityAutonomy(def("read"))).toBe("observe");
    expect(capabilityAutonomy(def("search"))).toBe("observe");
    expect(capabilityAutonomy(def("analyze"))).toBe("explain");
    expect(capabilityAutonomy(def("prepare"))).toBe("prepare");
  });

  it("mutating ops land above the Phase 3 AI ceiling", () => {
    expect(capabilityAutonomy(def("update", "none"))).toBe("execute_safe");
    expect(capabilityAutonomy(def("update", "explicit"))).toBe("supervised");
    expect(capabilityAutonomy(def("execute", "explicit_high_risk"))).toBe("supervised");
  });

  it("blocked confirmation caps at observe", () => {
    expect(capabilityAutonomy(def("execute", "blocked"))).toBe("observe");
  });

  it("declared autonomy wins over derivation", () => {
    expect(
      capabilityAutonomy({
        operation: "read",
        confirmation: { mode: "none" },
        autonomy: "recommend",
      }),
    ).toBe("recommend");
  });

  it("Phase 3 gate lets AI observe/explain/recommend/prepare but not execute", () => {
    expect(isWithinPhase3AiAutonomy("observe")).toBe(true);
    expect(isWithinPhase3AiAutonomy("recommend")).toBe(true);
    expect(isWithinPhase3AiAutonomy(MAX_AI_AUTONOMY_PHASE3)).toBe(true);
    expect(isWithinPhase3AiAutonomy("execute_safe")).toBe(false);
    expect(isWithinPhase3AiAutonomy("supervised")).toBe(false);
    expect(isWithinPhase3AiAutonomy("narrow_autonomous")).toBe(false);
  });
});
