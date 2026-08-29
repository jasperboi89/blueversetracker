import { beforeEach, describe, expect, it } from "vitest";
import type { LedgerPort } from "@/lib/core/action-executor";
import {
  isExecMutating,
  minimumConfirmation,
  resolveConfirmation,
  type ConfirmationProof,
  type ExecutionPlan,
} from "./execution-contract";
import {
  executableRegistryIssues,
  getExecutableCapability,
  isExecutable,
  listExecutableCapabilities,
} from "./executable-registry";
import { buildExecutionPlan, describePlan, verifyPlanIntegrity } from "./execution-plan";
import {
  CONFIRMATION_TTL_MS,
  mintConfirmation,
  requiredPhrase,
  resetConfirmations,
  validateConfirmation,
} from "./confirmation";
import { executionControl } from "./kill-switch";
import { authorizeExecution } from "./execution-guard";
import { clearProviders } from "./execution-provider";
import { executePlan } from "./execution-engine";
import { executionStore, needsAttention, visibleExecutions } from "./execution-store";
import { fixtureWorld, registerFixtureProviders, resetFixtureWorld } from "./execution-fixtures";
import { fingerprint } from "./fingerprint";

const OPERATOR = "op-1";
const LEASE_MS = 90_000;

function fakeLedger(now: () => number = Date.now) {
  const rows = new Map<string, { status: string; leaseAt: number }>();
  const port: LedgerPort = {
    reserve: async ({ idempotencyKey }) => {
      const prior = rows.get(idempotencyKey);
      if (!prior) {
        rows.set(idempotencyKey, { status: "executing", leaseAt: now() });
        return { outcome: "reserved", priorStatus: null };
      }
      if (prior.status === "success") return { outcome: "duplicate_success", priorStatus: "success" };
      if (prior.status === "failed") {
        rows.set(idempotencyKey, { status: "executing", leaseAt: now() });
        return { outcome: "retry", priorStatus: "failed" };
      }
      if (now() - prior.leaseAt < LEASE_MS) return { outcome: "in_flight", priorStatus: "executing" };
      return { outcome: "uncertain", priorStatus: "executing" };
    },
    finalize: async ({ idempotencyKey, status }) => {
      rows.set(idempotencyKey, { status, leaseAt: now() });
    },
  };
  return { port, rows };
}

let seq = 0;
function plan(overrides: Partial<Parameters<typeof buildExecutionPlan>[0]> = {}): ExecutionPlan {
  const built = buildExecutionPlan({
    capabilityId: "fixture.reversible.write",
    input: { value: `v${++seq}` },
    target: { type: "fixture", id: "target-1" },
    requestedBy: "operator",
    correlationId: `corr-${seq}`,
    contextRef: `ctx-${seq}`,
    ...overrides,
  });
  if (!built.ok) throw new Error(built.message);
  return built.plan;
}

function confirm(p: ExecutionPlan, opts: { operatorRef?: string } = {}): ConfirmationProof {
  const res = mintConfirmation({
    plan: p,
    operatorRef: opts.operatorRef ?? OPERATOR,
    typedPhrase: requiredPhrase(p),
    secondOperatorRef: p.confirmation === "dual" ? "op-2" : undefined,
  });
  if (!res.ok) throw new Error(res.message);
  return res.proof;
}

beforeEach(() => {
  resetConfirmations();
  resetFixtureWorld();
  clearProviders();
  registerFixtureProviders();
  executionControl.enable();
  executionStore.clear();
});

/* ------------------------------------------------------------------ */

