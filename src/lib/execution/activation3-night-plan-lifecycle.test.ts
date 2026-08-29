/**
 * ACTIVATION 3 — the first complete real governed state lifecycle.
 *
 *   create → verify created → prepare completion → confirm → execute
 *          → read back → verify completed → audit
 *
 * Everything here runs against the REAL Night Plan provider and the REAL Safe
 * Action handler. Only the durable ledger is a test double (it is server-side),
 * and it records exactly what the server would validate.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LedgerPort } from "@/lib/core/action-executor";
import { nightPlanStore } from "@/lib/night-plan-store";
import { registerSafeActionProviders } from "./safe-action-providers";
import { clearProviders, getProvider, registerProvider } from "./execution-provider";
import { getExecutableCapability } from "./executable-registry";
import { resolveLedgerActionType } from "./ledger-action-map";
import {
  prepareNightPlanItemComplete,
  prepareNightPlanItemCreate,
} from "./night-plan-producer";
import { nightPlanItemState } from "./night-plan-item-state";
import { verifyPlanIntegrity } from "./execution-plan";
import { mintConfirmation, requiredPhrase, resetConfirmations } from "./confirmation";
import { executePlan } from "./execution-engine";
import { executionStore } from "./execution-store";
import { eventSpine } from "@/lib/core/event-spine";
import { getActionHandler } from "@/lib/core/action-handlers";
import type { ConfirmationProof, ExecutionPlan } from "./execution-contract";

const OPERATOR = "op-activation3";
const LEASE_MS = 90_000;

interface Reserved {
  actionType: string;
  idempotencyKey: string;
  entityType?: string;
  entityId?: string;
}

function fakeLedger(now: () => number = Date.now) {
  const rows = new Map<string, { status: string; leaseAt: number }>();
  const reserved: Reserved[] = [];
  const finalized: { idempotencyKey: string; status: string; error?: string }[] = [];
  const port: LedgerPort = {
    reserve: async (input) => {
      reserved.push({
        actionType: input.actionType,
        idempotencyKey: input.idempotencyKey,
        ...(input.entityType ? { entityType: input.entityType } : {}),
        ...(input.entityId ? { entityId: input.entityId } : {}),
      });
      const prior = rows.get(input.idempotencyKey);
      if (!prior) {
        rows.set(input.idempotencyKey, { status: "executing", leaseAt: now() });
        return { outcome: "reserved", priorStatus: null };
      }
      if (prior.status === "success") return { outcome: "duplicate_success", priorStatus: "success" };
      if (prior.status === "failed") {
        rows.set(input.idempotencyKey, { status: "executing", leaseAt: now() });
        return { outcome: "retry", priorStatus: "failed" };
      }
      if (now() - prior.leaseAt < LEASE_MS) return { outcome: "in_flight", priorStatus: "executing" };
      return { outcome: "uncertain", priorStatus: "executing" };
    },
    finalize: async (input) => {
      rows.set(input.idempotencyKey, { status: input.status, leaseAt: now() });
      finalized.push({
        idempotencyKey: input.idempotencyKey,
        status: input.status,
        ...(input.error ? { error: input.error } : {}),
      });
    },
  };
  return { port, rows, reserved, finalized };
}

function confirm(plan: ExecutionPlan, operatorRef = OPERATOR): ConfirmationProof {
  const res = mintConfirmation({ plan, operatorRef, typedPhrase: requiredPhrase(plan) });
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

/** Adds an item directly through the store (fixture setup, not the governed path). */
function seedItem(task: string): string {
  nightPlanStore.add(task, "", "normal");
  const items = nightPlanStore.get().items;
  return items[items.length - 1]!.id;
}

function planFor(itemId: string): ExecutionPlan {
  const res = prepareNightPlanItemComplete({ itemId, operatorRef: OPERATOR });
  if (!res.ok) throw new Error(`expected a plan, got ${res.reason}`);
  return res.plan;
}

beforeEach(() => {
  localStorage.clear();
  nightPlanStore.get();
  for (const i of nightPlanStore.get().items) nightPlanStore.setStatus(i.id, "dismissed");
  resetConfirmations();
  executionStore.clear();
  clearProviders();
  registerSafeActionProviders();
});

/* ------------------------------------------------------------------ */
/* 3 — completion plan producer                                        */
/* ------------------------------------------------------------------ */

