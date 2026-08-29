/**
 * Phase 9 — AgentRunInspector observability + privacy tests.
 *
 * The critical invariants:
 *   - no private chain-of-thought is ever rendered
 *   - a Guardian BLOCK stays a BLOCK
 *   - worker disagreement never becomes consensus
 *   - a direct response never reads as a failed orchestration
 *   - loop / budget stop reasons are visible
 *   - canonical claim-validation failures are inspectable
 */

import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { AgentRunInspector } from "./AgentRunInspector";
import { FIXTURES, fixtureOutput, fixtureRun } from "@/lib/cognitive/run-fixtures";
import {
  cognitiveRunStore,
  filterRuns,
  runStatusLabel,
  summarizeRun,
  visibleRuns,
  MAX_RETAINED_RUNS,
} from "@/lib/cognitive/run-store";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: unknown }) => children as never,
}));

function render(run = fixtureRun()): string {
  return renderToStaticMarkup(<AgentRunInspector run={run} />);
}

describe("AgentRunInspector — run summary", () => {
  it("renders correlation id, status, tier and stop reason", () => {
    const html = render();
    expect(html).toContain("corr-1");
    expect(html).toContain("COMPLETED");
    expect(html).toContain("DEEP COGNITION");
    expect(html).toContain("Run summary");
  });

  it("maps canonical run states to operator status labels", () => {
    expect(runStatusLabel("partial")).toBe("PARTIAL");
    expect(runStatusLabel("blocked")).toBe("BLOCKED");
    expect(runStatusLabel("cancelled")).toBe("CANCELLED");
  });
});

describe("routing", () => {
  it("shows the deterministic route reason and skipped workers", () => {
    const html = render();
    expect(html).toContain("Causal question over canonical investigation state.");
    expect(html).toContain("Not invoked");
    expect(html).toContain("FORECASTER");
    expect(html).toContain("No future-state question was detected in the request.");
  });

  it("renders a direct response as a success, not a failed orchestration", () => {
    const html = render(FIXTURES.directResponse());
    expect(html).toContain("DIRECT RESPONSE");
    expect(html).toContain("no specialist cognition was required");
    expect(html).not.toContain("FAILED");
    expect(html).toContain("No worker waves");
  });
});

describe("execution waves", () => {
  it("groups parallel workers into one wave and keeps dependent work later", () => {
    const html = render(FIXTURES.multiWorker());
    expect(html).toContain("Wave 1");
    expect(html).toContain("Wave 2");
    expect(html).toContain("Parallel independent reads.");
    expect(html).toContain("ASSEMBLER");
  });
});

describe("worker cards and structured output", () => {
  it("shows worker id, version and status", () => {
    const html = render();
    expect(html).toContain("INVESTIGATOR");
    expect(html).toContain("v1");
    expect(html).toContain("CONTRIBUTED");
  });

  it("marks unavailable workers without collapsing the run into FAILED", () => {
    const run = FIXTURES.workerUnavailable();
    const html = render(run);
    expect(html).toContain("UNAVAILABLE");
    expect(html).toContain("PARTIAL");
    expect(html).toContain("Worker failures");
  });
});

describe("claim validation", () => {
  it("reports valid canonical references", () => {
    expect(render()).toContain("VALID");
  });

  it("makes rejected canonical references inspectable", () => {
    const html = render(FIXTURES.claimValidationFailure());
    expect(html).toContain("REJECTED");
    expect(html).toContain("UNKNOWN REFERENCE");
    expect(html).toContain("forecast:abc123");
  });
});

describe("critic", () => {
  it("shows no material issue when the critique was clean", () => {
    const html = render(FIXTURES.criticNoIssue());
    expect(html).toContain("CRITIC USED");
    expect(html).toContain("NO MATERIAL ISSUE");
    expect(html).toContain("REVISION PASSES 0 / 1");
  });

  it("shows the bounded revision pass when one occurred", () => {
    const html = render(FIXTURES.criticRevision());
    expect(html).toContain("CAUSAL OVERREACH");
    expect(html).toContain("REVISION PASSES 1 / 1");
    expect(html).toContain("Bounded revision pass applied");
  });

  it("shows an unresolved material issue instead of silently looping", () => {
    const html = render(FIXTURES.criticUnresolved());
    expect(html).toContain("UNRESOLVED");
    expect(html).toContain("MISSING EVIDENCE");
  });
});

describe("guardian", () => {
  it("renders an ALLOW decision with its reason codes", () => {
    const html = render(FIXTURES.guardianAllow());
    expect(html).toContain("ALLOW");
    expect(html).toContain("READ ONLY CONTRIBUTION");
  });

  it("keeps a BLOCK a BLOCK", () => {
    const html = render(FIXTURES.guardianBlock());
    expect(html).toContain("BLOCK");
    expect(html).toContain("script.deploy");
    expect(html).not.toContain("Guardian agrees");
  });

  it("makes fail-closed Guardian unavailability unmistakable", () => {
    const html = render(FIXTURES.guardianUnavailable());
    expect(html).toContain("GUARDIAN UNAVAILABLE — FAILED CLOSED");
    expect(html).toContain("BLOCKED");
    expect(html).toContain("never continues ungoverned");
  });
});

