import { describe, it, expect } from "vitest";
import { redactForOperator, type AiTraceRecord } from "./ai-trace";

const full: AiTraceRecord = {
  id: "t1",
  at: 123,
  ok: true,
  taskClass: "copilot_chat",
  provider: "anthropic",
  model: "claude-x",
  templateVersion: "v2",
  latencyMs: 900,
  tokensIn: 1200,
  tokensOut: 300,
  costUsd: 0.01,
  sensitivity: "internal",
  accountId: "7431",
  correlationId: "abc",
};

describe("redactForOperator", () => {
  it("strips provider/model/token/cost for everyday UI", () => {
    const view = redactForOperator(full);
    expect(view).toEqual({
      id: "t1",
      at: 123,
      ok: true,
      taskClass: "copilot_chat",
      latencyMs: 900,
      sensitivity: "internal",
    });
    expect("provider" in view).toBe(false);
    expect("model" in view).toBe(false);
    expect("tokensIn" in view).toBe(false);
    expect("costUsd" in view).toBe(false);
    expect("accountId" in view).toBe(false);
  });

  it("omits latency when unknown", () => {
    const view = redactForOperator({ ...full, latencyMs: undefined });
    expect("latencyMs" in view).toBe(false);
  });
});
