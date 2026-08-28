import { describe, it, expect } from "vitest";
import {
  isSuppressed,
  suppressedRadarIds,
  SUPPRESSING_FEEDBACK,
  type FeedbackKind,
  type IntelligenceFeedback,
} from "./intelligence-feedback";

function fb(targetId: string, kind: FeedbackKind): IntelligenceFeedback {
  return { id: targetId, targetType: "pattern", targetId, kind, at: 0 };
}

describe("intelligence feedback selectors", () => {
  it("useful feedback does not suppress", () => {
    const state = { byTarget: { a: fb("a", "useful") } };
    expect(isSuppressed(state, "a")).toBe(false);
  });

  it("not_relevant / incorrect / outdated / resolved suppress", () => {
    for (const kind of SUPPRESSING_FEEDBACK) {
      expect(isSuppressed({ byTarget: { a: fb("a", kind) } }, "a")).toBe(true);
    }
  });

  it("suppressedRadarIds collects only suppressing targets", () => {
    const state = {
      byTarget: {
        a: fb("a", "useful"),
        b: fb("b", "not_relevant"),
        c: fb("c", "incorrect"),
      },
    };
    expect(suppressedRadarIds(state)).toEqual(new Set(["b", "c"]));
  });

  it("unknown target is not suppressed", () => {
    expect(isSuppressed({ byTarget: {} }, "missing")).toBe(false);
  });
});
