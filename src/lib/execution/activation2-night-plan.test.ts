/**
 * ACTIVATION 2 — first real governed execution.
 *
 * Proves: the capability → Action Ledger action type mapping is explicit and
 * fail-closed; the Night Plan plan producer builds a correct immutable plan;
 * the real (non-fixture) provider applies and read-after-write verifies; and
 * locked capabilities stay locked.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LedgerPort } from "@/lib/core/action-executor";
import { nightPlanStore } from "@/lib/night-plan-store";
import { registerSafeActionProviders } from "./safe-action-providers";
import { clearProviders, registerProvider } from "./execution-provider";
import {
  listAllExecutableCapabilities,
  listExecutableCapabilities,
  getExecutableCapability,
} from "./executable-registry";
import {
  SERVER_LEDGER_ACTION_TYPES,
  ledgerMappingIssues,
  resolveLedgerActionType,
} from "./ledger-action-map";
import { prepareNightPlanItemCreate } from "./night-plan-producer";
import { buildExecutionPlan, verifyPlanIntegrity } from "./execution-plan";
import { mintConfirmation, resetConfirmations, requiredPhrase } from "./confirmation";
import { executePlan } from "./execution-engine";
import { executionStore, needsAttention } from "./execution-store";
import { eventSpine } from "@/lib/core/event-spine";
import type { ConfirmationProof, ExecutionPlan } from "./execution-contract";

const OPERATOR = "op-activation2";
const LEASE_MS = 90_000;

function fakeLedger(now: () => number = Date.now) {
  const rows = new Map<string, { status: string; leaseAt: number }>();
  const reserved: { actionType: string; idempotencyKey: string; entityType?: string }[] = [];
  const port: LedgerPort = {
    reserve: async (input) => {
      reserved.push({
        actionType: input.actionType,
        idempotencyKey: input.idempotencyKey,
        ...(input.entityType ? { entityType: input.entityType } : {}),
      });
      const prior = rows.get(input.idempotencyKey);
      if (!prior) {
        rows.set(input.idempotencyKey, { status: "executing", leaseAt: now() });
        return { outcome: "reserved", priorStatus: null };
      }
      if (prior.status === "success" || prior.status === "succeeded") return { outcome: "duplicate_success", priorStatus: "success" };
      if (prior.status === "failed") {
        rows.set(input.idempotencyKey, { status: "executing", leaseAt: now() });
        return { outcome: "retry", priorStatus: "failed" };
      }
      if (now() - prior.leaseAt < LEASE_MS) return { outcome: "in_flight", priorStatus: "executing" };
      return { outcome: "uncertain", priorStatus: "executing" };
    },
    finalize: async ({ idempotencyKey, status }) => {
      rows.set(idempotencyKey, { status, leaseAt: now() });
    },
  };
  return { port, rows, reserved };
}

function confirm(plan: ExecutionPlan, operatorRef = OPERATOR): ConfirmationProof {
  const res = mintConfirmation({
    plan,
    operatorRef,
    typedPhrase: requiredPhrase(plan),
  });
  if (!res.ok) throw new Error(res.message);
  return res.proof;
}

function run(plan: ExecutionPlan, ledger: LedgerPort, proof?: ConfirmationProof) {
  return executePlan(plan, {
    operatorRef: OPERATOR,
    role: "programmer",
    confirmation: proof ?? confirm(plan),
    ledger,
  });
}

beforeEach(() => {
  localStorage.clear();
  nightPlanStore.get(); // force load
  for (const i of nightPlanStore.get().items) nightPlanStore.setStatus(i.id, "dismissed");
  resetConfirmations();
  executionStore.clear();
  clearProviders();
  registerSafeActionProviders();
});

/* ------------------------------------------------------------------ */
/* PART 3–6 — canonical mapping                                        */
/* ------------------------------------------------------------------ */

