import { describe, expect, it } from "vitest";
import { runAgent, type AgentInvocationOutput } from "./agent-runtime";
import type { AgentIntent } from "./agent-contract";
import { intentFingerprint } from "./agent-fingerprint";
import type { EvidenceFact } from "@/lib/core/evidence-contract";

const operator = { role: "admin" as const, userId: "u1" };

function ok(summary: string, facts?: EvidenceFact[]): AgentInvocationOutput {
  return { status: "success", summary, ...(facts ? { facts } : {}) };
}

function base(reason: AgentIntent[] | ((cycle: number) => AgentIntent)) {
  const script = Array.isArray(reason) ? reason : null;
  return {
    mode: "investigate" as const,
    objective: "Find out what is blocking ticket 42",
    contextRef: "ctx:test",
    operator,
    allowedCapabilityIds: ["freshdesk.ticket.read", "knowledge.search"],
    emitEvents: false,
    reason: ({ cycle }: { cycle: number }) =>
      script ? (script[cycle - 1] ?? { kind: "stop" as const }) : (reason as (c: number) => AgentIntent)(cycle),
    invoke: () => ok("ticket 42 is open"),
  };
}

describe("bounded agent runtime", () => {
  it("completes when the reasoner answers", async () => {
    const run = await runAgent(
      base([
        { kind: "invoke_capability", capabilityId: "freshdesk.ticket.read", input: { ticketNumber: "42" } },
        { kind: "answer", answer: "Ticket 42 is still open." },
      ]),
    );
    expect(run.state).toBe("completed");
    expect(run.stopReason).toBe("answered");
    expect(run.observations).toHaveLength(1);
    expect(run.usage.capabilityCalls).toBe(1);
  });

  it("allows at most one capability invocation per cycle", async () => {
    const run = await runAgent(
      base([
        { kind: "invoke_capability", capabilityId: "freshdesk.ticket.read", input: { ticketNumber: "1" } },
        { kind: "invoke_capability", capabilityId: "freshdesk.ticket.read", input: { ticketNumber: "2" } },
        { kind: "answer", answer: "done" },
      ]),
    );
    expect(run.usage.cycles).toBe(3);
    expect(run.usage.capabilityCalls).toBe(2);
    expect(run.cycles.filter((c) => c.capabilityId).length).toBe(2);
  });

  it("detects a repeated reasoning step as a loop", async () => {
    const step: AgentIntent = {
      kind: "invoke_capability",
      capabilityId: "freshdesk.ticket.read",
      input: { ticketNumber: "42" },
    };
    const run = await runAgent(base([step, step]));
    expect(run.state).toBe("blocked");
    expect(run.stopReason).toBe("loop_detected");
  });

  it("halts when consecutive cycles add no new information", async () => {
    let n = 0;
    const run = await runAgent({
      ...base(() => ({
        kind: "invoke_capability",
        capabilityId: "freshdesk.ticket.read",
        // Different input each cycle so it is not loop detection.
        input: { ticketNumber: String(++n) },
      })),
      // Same observation fingerprint every time => no progress.
      invoke: () => ok("identical result"),
    });
    expect(run.stopReason).toBe("no_progress");
  });

  it("stops at the cycle budget instead of spinning", async () => {
    let n = 0;
    const run = await runAgent({
      ...base(() => ({
        kind: "invoke_capability",
        capabilityId: "freshdesk.ticket.read",
        input: { ticketNumber: String(++n) },
      })),
      invoke: () => ok(`result ${n}`),
      budget: { maxCycles: 3, maxNoProgressCycles: 99 },
    });
    expect(run.state).toBe("blocked");
    expect(run.stopReason).toBe("cycle_budget_exceeded");
    expect(run.usage.cycles).toBe(3);
  });

  it("refuses a capability that was not resolved as available", async () => {
    const run = await runAgent({
      ...base([
        { kind: "invoke_capability", capabilityId: "night_plan.item.create", input: {} },
        { kind: "invoke_capability", capabilityId: "night_plan.item.create", input: { task: "x" } },
      ]),
      budget: { maxNoProgressCycles: 2 },
    });
    expect(run.stopReason).toBe("capability_blocked");
    expect(run.usage.capabilityCalls).toBe(0);
    expect(run.cycles[0]?.blocked?.reasonCodes).toContain("NOT_RELEVANT_TO_CONTEXT");
  });

  it("ends a prepare_action run awaiting operator confirmation, never executing", async () => {
    const run = await runAgent({
      ...base([
        { kind: "propose_action", actionType: "add_night_plan_item", payload: { task: "Check backups" } },
      ]),
      mode: "prepare_action",
    });
    expect(run.state).toBe("awaiting_confirmation");
    expect(run.proposal?.requiresOperatorConfirmation).toBe(true);
    expect(run.usage.capabilityCalls).toBe(0);
  });

  it("rejects a write proposal from an investigation run", async () => {
    const run = await runAgent(
      base([{ kind: "propose_action", actionType: "add_night_plan_item", payload: { task: "x" } }]),
    );
    expect(run.state).toBe("blocked");
    expect(run.stopReason).toBe("invalid_intent");
  });

  it("withholds facts that are not safe for operational guidance", async () => {
    const unsafe: EvidenceFact = {
      id: "f1",
      subject: { type: "ticket", id: "42" },
      predicate: "root_cause",
      value: "probably DNS",
      origin: "generated",
      confidence: "unknown",
      source: { type: "copilot" },
      recordedAt: new Date().toISOString(),
      status: "active",
    };
    const safe: EvidenceFact = { ...unsafe, id: "f2", origin: "observed", confidence: "verified", source: { type: "freshdesk" } };
    const run = await runAgent({
      ...base([
        { kind: "invoke_capability", capabilityId: "freshdesk.ticket.read", input: { ticketNumber: "42" } },
        { kind: "answer", answer: "done" },
      ]),
      invoke: () => ok("ticket read", [unsafe, safe]),
    });
    const obs = run.observations[0]!;
    expect(obs.facts.map((f) => f.id)).toEqual(["f2"]);
    expect(obs.withheldFacts.map((f) => f.id)).toEqual(["f1"]);
  });

  it("threads one correlation id through the whole run", async () => {
    const seen: string[] = [];
    const run = await runAgent({
      ...base([
        { kind: "invoke_capability", capabilityId: "freshdesk.ticket.read", input: { ticketNumber: "42" } },
        { kind: "answer", answer: "done" },
      ]),
      invoke: ({ correlationId }) => {
        seen.push(correlationId);
        return ok("ok");
      },
    });
    expect(seen).toEqual([run.task.correlationId]);
  });

  it("fingerprints intents deterministically", () => {
    const a: AgentIntent = { kind: "invoke_capability", capabilityId: "x", input: { b: 1, a: 2 } };
    const b: AgentIntent = { kind: "invoke_capability", capabilityId: "x", input: { a: 2, b: 1 } };
    expect(intentFingerprint(a)).toBe(intentFingerprint(b));
  });
});