describe("executable allowlist", () => {
  it("refuses capabilities that are not on the allowlist", () => {
    expect(isExecutable("account.config.update")).toBe(false);
    expect(isExecutable("totally.made.up")).toBe(false);
    expect(isExecutable("night_plan.item.create")).toBe(true);
  });

  it("never exposes fixture capabilities on operator surfaces", () => {
    expect(listExecutableCapabilities().some((c) => c.fixtureOnly)).toBe(false);
  });

  it("stays consistent with the canonical capability registry", () => {
    expect(executableRegistryIssues()).toEqual([]);
  });

  it("raises a declared confirmation that is weaker than its class floor", () => {
    const external = getExecutableCapability("fixture.external.side_effect")!;
    expect(external.confirmation).toBe("dual"); // critical + external ⇒ dual
    expect(minimumConfirmation("external_side_effect", "critical")).toBe("dual");
    expect(resolveConfirmation("none", "irreversible_write", "high")).toBe("typed");
    expect(resolveConfirmation("blocked", "read", "low")).toBe("blocked");
    expect(isExecMutating("prepare")).toBe(false);
  });

  it("blocked capabilities cannot even be planned", () => {
    const res = buildExecutionPlan({
      capabilityId: "fixture.blocked.capability",
      input: {},
      target: { type: "fixture", id: "x" },
      requestedBy: "operator",
      correlationId: "c",
      contextRef: "ctx",
    });
    expect(res.ok).toBe(false);
  });
});

describe("plan immutability", () => {
  it("fingerprints only effect-determining fields", () => {
    const a = plan({ input: { value: "same" }, correlationId: "c1" });
    const b = plan({ input: { value: "same" }, correlationId: "c2" });
    expect(a.fingerprint).toBe(b.fingerprint);
  });

  it("changes fingerprint when the input changes", () => {
    expect(plan({ input: { value: "a" } }).fingerprint).not.toBe(plan({ input: { value: "b" } }).fingerprint);
  });

  it("is frozen and detects tampering", () => {
    const p = plan();
    expect(Object.isFrozen(p)).toBe(true);
    const tampered = { ...p, input: { value: "evil" } } as ExecutionPlan;
    expect(verifyPlanIntegrity(p)).toBe(true);
    expect(verifyPlanIntegrity(tampered)).toBe(false);
  });

  it("previews the effect deterministically", () => {
    const p = plan();
    expect(describePlan(p)[0]).toContain("fixture record");
  });

  it("keys idempotency on the effect, not the attempt", () => {
    const a = plan({ input: { value: "k" } });
    const b = plan({ input: { value: "k" } });
    expect(a.idempotencyKey).toBe(b.idempotencyKey);
  });
});

describe("confirmation proofs", () => {
  it("rejects execution with no confirmation at all", async () => {
    const { port } = fakeLedger();
    const receipt = await executePlan(plan(), {
      operatorRef: OPERATOR,
      role: "admin",
      confirmation: null,
      ledger: port,
    });
    expect(receipt.status).toBe("rejected");
    expect(receipt.failureClass).toBe("confirmation_invalid");
    expect(fixtureWorld.applyCalls).toBe(0);
  });

  it("rejects a confirmation minted for a different plan", async () => {
    const { port } = fakeLedger();
    const other = confirm(plan({ input: { value: "other" } }));
    const receipt = await executePlan(plan({ input: { value: "target" } }), {
      operatorRef: OPERATOR,
      role: "admin",
      confirmation: other,
      ledger: port,
    });
    expect(receipt.failureClass).toBe("confirmation_invalid");
    expect(fixtureWorld.applyCalls).toBe(0);
  });

  it("rejects a confirmation from a different operator", async () => {
    const { port } = fakeLedger();
    const p = plan();
    const receipt = await executePlan(p, {
      operatorRef: "someone-else",
      role: "admin",
      confirmation: confirm(p),
      ledger: port,
    });
    expect(receipt.failureClass).toBe("confirmation_invalid");
  });

  it("expires confirmations", () => {
    const p = plan();
    const proof = confirm(p);
    const check = validateConfirmation(p, proof, {
      operatorRef: OPERATOR,
      now: () => Date.now() + CONFIRMATION_TTL_MS + 1,
    });
    expect(check.ok).toBe(false);
    expect(check.ok === false && check.failure).toBe("confirmation_expired");
  });

  it("is single use", async () => {
    const { port } = fakeLedger();
    const p = plan();
    const proof = confirm(p);
    const first = await executePlan(p, { operatorRef: OPERATOR, role: "admin", confirmation: proof, ledger: port });
    const second = await executePlan(p, { operatorRef: OPERATOR, role: "admin", confirmation: proof, ledger: port });
    expect(first.status).toBe("succeeded");
    expect(second.status).not.toBe("succeeded");
    expect(fixtureWorld.applyCalls).toBe(1);
  });

  it("requires the exact typed phrase for high-risk operations", () => {
    const p = plan({ capabilityId: "fixture.external.side_effect", input: { value: "x" } });
    expect(mintConfirmation({ plan: p, operatorRef: OPERATOR, typedPhrase: "yes", secondOperatorRef: "op-2" }).ok).toBe(false);
    expect(
      mintConfirmation({ plan: p, operatorRef: OPERATOR, typedPhrase: requiredPhrase(p), secondOperatorRef: "op-2" }).ok,
    ).toBe(true);
  });

  it("requires a second, different operator for dual confirmation", () => {
    const p = plan({ capabilityId: "fixture.external.side_effect", input: { value: "x" } });
    const same = mintConfirmation({
      plan: p,
      operatorRef: OPERATOR,
      typedPhrase: requiredPhrase(p),
      secondOperatorRef: OPERATOR,
    });
    expect(same.ok).toBe(false);
  });
});

