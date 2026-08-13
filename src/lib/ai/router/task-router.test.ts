import { beforeEach, describe, expect, it } from "vitest";
import { routeTask, escalateRoute, degradationNotice } from "./task-router";
import {
  MODEL_REGISTRY,
  reportModelFailure,
  resetModelHealth,
  selectModel,
  type ModelProfile,
} from "./model-registry";
import { buildContext } from "./context-builder";
import { CONTEXT_BUDGETS } from "./routing-policy";
import { classifyOperatorMessage, detectDeterministicIntent } from "./deterministic-intercept";
import { clearRoutingTelemetry, recordRouting, routingTelemetry } from "./telemetry";

const caps = (over: Partial<ModelProfile["capabilities"]> = {}) => ({
  tools: true,
  vision: false,
  structuredOutput: true,
  streaming: true,
  longContext: false,
  ...over,
});

beforeEach(() => {
  resetModelHealth();
  clearRoutingTelemetry();
});

describe("routing policy", () => {
  it("routes navigation and exact lookup deterministically", () => {
    expect(routeTask({ kind: "navigation" }).route).toBe("deterministic");
    expect(routeTask({ kind: "lookup" }).reasonCode).toBe("EXACT_LOOKUP");
    expect(routeTask({ kind: "lookup" }).modelId).toBeUndefined();
  });

  it("routes search execution deterministically", () => {
    expect(routeTask({ kind: "search" }).route).toBe("deterministic");
  });

  it("routes classification and extraction to FAST", () => {
    expect(routeTask({ kind: "classification" }).tier).toBe("fast");
    expect(routeTask({ kind: "extraction" }).tier).toBe("fast");
  });

  it("routes routine summaries and grounded Q&A to BALANCED", () => {
    expect(routeTask({ kind: "summary" }).tier).toBe("balanced");
    expect(routeTask({ kind: "operational_question" }).tier).toBe("balanced");
  });

  it("routes multi-source investigation and pattern analysis to FLAGSHIP", () => {
    expect(routeTask({ kind: "account_investigation" }).tier).toBe("flagship");
    expect(routeTask({ kind: "pattern_analysis" }).reasonCode).toBe("MULTI_SOURCE_REASONING");
  });
});

describe("capability matching", () => {
  const noVision: ModelProfile[] = [
    { id: "m-fast", provider: "t", tier: "fast", capabilities: caps(), enabled: true, priority: 10 },
    { id: "m-bal", provider: "t", tier: "balanced", capabilities: caps(), enabled: true, priority: 10 },
  ];

  it("fails clearly when no model has vision", () => {
    const d = routeTask({ kind: "vision_analysis", registry: noVision });
    expect(d.reasonCode).toBe("NO_MODEL_AVAILABLE");
    expect(d.error).toBeTruthy();
  });

  it("excludes models without tools", () => {
    const registry: ModelProfile[] = [
      { id: "notools", provider: "t", tier: "balanced", capabilities: caps({ tools: false }), enabled: true, priority: 99 },
      { id: "tools", provider: "t", tier: "balanced", capabilities: caps(), enabled: true, priority: 1 },
    ];
    const d = routeTask({ kind: "operational_question", registry });
    expect(d.modelId).toBe("tools");
  });

  it("never selects a disabled model", () => {
    const registry: ModelProfile[] = [
      { id: "off", provider: "t", tier: "fast", capabilities: caps(), enabled: false, priority: 99 },
      { id: "on", provider: "t", tier: "fast", capabilities: caps(), enabled: true, priority: 1 },
    ];
    expect(selectModel("fast", {}, registry)?.id).toBe("on");
  });

  it("honours configured priority", () => {
    expect(selectModel("flagship")?.id).toBe("openai/gpt-5.6-sol");
    expect(selectModel("balanced")?.id).toBe("openai/gpt-5.6-terra");
  });

  it("manual override cannot violate a hard capability requirement", () => {
    const registry: ModelProfile[] = [
      { id: "fast-novision", provider: "t", tier: "fast", capabilities: caps(), enabled: true, priority: 10 },
      { id: "bal-vision", provider: "t", tier: "balanced", capabilities: caps({ vision: true }), enabled: true, priority: 10 },
    ];
    const d = routeTask({ kind: "vision_analysis", override: "fast", registry });
    expect(d.modelId).toBe("bal-vision");
  });
});

describe("fallback and health", () => {
  it("falls back to another model in the tier after repeated failures", () => {
    const registry: ModelProfile[] = [
      { id: "primary", provider: "t", tier: "balanced", capabilities: caps(), enabled: true, priority: 99 },
      { id: "secondary", provider: "t", tier: "balanced", capabilities: caps(), enabled: true, priority: 1 },
    ];
    reportModelFailure("primary");
    reportModelFailure("primary");
    reportModelFailure("primary");
    expect(routeTask({ kind: "summary", registry }).modelId).toBe("secondary");
  });

  it("falls back across tiers and reports the degradation", () => {
    const registry: ModelProfile[] = [
      { id: "bal", provider: "t", tier: "balanced", capabilities: caps(), enabled: true, priority: 10 },
    ];
    const d = routeTask({ kind: "account_investigation", registry });
    expect(d.tier).toBe("balanced");
    expect(d.degradedFrom).toBe("flagship");
    expect(d.reasonCode).toBe("FALLBACK_TIER");
    expect(degradationNotice(d)).toMatch(/standard reasoning path/i);
  });

  it("fast tasks declare a balanced fallback tier", () => {
    expect(routeTask({ kind: "classification" }).fallbackTier).toBe("balanced");
  });
});