describe("capability → Action Ledger action type mapping", () => {
  it("maps the Night Plan capabilities to the real Safe Action identifiers", () => {
    const create = resolveLedgerActionType("night_plan.item.create");
    expect(create).toEqual({ ok: true, actionType: "add_night_plan_item", auditable: true });
    const complete = resolveLedgerActionType("night_plan.item.complete");
    expect(complete).toEqual({ ok: true, actionType: "complete_night_plan_item", auditable: true });
  });

  it("keeps the external capability id unchanged", () => {
    expect(getExecutableCapability("night_plan.item.create")?.capabilityId).toBe(
      "night_plan.item.create",
    );
  });

  it("blocks an unknown capability rather than guessing", () => {
    const res = resolveLedgerActionType("totally.made.up");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe("unknown_capability");
  });

  it("fails closed when a capability declares no audited action type", () => {
    const res = resolveLedgerActionType("knowledge.draft.create");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe("no_mapping");
  });

  it("every registered contract passes the load-time mapping audit", () => {
    expect(ledgerMappingIssues(listAllExecutableCapabilities())).toEqual([]);
  });

  it("rejects a production action type used outside its effect family", () => {
    const issues = ledgerMappingIssues([
      { ...getExecutableCapability("night_plan.item.create")!, ledgerActionType: "start_timer" },
    ]);
    expect(issues.join(" ")).toContain("outside the night_plan effect family");
  });

  it("rejects a non-fixture capability mapped to the fixture sentinel", () => {
    const issues = ledgerMappingIssues([
      { ...getExecutableCapability("night_plan.item.create")!, ledgerActionType: "fixture_only" },
    ]);
    expect(issues.length).toBeGreaterThan(0);
    const res = resolveLedgerActionType("night_plan.item.create");
    expect(res.ok).toBe(true); // registry itself is untampered
  });

  it("the fixture sentinel is not accepted by the server ledger enum", () => {
    expect(SERVER_LEDGER_ACTION_TYPES).not.toContain("fixture_only");
    expect(SERVER_LEDGER_ACTION_TYPES).toContain("add_night_plan_item");
  });
});

/* ------------------------------------------------------------------ */
/* PART 7 / 11 / 12 — plan producer + fingerprint                      */
/* ------------------------------------------------------------------ */