describe("authorization is re-checked at execution time", () => {
  it("denies when the operator has no role", () => {
    const verdict = authorizeExecution(plan(), { operatorRef: "", role: null });
    expect(verdict.allowed).toBe(false);
  });

  it("denies unmet preconditions before anything runs", async () => {
    const { port } = fakeLedger();
    const p = plan({ unmetPreconditions: ["shift context"] });
    const receipt = await executePlan(p, {
      operatorRef: OPERATOR,
      role: "admin",
      confirmation: confirm(p),
      ledger: port,
    });
    expect(receipt.failureClass).toBe("precondition_failed");
    expect(fixtureWorld.applyCalls).toBe(0);
  });

  it("honours the kill switch without touching the provider", async () => {
    const { port } = fakeLedger();
    executionControl.disable("incident");
    const p = plan();
    const receipt = await executePlan(p, {
      operatorRef: OPERATOR,
      role: "admin",
      confirmation: confirm(p),
      ledger: port,
    });
    expect(receipt.failureClass).toBe("execution_disabled");
    expect(receipt.message).toContain("incident");
    expect(fixtureWorld.applyCalls).toBe(0);
  });

  it("safe mode allows only low-risk reversible work", async () => {
    const { port } = fakeLedger();
    executionControl.safeMode("degraded upstream");
    const risky = plan({ capabilityId: "fixture.external.side_effect", input: { value: "x" } });
    const blocked = await executePlan(risky, {
      operatorRef: OPERATOR,
      role: "admin",
      confirmation: confirm(risky),
      ledger: port,
    });
    expect(blocked.failureClass).toBe("execution_disabled");

    const safe = plan();
    const ok = await executePlan(safe, {
      operatorRef: OPERATOR,
      role: "admin",
      confirmation: confirm(safe),
      ledger: port,
    });
    expect(ok.status).toBe("succeeded");
  });
});