describe("completion plan producer", () => {
  it("builds an immutable plan bound to the item id and its current state", () => {
    const id = seedItem("A3 verify backups");
    const plan = planFor(id);
    expect(plan.capabilityId).toBe("night_plan.item.complete");
    expect(plan.input["itemId"]).toBe(id);
    expect(plan.input["task"]).toBe("A3 verify backups");
    expect(plan.input["requestedStatus"]).toBe("done");
    expect(plan.target).toEqual({ type: "night_plan_item", id });
    expect(plan.operationClass).toBe("reversible_write");
    expect(plan.riskClass).toBe("low");
    expect(plan.confirmation).toBe("single");
    expect(plan.preState?.summary).toMatchObject({ itemId: id, status: "todo", completed: false });
    expect(Object.isFrozen(plan)).toBe(true);
    expect(verifyPlanIntegrity(plan)).toBe(true);
  });

  it("producing a plan mutates nothing", () => {
    const id = seedItem("A3 no mutation");
    planFor(id);
    expect(nightPlanStore.get().items.find((i) => i.id === id)?.status).toBe("todo");
  });

  it("uses exactly the same pre-state shape the provider reads back", () => {
    const id = seedItem("A3 shared shape");
    const plan = planFor(id);
    expect(plan.preState?.fingerprint).toBe(nightPlanItemState(id)?.fingerprint);
  });

  it("gives each item a distinct plan fingerprint", () => {
    const a = planFor(seedItem("A3 one"));
    const b = planFor(seedItem("A3 two"));
    expect(a.fingerprint).not.toBe(b.fingerprint);
  });
});

/* ------------------------------------------------------------------ */
/* 4 — precondition model                                              */
/* ------------------------------------------------------------------ */

describe("completion preconditions", () => {
  it("reports ALREADY COMPLETE instead of planning a second completion", () => {
    const id = seedItem("A3 already done");
    nightPlanStore.setStatus(id, "done");
    const res = prepareNightPlanItemComplete({ itemId: id, operatorRef: OPERATOR });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe("already_complete");
  });

  it("refuses to complete a converted or dismissed item", () => {
    const id = seedItem("A3 converted");
    nightPlanStore.setStatus(id, "converted");
    const res = prepareNightPlanItemComplete({ itemId: id, operatorRef: OPERATOR });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe("not_completable");
  });

  it("flags a missing item as an unmet precondition and refuses to execute it", async () => {
    const res = prepareNightPlanItemComplete({ itemId: "does-not-exist", operatorRef: OPERATOR });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.plan.unmetPreconditions).toContain("item_exists");
    const { port } = fakeLedger();
    const receipt = await run(res.plan, port);
    expect(receipt.status).toBe("rejected");
    expect(receipt.events.some((e) => e.phase === "precondition" && e.outcome === "blocked")).toBe(true);
  });

  it("flags a missing operator", () => {
    const id = seedItem("A3 anon");
    const res = prepareNightPlanItemComplete({ itemId: id, operatorRef: "" });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.plan.unmetPreconditions).toContain("authenticated");
  });
});

/* ------------------------------------------------------------------ */
/* 5 — TOCTOU                                                          */
/* ------------------------------------------------------------------ */

describe("TOCTOU protection", () => {
  it("rejects the plan when the item was completed by someone else first", async () => {
    const id = seedItem("A3 raced complete");
    const plan = planFor(id);
    nightPlanStore.setStatus(id, "done"); // state changed after review
    const { port } = fakeLedger();
    const receipt = await run(plan, port);
    expect(receipt.status).toBe("rejected");
    expect(receipt.failureClass).toBe("conflict_detected");
  });

  it("rejects the plan when the item changed to an incompatible state", async () => {
    const id = seedItem("A3 raced convert");
    const plan = planFor(id);
    nightPlanStore.setStatus(id, "dismissed");
    const { port } = fakeLedger();
    const receipt = await run(plan, port);
    expect(receipt.status).toBe("rejected");
    expect(receipt.failureClass).toBe("conflict_detected");
  });

  it("fails safe when the item is gone at execution time", async () => {
    const id = seedItem("A3 vanished");
    const plan = planFor(id);
    // Simulate deletion: the store has no delete, so drop it from the snapshot.
    const real = nightPlanStore.get;
    vi.spyOn(nightPlanStore, "get").mockImplementation(() => {
      const s = real.call(nightPlanStore);
      return { ...s, items: s.items.filter((i) => i.id !== id) };
    });
    const { port } = fakeLedger();
    const receipt = await run(plan, port);
    vi.restoreAllMocks();
    expect(receipt.status).toBe("failed");
    expect(receipt.failureClass).toBe("provider_unavailable");
  });

  it("never blind-completes: no plan reaches apply after a conflict", async () => {
    const id = seedItem("A3 no blind write");
    const plan = planFor(id);
    nightPlanStore.setStatus(id, "carried");
    const { port } = fakeLedger();
    const receipt = await run(plan, port);
    expect(receipt.status).toBe("rejected");
    expect(receipt.events.some((e) => e.phase === "apply" && e.outcome === "ok")).toBe(false);
    expect(nightPlanStore.get().items.find((i) => i.id === id)?.status).toBe("carried");
  });
});