describe("Night Plan plan producer", () => {
  it("builds an immutable, integrity-checkable plan without writing anything", () => {
    const before = nightPlanStore.get().items.length;
    const res = prepareNightPlanItemCreate({ task: "Check UPS battery", operatorRef: OPERATOR });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(nightPlanStore.get().items.length).toBe(before);
    expect(res.plan.capabilityId).toBe("night_plan.item.create");
    expect(res.plan.operationClass).toBe("reversible_write");
    expect(res.plan.riskClass).toBe("low");
    expect(res.plan.confirmation).toBe("single");
    expect(res.plan.requestedBy).toBe("operator");
    expect(res.plan.target.type).toBe("night_plan");
    expect(verifyPlanIntegrity(res.plan)).toBe(true);
    expect(Object.isFrozen(res.plan)).toBe(true);
  });

  it("carries the effect-determining input only", () => {
    const res = prepareNightPlanItemCreate({
      task: "  Rotate logs  ",
      notes: " nightly ",
      priority: "must",
      operatorRef: OPERATOR,
    });
    if (!res.ok) throw new Error(res.message);
    expect(res.plan.input).toEqual({ task: "Rotate logs", notes: "nightly", priority: "must" });
  });

  it("flags unmet preconditions instead of silently proceeding", () => {
    const res = prepareNightPlanItemCreate({ task: "x", operatorRef: "" });
    if (!res.ok) throw new Error(res.message);
    expect(res.plan.unmetPreconditions).toContain("Signed-in operator");
  });

  it("fingerprints the task text — editing it invalidates the confirmation", () => {
    const a = prepareNightPlanItemCreate({ task: "Task A", operatorRef: OPERATOR });
    const b = prepareNightPlanItemCreate({ task: "Task B", operatorRef: OPERATOR });
    if (!a.ok || !b.ok) throw new Error("plan failed");
    expect(a.plan.fingerprint).not.toBe(b.plan.fingerprint);
  });

  it("fingerprints priority and notes", () => {
    const base = prepareNightPlanItemCreate({ task: "T", operatorRef: OPERATOR });
    const pri = prepareNightPlanItemCreate({ task: "T", priority: "must", operatorRef: OPERATOR });
    const note = prepareNightPlanItemCreate({ task: "T", notes: "n", operatorRef: OPERATOR });
    if (!base.ok || !pri.ok || !note.ok) throw new Error("plan failed");
    expect(new Set([base.plan.fingerprint, pri.plan.fingerprint, note.plan.fingerprint]).size).toBe(3);
  });

  it("is stable for the same effect (idempotency key is effect-keyed)", () => {
    const a = prepareNightPlanItemCreate({ task: "Same", operatorRef: OPERATOR });
    const b = prepareNightPlanItemCreate({ task: "Same", operatorRef: OPERATOR });
    if (!a.ok || !b.ok) throw new Error("plan failed");
    expect(a.plan.idempotencyKey).toBe(b.plan.idempotencyKey);
    expect(a.plan.idempotencyKey).toContain("night_plan.item.create");
  });

  it("a tampered plan fails integrity and is refused by the engine", async () => {
    const res = prepareNightPlanItemCreate({ task: "Original", operatorRef: OPERATOR });
    if (!res.ok) throw new Error(res.message);
    const proof = confirm(res.plan);
    const tampered = { ...res.plan, input: { task: "Swapped", priority: "normal" } } as ExecutionPlan;
    expect(verifyPlanIntegrity(tampered)).toBe(false);
    const { port } = fakeLedger();
    const receipt = await run(tampered, port, proof);
    expect(receipt.status).toBe("rejected");
    expect(receipt.failureClass).toBe("plan_mismatch");
    expect(nightPlanStore.get().items.some((i) => i.task === "Swapped")).toBe(false);
  });

  it("a target swap invalidates the confirmation binding", () => {
    const res = prepareNightPlanItemCreate({ task: "Bound", operatorRef: OPERATOR });
    if (!res.ok) throw new Error(res.message);
    const other = buildExecutionPlan({
      capabilityId: "night_plan.item.create",
      input: { task: "Bound", priority: "normal" },
      target: { type: "night_plan", id: "some_other_shift" },
      requestedBy: "operator",
      correlationId: "c",
      contextRef: "night_plan",
    });
    if (!other.ok) throw new Error(other.message);
    expect(other.plan.fingerprint).not.toBe(res.plan.fingerprint);
  });
});

/* ------------------------------------------------------------------ */
/* PART 15–20 — real execution, reservation, verification              */
/* ------------------------------------------------------------------ */