describe("TOCTOU protection", () => {
  it("refuses to apply when the target changed after planning", async () => {
    const { port } = fakeLedger();
    const preState = { fingerprint: fingerprint({ value: "initial" }), observedAt: new Date().toISOString() };
    const p = plan({ preState });
    fixtureWorld.drift = true;
    const receipt = await executePlan(p, {
      operatorRef: OPERATOR,
      role: "admin",
      confirmation: confirm(p),
      ledger: port,
    });
    expect(receipt.failureClass).toBe("conflict_detected");
    expect(fixtureWorld.applyCalls).toBe(0);
  });

  it("refuses when current state cannot be read", async () => {
    const { port } = fakeLedger();
    const preState = { fingerprint: fingerprint({ value: "initial" }), observedAt: new Date().toISOString() };
    const p = plan({ preState });
    fixtureWorld.readable = false;
    const receipt = await executePlan(p, {
      operatorRef: OPERATOR,
      role: "admin",
      confirmation: confirm(p),
      ledger: port,
    });
    expect(receipt.status).toBe("failed");
    expect(fixtureWorld.applyCalls).toBe(0);
  });
});

describe("idempotency", () => {
  it("suppresses a proven duplicate instead of re-applying", async () => {
    const { port } = fakeLedger();
    const p = plan({ input: { value: "dup" } });
    await executePlan(p, { operatorRef: OPERATOR, role: "admin", confirmation: confirm(p), ledger: port });

    const samePlan = plan({ input: { value: "dup" } });
    const second = await executePlan(samePlan, {
      operatorRef: OPERATOR,
      role: "admin",
      confirmation: confirm(samePlan),
      ledger: port,
    });
    expect(second.failureClass).toBe("duplicate_suppressed");
    expect(fixtureWorld.applyCalls).toBe(1);
  });

  it("reports an expired reservation as uncertain, never as applied", async () => {
    let now = Date.now();
    const { port } = fakeLedger(() => now);
    const p = plan();
    await port.reserve({
      actionId: p.id,
      idempotencyKey: p.idempotencyKey,
      actionType: p.capabilityId,
      origin: "operator",
    });
    now += LEASE_MS + 1;
    const receipt = await executePlan(p, {
      operatorRef: OPERATOR,
      role: "admin",
      confirmation: confirm(p),
      ledger: port,
      now: () => now,
    });
    expect(receipt.status).toBe("uncertain");
    expect(fixtureWorld.applyCalls).toBe(0);
  });

  it("does not apply when the ledger is unreachable", async () => {
    const p = plan();
    const receipt = await executePlan(p, {
      operatorRef: OPERATOR,
      role: "admin",
      confirmation: confirm(p),
      ledger: {
        reserve: async () => {
          throw new Error("down");
        },
        finalize: async () => undefined,
      },
    });
    expect(receipt.status).toBe("failed");
    expect(fixtureWorld.applyCalls).toBe(0);
  });
});