/* ------------------------------------------------------------------ */
/* 6 / 7 — confirmation + mapping                                      */
/* ------------------------------------------------------------------ */

describe("confirmation binding and capability mapping", () => {
  it("maps completion to the canonical Safe Action type", () => {
    expect(resolveLedgerActionType("night_plan.item.complete")).toEqual({
      ok: true,
      actionType: "complete_night_plan_item",
      auditable: true,
    });
  });

  it("reserves with the mapped action type and the item as entity", async () => {
    const id = seedItem("A3 mapping reserve");
    const { port, reserved } = fakeLedger();
    await run(planFor(id), port);
    expect(reserved).toHaveLength(1);
    expect(reserved[0]!.actionType).toBe("complete_night_plan_item");
    expect(reserved[0]!.entityType).toBe("night_plan_item");
    expect(reserved[0]!.entityId).toBe(id);
  });

  it("rejects a confirmation minted for a different item's plan", async () => {
    const a = planFor(seedItem("A3 bind a"));
    const b = planFor(seedItem("A3 bind b"));
    const { port } = fakeLedger();
    const receipt = await run(a, port, confirm(b));
    expect(receipt.status).toBe("rejected");
    expect(receipt.events.some((e) => e.phase === "confirm" && e.outcome !== "ok")).toBe(true);
  });

  it("rejects a confirmation minted by a different operator", async () => {
    const plan = planFor(seedItem("A3 other operator"));
    const { port } = fakeLedger();
    const receipt = await run(plan, port, confirm(plan, "someone-else"));
    expect(receipt.status).toBe("rejected");
  });

  it("rejects a tampered plan whose target was swapped after confirmation", async () => {
    const plan = planFor(seedItem("A3 tamper"));
    const proof = confirm(plan);
    const tampered = { ...plan, input: { ...plan.input, itemId: "other-item" } } as ExecutionPlan;
    expect(verifyPlanIntegrity(tampered)).toBe(false);
    const { port } = fakeLedger();
    const receipt = await run(tampered, port, proof);
    expect(receipt.status).toBe("rejected");
  });

  it("refuses execution with no confirmation at all", async () => {
    const plan = planFor(seedItem("A3 unconfirmed"));
    const { port } = fakeLedger();
    const receipt = await executePlan(plan, {
      operatorRef: OPERATOR,
      role: "programmer",
      confirmation: null,
      ledger: port,
    });
    expect(receipt.status).toBe("rejected");
  });
});

/* ------------------------------------------------------------------ */
/* 9–11 — execution + read-after-write verification                    */
/* ------------------------------------------------------------------ */