describe("escalation", () => {
  it("escalates FAST to BALANCED on invalid structured output", () => {
    const first = routeTask({ kind: "classification" });
    const next = escalateRoute(first, "invalid_output");
    expect(next.tier).toBe("balanced");
    expect(next.reasonCode).toBe("ESCALATED");
  });

  it("does not escalate a successful route by itself", () => {
    const d = routeTask({ kind: "summary" });
    expect(d.tier).toBe("balanced");
    expect(d.reasonCode).not.toBe("ESCALATED");
  });

  it("does not escalate past flagship", () => {
    const d = routeTask({ kind: "pattern_analysis" });
    expect(escalateRoute(d, "conflicting_evidence").tier).toBe("flagship");
  });
});

describe("deterministic-first interception", () => {
  it("intercepts open account / open ticket", () => {
    expect(detectDeterministicIntent("Open account 4821")).toMatchObject({
      intercept: "open_account",
      target: "4821",
      taskKind: "navigation",
    });
    expect(detectDeterministicIntent("open ticket 123")?.intercept).toBe("open_ticket");
  });

  it("intercepts shift context and night plan questions without a model", () => {
    const work = detectDeterministicIntent("What ticket am I working on?");
    expect(work?.intercept).toBe("current_work");
    expect(routeTask({ kind: work!.taskKind }).route).toBe("deterministic");

    const plan = detectDeterministicIntent("How many Must items remain in the night plan?");
    expect(plan?.intercept).toBe("night_plan_state");
    expect(routeTask({ kind: plan!.taskKind }).modelId).toBeUndefined();
  });

  it("routes 'have we seen this before' to deterministic retrieval first", () => {
    const hit = detectDeterministicIntent("Have we dealt with this before?");
    expect(hit?.intercept).toBe("search_prior_work");
    expect(routeTask({ kind: "search" }).route).toBe("deterministic");
  });

  it("classifies open-ended messages deterministically", () => {
    expect(classifyOperatorMessage("Summarize the account's recent activity")).toBe("summary");
    expect(classifyOperatorMessage("Classify this as programming or customer service")).toBe(
      "classification",
    );
    expect(
      classifyOperatorMessage("Compare these five similar incidents and find the most likely cause"),
    ).toBe("pattern_analysis");
    expect(
      classifyOperatorMessage("Explain this IS documentation and why the script keeps failing"),
    ).toBe("knowledge_interpretation");
    expect(classifyOperatorMessage("who is on call tonight")).toBe("operational_question");
  });
});

describe("context budgeting and privacy", () => {
  it("FAST gets no account context and no evidence", () => {
    const built = buildContext(
      { accountContext: "acct", shiftContext: "shift", evidence: ["e1", "e2"], structured: "s" },
      CONTEXT_BUDGETS.fast,
    );
    expect(built.text).not.toContain("acct");
    expect(built.includedEvidence).toBe(0);
  });

  it("higher tiers get more room but the same allowed fields", () => {
    const parts = { accountContext: "acct", shiftContext: "shift", evidence: Array.from({ length: 20 }, (_, i) => `e${i}`) };
    const bal = buildContext(parts, CONTEXT_BUDGETS.balanced);
    const flag = buildContext(parts, CONTEXT_BUDGETS.flagship);
    expect(bal.includedEvidence).toBe(5);
    expect(flag.includedEvidence).toBe(12);
    expect(Object.keys(parts)).toEqual(["accountContext", "shiftContext", "evidence"]);
  });

  it("telemetry records routing shape only", () => {
    recordRouting({
      at: new Date().toISOString(),
      taskKind: "summary",
      tier: "balanced",
      modelId: "m",
      reasonCode: "ROUTINE_GENERATION",
      fallbackUsed: false,
      success: true,
    });
    const entry = routingTelemetry()[0]!;
    const serialized = JSON.stringify(entry);
    expect(serialized).not.toMatch(/prompt|response|content|messages/i);
    expect(entry.taskKind).toBe("summary");
  });
});

describe("routing evaluation matrix", () => {
  const matrix: Array<[string, string]> = [
    ["Open account 4821", "deterministic"],
    ["Classify this as programming or customer service", "fast"],
    ["Summarize the account's recent activity", "balanced"],
    ["Have we dealt with this before?", "deterministic"],
    ["Compare these five similar incidents and determine the most likely common cause", "flagship"],
    ["Explain this complex IS documentation in relation to the current ticket", "flagship"],
  ];

  it.each(matrix)("%s -> %s", (message, expected) => {
    const intercept = detectDeterministicIntent(message);
    const kind = intercept ? intercept.taskKind : classifyOperatorMessage(message);
    expect(routeTask({ kind }).tier).toBe(expected);
  });

  it("every registry model is reachable through some tier", () => {
    for (const tier of ["fast", "balanced", "flagship"] as const) {
      expect(MODEL_REGISTRY.some((m) => m.tier === tier && m.enabled)).toBe(true);
    }
  });
});