describe("disagreement", () => {
  it("preserves disagreement rather than presenting consensus", () => {
    const html = render(FIXTURES.disagreement());
    expect(html).toContain("historical resolutions favour B");
    expect(html).toContain("multiple plausible explanations remain");
    expect(html).not.toContain("consensus reached");
  });
});

describe("budgets and stop reasons", () => {
  it("shows budget consumption against limits", () => {
    const html = render();
    expect(html).toContain("Worker invocations");
    expect(html).toContain("2 / 6");
  });

  it("shows loop detection with a safe fingerprint identifier", () => {
    const html = render(FIXTURES.loopDetected());
    expect(html).toContain("LOOP DETECTED");
    expect(html).toContain("fp-investigator-1");
  });

  it("shows budget exhaustion", () => {
    const html = render(FIXTURES.budgetExhausted());
    expect(html).toContain("BUDGET EXHAUSTED");
    expect(html).toContain("INVOCATION BUDGET EXCEEDED");
  });

  it("shows no-progress stops distinctly", () => {
    const html = render(fixtureRun({ stopReason: "no_progress", state: "partial" }));
    expect(html).toContain("NO PROGRESS");
    expect(html).toContain("no new validated claims");
  });

  it("does not collapse PARTIAL into FAILED", () => {
    const html = render(FIXTURES.partial());
    expect(html).toContain("PARTIAL — not a failure.");
  });
});

describe("prompt injection, sensitivity and versions", () => {
  it("marks instruction-like retrieved content without reproducing it", () => {
    const html = render(FIXTURES.promptInjectionRejected());
    expect(html).toContain("RETRIEVED CONTENT TREATED AS DATA");
    expect(html).toContain("INSTRUCTION_OVERRIDE");
    expect(html).not.toContain("ignore all previous instructions");
  });

  it("shows the run sensitivity class", () => {
    expect(render()).toContain("INTERNAL");
  });

  it("shows the worker versions used at run time", () => {
    const html = render();
    expect(html).toContain("ORCHESTRATOR v1");
    expect(html).toContain("ASSEMBLER v1");
  });

  it("renders the cognitive lifecycle timeline", () => {
    const html = render();
    expect(html).toContain("Cognitive timeline");
    expect(html).toContain("Run started");
  });
});

describe("privacy boundary", () => {
  it("never renders private scratch reasoning, prompts or raw bodies", () => {
    const run = fixtureRun({
      contributions: [
        fixtureOutput("investigator", {
          summary: "Structured summary only.",
          notes: ["internal scratch note that must never surface"],
        }),
      ],
    });
    const html = render(run);
    expect(html).not.toContain("internal scratch note");
    expect(html).not.toContain("system prompt");
    expect(html).not.toContain("chain-of-thought");
  });

  it("escapes untrusted worker text instead of rendering HTML", () => {
    const base = fixtureRun();
    const run = fixtureRun({
      response: { ...base.response!, answer: "<img src=x onerror=alert(1)>" },
    });
    const html = render(run);
    expect(html).not.toContain("<img src=x");
    expect(html).toContain("&lt;img");
  });
});

describe("run store: scoping, retention, filters", () => {
  it("scopes runs to the owning operator unless the viewer is an admin", () => {
    const mine = fixtureRun({ correlationId: "a", operatorRef: "op-1" });
    const theirs = fixtureRun({ correlationId: "b", operatorRef: "op-2" });
    expect(visibleRuns([mine, theirs], "op-1", false).map((r) => r.correlationId)).toEqual(["a"]);
    expect(visibleRuns([mine, theirs], "op-1", true)).toHaveLength(2);
  });

  it("bounds retention and keeps the newest runs", () => {
    cognitiveRunStore.clear();
    for (let i = 0; i < MAX_RETAINED_RUNS + 5; i += 1) {
      cognitiveRunStore.record(fixtureRun({ correlationId: `c-${i}` }));
    }
    const list = cognitiveRunStore.list();
    expect(list).toHaveLength(MAX_RETAINED_RUNS);
    expect(list[0].correlationId).toBe(`c-${MAX_RETAINED_RUNS + 4}`);
    cognitiveRunStore.clear();
  });

  it("summarizes runs without hydrating contributions", () => {
    const s = summarizeRun(FIXTURES.multiWorker());
    expect(s.workers).toEqual(["investigator", "researcher", "simulator"]);
    expect(s.route).toContain("INVESTIGATOR");
    expect(Object.keys(s)).not.toContain("contributions");
  });

  it("filters by status, worker, guardian decision and free text", () => {
    const list = [FIXTURES.guardianBlock(), FIXTURES.directResponse()].map(summarizeRun);
    expect(filterRuns(list, { status: "blocked" })).toHaveLength(1);
    expect(filterRuns(list, { guardianDecision: "BLOCK" })).toHaveLength(1);
    expect(filterRuns(list, { worker: "investigator" })).toHaveLength(1);
    expect(filterRuns(list, { query: "corr-direct" })).toHaveLength(1);
  });
});