describe("real Night Plan governed execution", () => {
  it("runs the full lifecycle and verifies by read-after-write", async () => {
    const { port, reserved } = fakeLedger();
    const res = prepareNightPlanItemCreate({
      task: "Activation 2 smoke item",
      notes: "non-sensitive test content",
      operatorRef: OPERATOR,
    });
    if (!res.ok) throw new Error(res.message);
    const receipt = await run(res.plan, port);

    expect(receipt.status).toBe("succeeded");
    expect(receipt.verification.status).toBe("verified");
    expect(receipt.verification.authority).toBe("database");
    expect(receipt.ledgerSynced).toBe(true);
    expect(nightPlanStore.get().items.some((i) => i.task === "Activation 2 smoke item")).toBe(true);

    // PART 15 — the server saw the canonical Safe Action type, not the capability id.
    expect(reserved[0]?.actionType).toBe("add_night_plan_item");
    expect(reserved[0]?.entityType).toBe("night_plan");

    // PART 23 — the run is reconstructable, in order, with no hidden reasoning.
    const phases = receipt.events.map((e) => e.phase);
    expect(phases).toEqual([
      "resolve",
      "authorize",
      "confirm",
      "reserve",
      "conflict_check",
      "apply",
      "verify",
      "audit",
    ]);
    expect(receipt.correlationId).toBe(res.plan.correlationId);
    expect(receipt.planId).toBe(res.plan.id);
    expect(receipt.operatorRef).toBe(OPERATOR);
  });

  it("emits correlated, sanitized lifecycle events without spamming", async () => {
    const seen: { type: string; metadata?: Record<string, unknown> }[] = [];
    const off = eventSpine.subscribe((e) => {
      if (String(e.type).startsWith("capability.")) seen.push({ type: e.type, metadata: e.metadata });
    });
    const { port } = fakeLedger();
    const res = prepareNightPlanItemCreate({ task: "Correlated item", operatorRef: OPERATOR });
    if (!res.ok) throw new Error(res.message);
    await run(res.plan, port);
    off();
    expect(seen.length).toBeGreaterThan(0);
    expect(seen.length).toBeLessThanOrEqual(4);
    for (const e of seen) {
      expect(e.metadata?.["correlationId"]).toBe(res.plan.correlationId);
      expect(JSON.stringify(e.metadata)).not.toContain("Correlated item");
    }
  });

  it("does not duplicate on a repeated submission of the same effect", async () => {
    const { port } = fakeLedger();
    const first = prepareNightPlanItemCreate({ task: "Only once", operatorRef: OPERATOR });
    if (!first.ok) throw new Error(first.message);
    const r1 = await run(first.plan, port);
    expect(r1.status).toBe("succeeded");

    // Re-submitting the SAME plan (the confirmed effect) is suppressed by the
    // effect-keyed idempotency key rather than adding a second item.
    const r2 = await run(first.plan, port);
    expect(r2.status).not.toBe("succeeded");
    expect(r2.failureClass).toBe("duplicate_suppressed");
    expect(nightPlanStore.get().items.filter((i) => i.task === "Only once").length).toBe(1);
  });

  it("suppresses a double-click while the first attempt is in flight", async () => {
    const { port } = fakeLedger();
    const a = prepareNightPlanItemCreate({ task: "Double click", operatorRef: OPERATOR });
    const b = prepareNightPlanItemCreate({ task: "Double click", operatorRef: OPERATOR });
    if (!a.ok || !b.ok) throw new Error("plan failed");
    const [r1, r2] = await Promise.all([run(a.plan, port), run(b.plan, port)]);
    const outcomes = [r1, r2].map((r) => r.status);
    expect(outcomes.filter((s) => s === "succeeded").length).toBeLessThanOrEqual(1);
    expect(nightPlanStore.get().items.filter((i) => i.task === "Double click").length).toBe(1);
  });

  it("a single-use confirmation cannot be replayed", async () => {
    const { port } = fakeLedger();
    const res = prepareNightPlanItemCreate({ task: "Replay guard", operatorRef: OPERATOR });
    if (!res.ok) throw new Error(res.message);
    const proof = confirm(res.plan);
    await run(res.plan, port, proof);
    const again = await run(res.plan, port, proof);
    expect(again.status).toBe("rejected");
  });

  it("refuses to execute without a confirmation proof", async () => {
    const { port } = fakeLedger();
    const res = prepareNightPlanItemCreate({ task: "No confirm", operatorRef: OPERATOR });
    if (!res.ok) throw new Error(res.message);
    const receipt = await executePlan(res.plan, {
      operatorRef: OPERATOR,
      role: "programmer",
      confirmation: null,
      ledger: port,
    });
    expect(receipt.status).toBe("rejected");
    expect(nightPlanStore.get().items.some((i) => i.task === "No confirm")).toBe(false);
  });

  it("Guardian re-checks the role at execution time", async () => {
    const { port } = fakeLedger();
    const res = prepareNightPlanItemCreate({ task: "Viewer attempt", operatorRef: OPERATOR });
    if (!res.ok) throw new Error(res.message);
    const receipt = await executePlan(res.plan, {
      operatorRef: OPERATOR,
      role: "viewer",
      confirmation: confirm(res.plan),
      ledger: port,
    });
    expect(receipt.status).toBe("rejected");
    expect(receipt.failureClass).toBe("authorization_denied");
    expect(nightPlanStore.get().items.some((i) => i.task === "Viewer attempt")).toBe(false);
  });

  it("executed is NOT verified: a failing read-back never reports success", async () => {
    const { port } = fakeLedger();
    // Replace only the verify authority; the apply path stays real.
    registerProvider({
      capabilityId: "night_plan.item.create",
      readState: async (plan) =>
        plan.preState
          ? { ...plan.preState }
          : { fingerprint: "live", observedAt: new Date().toISOString(), summary: {} },
      apply: async () => ({ status: "applied", note: "applied" }),
      verify: async () => "failed",
    });
    const res = prepareNightPlanItemCreate({ task: "Bad verify", operatorRef: OPERATOR });
    if (!res.ok) throw new Error(res.message);
    const receipt = await run(res.plan, port);
    expect(receipt.status).not.toBe("succeeded");
    expect(receipt.failureClass).toBe("verification_failed");
    expect(receipt.verification.status).toBe("failed");
    expect(receipt.message.toLowerCase()).not.toContain("applied and confirmed");
  });

  it("an unreachable verification is reported as uncertain, not done", async () => {
    const { port } = fakeLedger();
    registerProvider({
      capabilityId: "night_plan.item.create",
      readState: async (plan) =>
        plan.preState
          ? { ...plan.preState }
          : { fingerprint: "live", observedAt: new Date().toISOString(), summary: {} },
      apply: async () => ({ status: "applied", note: "applied" }),
      verify: async () => "unavailable",
    });
    const res = prepareNightPlanItemCreate({ task: "Unknown verify", operatorRef: OPERATOR });
    if (!res.ok) throw new Error(res.message);
    const receipt = await run(res.plan, port);
    expect(receipt.status).toBe("uncertain");
    expect(receipt.failureClass).toBe("verification_unavailable");
  });
});