describe("execution and verification", () => {
  it("applies through the real provider and verifies by reading the item back", async () => {
    const id = seedItem("A3 real completion");
    const { port, finalized } = fakeLedger();
    const receipt = await run(planFor(id), port);
    expect(receipt.status).toBe("succeeded");
    expect(receipt.verification.status).toBe("verified");
    const item = nightPlanStore.get().items.find((i) => i.id === id)!;
    expect(item.status).toBe("done");
    expect(typeof item.completedAt).toBe("number");
    expect(finalized.at(-1)).toMatchObject({ status: "success" });
  });

  it("completes only the targeted item, even with an identical task name", async () => {
    const first = seedItem("A3 duplicate title");
    const second = seedItem("A3 duplicate title");
    const { port } = fakeLedger();
    await run(planFor(second), port);
    expect(nightPlanStore.get().items.find((i) => i.id === second)?.status).toBe("done");
    expect(nightPlanStore.get().items.find((i) => i.id === first)?.status).toBe("todo");
  });

  it("reports uncertain — never success — when verification is unavailable", async () => {
    const id = seedItem("A3 unverifiable");
    const real = getProvider("night_plan.item.complete")!;
    registerProvider({ ...real, verify: async () => "unavailable" });
    const { port, finalized } = fakeLedger();
    const receipt = await run(planFor(id), port);
    expect(receipt.status).toBe("uncertain");
    expect(receipt.failureClass).toBe("verification_unavailable");
    expect(receipt.message.toLowerCase()).not.toContain("completed successfully");
    expect(finalized.at(-1)?.error).toContain("verification unavailable");
  });

  it("surfaces compensation when the write did not stick", async () => {
    const id = seedItem("A3 verify fails");
    const real = getProvider("night_plan.item.complete")!;
    registerProvider({ ...real, verify: async () => "failed" });
    const { port } = fakeLedger();
    const receipt = await run(planFor(id), port);
    expect(receipt.status).toBe("compensation_available");
    expect(receipt.failureClass).toBe("verification_failed");
  });

  it("the Safe Action handler itself refuses a redundant completion", () => {
    const id = seedItem("A3 handler guard");
    nightPlanStore.setStatus(id, "done");
    const handler = getActionHandler("complete_night_plan_item")!;
    const validated = handler.validate({ task: "A3 handler guard", itemId: id });
    expect(validated.ok).toBe(true);
    if (!validated.ok) return;
    const out = handler.execute(validated.payload) as { ok: boolean; message: string };
    expect(out.ok).toBe(false);
    expect(out.message).toContain("already complete");
  });
});

/* ------------------------------------------------------------------ */
/* 12 — idempotency                                                    */
/* ------------------------------------------------------------------ */

describe("idempotency", () => {
  it("suppresses a repeated submission of the same completion", async () => {
    const id = seedItem("A3 repeat");
    const plan = planFor(id);
    const { port } = fakeLedger();
    const first = await run(plan, port);
    expect(first.status).toBe("succeeded");
    const second = await run(plan, port, confirm(plan));
    expect(second.status).toBe("succeeded");
    expect(second.failureClass).toBe("duplicate_suppressed");
  });

  it("suppresses a double click (second attempt while the first is in flight)", async () => {
    const id = seedItem("A3 double click");
    const plan = planFor(id);
    const { port } = fakeLedger();
    const proofA = confirm(plan);
    const proofB = confirm(plan);
    const [a, b] = await Promise.all([run(plan, port, proofA), run(plan, port, proofB)]);
    const outcomes = [a.status, b.status].sort();
    expect(outcomes).toContain("succeeded");
    expect(a.status === "rejected" || b.status === "rejected" || a.failureClass === "duplicate_suppressed" || b.failureClass === "duplicate_suppressed").toBe(true);
  });

  it("re-using a single confirmation proof twice is refused", async () => {
    const plan = planFor(seedItem("A3 replay"));
    const { port } = fakeLedger();
    const proof = confirm(plan);
    await run(plan, port, proof);
    const replay = await run(plan, port, proof);
    expect(replay.status).toBe("rejected");
  });

  it("produces one ledger reservation per real completion effect", async () => {
    const id = seedItem("A3 one reservation");
    const plan = planFor(id);
    const { port, reserved } = fakeLedger();
    await run(plan, port);
    await run(plan, port, confirm(plan));
    const successful = reserved.filter((r) => r.actionType === "complete_night_plan_item");
    expect(successful).toHaveLength(2); // both attempted…
    expect(new Set(successful.map((r) => r.idempotencyKey)).size).toBe(1); // …same key, one effect
  });
});

/* ------------------------------------------------------------------ */
/* 13 — full create → complete lifecycle                               */
/* ------------------------------------------------------------------ */