describe("outcome honesty", () => {
  it("classifies a provider rejection", async () => {
    const { port } = fakeLedger();
    resetFixtureWorld({ behaviour: "rejected" });
    const p = plan();
    const receipt = await executePlan(p, { operatorRef: OPERATOR, role: "admin", confirmation: confirm(p), ledger: port });
    expect(receipt.status).toBe("failed");
    expect(receipt.failureClass).toBe("provider_rejected");
  });

  it("treats an unknown outcome as uncertain and recommends manual verification", async () => {
    const { port } = fakeLedger();
    resetFixtureWorld({ behaviour: "unknown" });
    const p = plan();
    const receipt = await executePlan(p, { operatorRef: OPERATOR, role: "admin", confirmation: confirm(p), ledger: port });
    expect(receipt.status).toBe("uncertain");
    expect(receipt.failureClass).toBe("timeout_unknown_state");
    expect(receipt.recovery.kind).toBe("verify_manually");
    expect(receipt.recovery.automatic).toBe(false);
  });

  it("surfaces a partial effect with what landed and what did not", async () => {
    const { port } = fakeLedger();
    resetFixtureWorld({ behaviour: "partial" });
    const p = plan();
    const receipt = await executePlan(p, { operatorRef: OPERATOR, role: "admin", confirmation: confirm(p), ledger: port });
    expect(receipt.status).toBe("uncertain");
    expect(receipt.failureClass).toBe("partial_effect");
    expect(receipt.message).toContain("notification");
  });

  it("retries only idempotent work, within the declared ceiling", async () => {
    const { port } = fakeLedger();
    resetFixtureWorld({ behaviour: "unavailable_then_applied", unavailableCallsLeft: 1 });
    const p = plan();
    const receipt = await executePlan(p, { operatorRef: OPERATOR, role: "admin", confirmation: confirm(p), ledger: port });
    expect(receipt.status).toBe("succeeded");
    expect(receipt.attempts).toBe(2);
  });

  it("never retries a non-idempotent capability", async () => {
    const { port } = fakeLedger();
    resetFixtureWorld({ behaviour: "always_unavailable" });
    const p = plan({ capabilityId: "fixture.external.side_effect", input: { value: "x" } });
    const receipt = await executePlan(p, { operatorRef: OPERATOR, role: "admin", confirmation: confirm(p), ledger: port });
    expect(receipt.attempts).toBe(1);
    expect(receipt.failureClass).toBe("provider_unavailable");
  });

  it("stops retrying at the attempt ceiling", async () => {
    const { port } = fakeLedger();
    resetFixtureWorld({ behaviour: "always_unavailable" });
    const p = plan();
    const receipt = await executePlan(p, { operatorRef: OPERATOR, role: "admin", confirmation: confirm(p), ledger: port });
    expect(receipt.attempts).toBe(getExecutableCapability("fixture.reversible.write")!.maxAttempts);
  });
});

describe("verification is independent of execution", () => {
  it("does not claim success when verification is unavailable", async () => {
    const { port } = fakeLedger();
    resetFixtureWorld({ behaviour: "applied_but_unverifiable" });
    const p = plan();
    const receipt = await executePlan(p, { operatorRef: OPERATOR, role: "admin", confirmation: confirm(p), ledger: port });
    expect(receipt.status).toBe("uncertain");
    expect(receipt.verification.status).toBe("unavailable");
    expect(receipt.failureClass).toBe("verification_unavailable");
  });

  it("offers compensation when verification contradicts the intent", async () => {
    const { port } = fakeLedger();
    resetFixtureWorld({ behaviour: "applied_but_verification_fails" });
    const p = plan();
    const receipt = await executePlan(p, { operatorRef: OPERATOR, role: "admin", confirmation: confirm(p), ledger: port });
    expect(receipt.status).toBe("compensation_available");
    expect(receipt.verification.status).toBe("failed");
  });

  it("records a full ordered lifecycle trace on success", async () => {
    const { port } = fakeLedger();
    const p = plan();
    const receipt = await executePlan(p, { operatorRef: OPERATOR, role: "admin", confirmation: confirm(p), ledger: port });
    expect(receipt.status).toBe("succeeded");
    expect(receipt.events.map((e) => e.phase)).toEqual([
      "resolve",
      "authorize",
      "confirm",
      "reserve",
      "conflict_check",
      "apply",
      "verify",
      "audit",
    ]);
    expect(receipt.verification.status).toBe("verified");
    expect(receipt.ledgerSynced).toBe(true);
  });
});

describe("action center store", () => {
  it("keeps operator isolation and surfaces what needs attention", async () => {
    const { port } = fakeLedger();
    const p = plan();
    executionStore.propose(p, OPERATOR);
    expect(needsAttention(executionStore.list())).toHaveLength(1);

    resetFixtureWorld({ behaviour: "unknown" });
    const receipt = await executePlan(p, { operatorRef: OPERATOR, role: "admin", confirmation: confirm(p), ledger: port });
    executionStore.complete(p, receipt, OPERATOR);

    expect(needsAttention(executionStore.list())).toHaveLength(1);
    expect(visibleExecutions(executionStore.list(), "other", false)).toHaveLength(0);
    expect(visibleExecutions(executionStore.list(), "other", true)).toHaveLength(1);
  });
});