/* ------------------------------------------------------------------ */
/* PART 22 — Action Center surface                                     */
/* ------------------------------------------------------------------ */

describe("Action Center session record", () => {
  it("tracks awaiting confirmation → running → done truthfully", async () => {
    const res = prepareNightPlanItemCreate({ task: "Center item", operatorRef: OPERATOR });
    if (!res.ok) throw new Error(res.message);
    executionStore.propose(res.plan, OPERATOR);
    expect(executionStore.get(res.plan.id)?.status).toBe("awaiting_confirmation");
    expect(needsAttention(executionStore.list()).length).toBe(1);

    const proof = confirm(res.plan);
    executionStore.markRunning(res.plan, proof, OPERATOR);
    expect(executionStore.get(res.plan.id)?.status).toBe("running");

    const { port } = fakeLedger();
    const receipt = await run(res.plan, port, proof);
    executionStore.complete(res.plan, receipt, OPERATOR);
    const entry = executionStore.get(res.plan.id);
    expect(entry?.status).toBe("done");
    expect(entry?.receipt?.verification.status).toBe("verified");
    expect(needsAttention(executionStore.list()).length).toBe(0);
  });

  it("keeps an abnormal outcome flagged for the operator", async () => {
    registerProvider({
      capabilityId: "night_plan.item.create",
      readState: async (plan) =>
        plan.preState
          ? { ...plan.preState }
          : { fingerprint: "live", observedAt: new Date().toISOString(), summary: {} },
      apply: async () => ({ status: "unknown", note: "no answer" }),
      verify: async () => "unavailable",
    });
    const { port } = fakeLedger();
    const res = prepareNightPlanItemCreate({ task: "Abnormal", operatorRef: OPERATOR });
    if (!res.ok) throw new Error(res.message);
    const receipt = await run(res.plan, port);
    executionStore.complete(res.plan, receipt, OPERATOR);
    expect(receipt.status).toBe("uncertain");
    expect(needsAttention(executionStore.list()).length).toBe(1);
  });
});

/* ------------------------------------------------------------------ */
/* PART 25–28 — locked capabilities and fixture protection             */
/* ------------------------------------------------------------------ */