describe("create → complete governed lifecycle", () => {
  it("runs the whole lifecycle and keeps the two effects separate", async () => {
    const task = "A3 lifecycle fixture";
    const { port, reserved, finalized } = fakeLedger();
    const events: string[] = [];
    const off = eventSpine.subscribe((e) => events.push(e.type));

    // CREATE
    const created = prepareNightPlanItemCreate({ task, operatorRef: OPERATOR });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const createReceipt = await run(created.plan, port);
    expect(createReceipt.status).toBe("succeeded");
    expect(createReceipt.verification.status).toBe("verified");

    // VERIFY CREATED
    const item = nightPlanStore.get().items.find((i) => i.task === task)!;
    expect(item.status).toBe("todo");

    // PREPARE → CONFIRM → EXECUTE → READ BACK → VERIFY
    const completePlan = planFor(item.id);
    const completeReceipt = await run(completePlan, port);
    expect(completeReceipt.status).toBe("succeeded");
    expect(completeReceipt.verification.status).toBe("verified");
    expect(nightPlanStore.get().items.find((i) => i.id === item.id)?.status).toBe("done");

    // AUDIT — two distinct records, in order, never overwriting each other.
    const types = reserved.map((r) => r.actionType);
    expect(types).toEqual(["add_night_plan_item", "complete_night_plan_item"]);
    expect(reserved[0]!.idempotencyKey).not.toBe(reserved[1]!.idempotencyKey);
    expect(finalized.filter((f) => f.status === "success")).toHaveLength(2);

    // EVENT LEDGER — meaningful lifecycle events, no duplicate completions.
    off();
    expect(events.filter((t) => t === "night_plan.item_completed")).toHaveLength(1);
    expect(events.filter((t) => t === "night_plan.item_added")).toHaveLength(1);
    expect(events).toContain("capability.verified");

    // CORRELATION — create and complete are separately reconstructable.
    expect(created.plan.correlationId).not.toBe(completePlan.correlationId);
    expect(completePlan.correlationId).toContain(item.id);
  });

  it("re-rendering or re-reading state emits no further lifecycle events", async () => {
    const id = seedItem("A3 no phantom events");
    const { port } = fakeLedger();
    await run(planFor(id), port);
    const events: string[] = [];
    const off = eventSpine.subscribe((e) => events.push(e.type));
    nightPlanStore.get();
    nightPlanItemState(id);
    off();
    expect(events).toEqual([]);
  });
});

/* ------------------------------------------------------------------ */
/* 15 / 16 — Action Center + run reconstruction                        */
/* ------------------------------------------------------------------ */

describe("observability", () => {
  it("the Action Center shows the completion truthfully from proposal to done", async () => {
    const id = seedItem("A3 action center");
    const plan = planFor(id);
    executionStore.propose(plan, OPERATOR);
    expect(executionStore.get(plan.id)?.status).toBe("awaiting_confirmation");
    const proof = confirm(plan);
    executionStore.markRunning(plan, proof, OPERATOR);
    expect(executionStore.get(plan.id)?.status).toBe("running");
    const { port } = fakeLedger();
    const receipt = await run(plan, port, proof);
    executionStore.complete(plan, receipt, OPERATOR);
    const entry = executionStore.get(plan.id)!;
    expect(entry.status).toBe("done");
    expect(entry.receipt?.verification.status).toBe("verified");
    expect(executionStore.list().filter((e) => e.plan.id === plan.id)).toHaveLength(1);
  });

  it("the trace reconstructs every lifecycle phase in order", async () => {
    const id = seedItem("A3 inspector");
    const plan = planFor(id);
    const { port } = fakeLedger();
    const receipt = await run(plan, port);
    const phases = receipt.events.map((e) => e.phase);
    // `precondition` only appears when something is unmet; a clean run skips it.
    for (const phase of ["resolve", "authorize", "confirm", "reserve", "conflict_check", "apply", "verify", "audit"]) {
      expect(phases).toContain(phase);
    }
    expect(receipt.events.map((e) => e.note).join(" ")).toContain("complete_night_plan_item");
    expect(receipt.correlationId).toBe(plan.correlationId);
    expect(receipt.capabilityId).toBe("night_plan.item.complete");
  });
});

/* ------------------------------------------------------------------ */
/* 20 — locked capability regression + autonomy ceiling                */
/* ------------------------------------------------------------------ */

describe("no activation creep", () => {
  it("keeps the locked capabilities exactly as they were", () => {
    expect(getExecutableCapability("knowledge.draft.create")?.ledgerActionType).toBeNull();
    expect(resolveLedgerActionType("knowledge.draft.create").ok).toBe(false);
    expect(getProvider("knowledge.draft.create")).toBeUndefined();
    expect(getExecutableCapability("freshdesk.ticket.classify")?.riskClass).toBe("medium");
    expect(getExecutableCapability("fixture.blocked.capability")?.confirmation).toBe("blocked");
  });

  it("every night plan completion is requested by an operator, never by a model", async () => {
    const plan = planFor(seedItem("A3 autonomy"));
    expect(plan.requestedBy).toBe("operator");
    const { port } = fakeLedger();
    const receipt = await run(plan, port);
    expect(receipt.planId).toBe(plan.id);
  });
});
