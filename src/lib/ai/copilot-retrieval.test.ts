import { describe, it, expect } from "vitest";
import { planRetrieval, MAX_RETRIEVAL_BLOCKS, planIncludes } from "./copilot-retrieval";

describe("planRetrieval — question-driven context selection", () => {
  it("prioritizes resolutions for 'what fixed this before?'", () => {
    const plan = planRetrieval("What fixed this before?");
    expect(plan.blocks[0]).toBe("resolutions");
  });

  it("prioritizes patterns for recurrence questions", () => {
    expect(planRetrieval("why are we seeing this repeatedly?").blocks[0]).toBe("patterns");
  });

  it("prioritizes changes for 'what changed?'", () => {
    expect(planRetrieval("what changed on this account?").blocks[0]).toBe("changes");
  });

  it("prioritizes timeline for recent-history questions", () => {
    expect(planRetrieval("what happened recently?").blocks[0]).toBe("timeline");
  });

  it("prioritizes evidence when asked to show evidence", () => {
    expect(planRetrieval("show evidence for that").blocks[0]).toBe("evidence");
  });

  it("uses a lean default (not everything) when intent is unclear", () => {
    const plan = planRetrieval("hi");
    expect(plan.blocks).toEqual(["world_model", "current_work", "timeline"]);
    expect(plan.blocks.length).toBeLessThanOrEqual(MAX_RETRIEVAL_BLOCKS);
  });

  it("never exceeds the block budget", () => {
    for (const q of [
      "what should I investigate next?",
      "why does this keep happening and what fixed it",
    ]) {
      expect(planRetrieval(q).blocks.length).toBeLessThanOrEqual(MAX_RETRIEVAL_BLOCKS);
    }
  });

  it("planIncludes reflects the plan", () => {
    const plan = planRetrieval("what fixed this before?");
    expect(planIncludes(plan, "resolutions")).toBe(true);
    expect(planIncludes(plan, "changes")).toBe(false);
  });
});