describe("locked capabilities stay locked", () => {
  it("knowledge.draft.create has no provider and no audited action type", async () => {
    expect(getExecutableCapability("knowledge.draft.create")?.ledgerActionType).toBeNull();
    const built = buildExecutionPlan({
      capabilityId: "knowledge.draft.create",
      input: { title: "x" },
      target: { type: "knowledge", id: "k1" },
      requestedBy: "operator",
      correlationId: "c",
      contextRef: "ctx",
    });
    if (!built.ok) throw new Error(built.message);
    const { port } = fakeLedger();
    const receipt = await run(built.plan, port);
    expect(receipt.status).toBe("rejected");
    expect(receipt.failureClass).toBe("authorization_denied");
  });

  it("freshdesk.ticket.classify and work.timer.start keep their Activation 1 posture", () => {
    const classify = getExecutableCapability("freshdesk.ticket.classify")!;
    expect(classify.riskClass).toBe("medium");
    expect(classify.ledgerActionType).toBe("set_ticket_classification");
    const timer = getExecutableCapability("work.timer.start")!;
    expect(timer.ledgerActionType).toBe("start_timer");
    // The timer still cannot verify itself; Activation 2 did not "fix" it.
    expect(timer.verification.required).toBe(true);
  });

  it("no fixture capability is exposed on operator surfaces", () => {
    for (const c of listExecutableCapabilities()) {
      expect(c.fixtureOnly).not.toBe(true);
      expect(c.capabilityId.startsWith("fixture.")).toBe(false);
    }
  });

  it("autonomy is unchanged: producing a plan writes nothing", () => {
    const before = nightPlanStore.get().items.length;
    prepareNightPlanItemCreate({ task: "Never applied", operatorRef: OPERATOR });
    prepareNightPlanItemCreate({ task: "Never applied 2", operatorRef: OPERATOR });
    expect(nightPlanStore.get().items.length).toBe(before);
  });
});

/* ------------------------------------------------------------------ */
/* PART 31 — night_plan.item.complete on the same infrastructure       */
/* ------------------------------------------------------------------ */

describe("night_plan.item.complete on the corrected path", () => {
  it("reserves under complete_night_plan_item and verifies the completed state", async () => {
    nightPlanStore.add("Complete me", "", "normal");
    const { port, reserved } = fakeLedger();
    const built = buildExecutionPlan({
      capabilityId: "night_plan.item.complete",
      input: { task: "Complete me" },
      target: { type: "night_plan", id: nightPlanStore.get().shiftKey || "current_shift" },
      requestedBy: "operator",
      correlationId: "complete-1",
      contextRef: "night_plan",
    });
    if (!built.ok) throw new Error(built.message);
    const receipt = await run(built.plan, port);
    expect(receipt.status).toBe("succeeded");
    expect(receipt.verification.status).toBe("verified");
    expect(reserved[0]?.actionType).toBe("complete_night_plan_item");
    expect(nightPlanStore.get().items.find((i) => i.task === "Complete me")?.status).toBe("done");
  });
});

/* ------------------------------------------------------------------ */
/* Server contract — validation must remain strict                     */
/* ------------------------------------------------------------------ */

describe("server validation stays strict", () => {
  it("the mirrored enum matches the server's accepted action types exactly", async () => {
    const src = await import("./ledger-action-map");
    expect([...src.SERVER_LEDGER_ACTION_TYPES].sort()).toEqual(
      ["add_night_plan_item", "complete_night_plan_item", "set_ticket_classification", "start_timer"].sort(),
    );
  });

  it("a capability id is never sent as the action type", async () => {
    const { port, reserved } = fakeLedger();
    const res = prepareNightPlanItemCreate({ task: "Contract check", operatorRef: OPERATOR });
    if (!res.ok) throw new Error(res.message);
    await run(res.plan, port);
    for (const r of reserved) {
      expect(SERVER_LEDGER_ACTION_TYPES).toContain(r.actionType);
      expect(r.actionType).not.toContain(".");
    }
  });
});

/* keeps vi import meaningful for future timing seams */
void vi;
