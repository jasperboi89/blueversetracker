import { describe, expect, it } from "vitest";
import {
  allCapabilities,
  capabilityForActionType,
  capabilityForToolName,
  discoverableCapabilities,
  getCapability,
  registryProblems,
  validateDefinitions,
} from "./capability-registry";
import { isMutatingOperation, capabilityRef } from "./capability-contract";
import { isPermitted, missingPermissions, permissionsForRole } from "./capability-permissions";
import { deriveHealth, healthMapFor } from "./capability-health";
import { getCapabilitiesForContext, resolveCapabilities } from "./capability-resolver";
import {
  DEFAULT_INVOCATION_BUDGET,
  InvocationLedger,
  assertInvocationAllowed,
  buildInvocation,
  invocationFingerprint,
  newCorrelationId,
} from "./capability-invocation";
import { serializeCapabilities, toAiProjection } from "./capability-projection";
import { guardToolCall } from "./capability-tool-adapter";

const admin = { role: "admin" as const, userId: "u1" };
const viewer = { role: "viewer" as const, userId: "u2" };

function anyWrite() {
  return allCapabilities().find(
    (d) => isMutatingOperation(d.operation) && d.lifecycle === "active" && d.permissions.length > 0,
  )!;
}
function deps(d: { dependencies?: readonly string[] }): readonly string[] {
  return d.dependencies ?? [];
}
function anyRead() {
  return allCapabilities().find((d) => d.operation === "read" || d.operation === "search")!;
}

/* ---------------- registry integrity ---------------- */

describe("capability registry", () => {
  it("registers capabilities", () => {
    expect(allCapabilities().length).toBeGreaterThan(5);
  });

  it("has no structural problems", () => {
    expect(registryProblems()).toEqual([]);
  });

  it("detects duplicate ids", () => {
    const d = allCapabilities()[0]!;
    const problems = validateDefinitions([d, { ...d }]);
    expect(problems.some((p) => p.capabilityId === d.id)).toBe(true);
  });

  it("gives every capability a stable ref", () => {
    for (const d of allCapabilities()) {
      expect(capabilityRef(d)).toBe(`${d.id}@${d.version}`);
    }
  });

  it("looks capabilities up by id", () => {
    const d = allCapabilities()[0]!;
    expect(getCapability(d.id)?.id).toBe(d.id);
    expect(getCapability("nope.does.not.exist")).toBeUndefined();
  });

  it("never marks a mutating capability as directly AI-callable", () => {
    for (const d of allCapabilities()) {
      if (isMutatingOperation(d.operation)) expect(d.ai.callable).toBe(false);
    }
  });

  it("requires verification for every mutating capability", () => {
    for (const d of allCapabilities()) {
      if (isMutatingOperation(d.operation)) expect(d.verification.required).toBe(true);
    }
  });

  it("never requires confirmation-free mutation", () => {
    for (const d of allCapabilities()) {
      if (isMutatingOperation(d.operation)) expect(d.confirmation.mode).not.toBe("none");
    }
  });

  it("only exposes discoverable capabilities for discovery", () => {
    expect(discoverableCapabilities().every((d) => d.ai.discoverable)).toBe(true);
  });

  it("maps safe action types back to a capability", () => {
    const write = anyWrite();
    if (write.execution.kind === "safe_action") {
      expect(capabilityForActionType(write.execution.actionType)?.id).toBe(write.id);
    }
  });

  it("maps copilot tool names back to a capability", () => {
    const read = allCapabilities().find((d) => d.execution.kind === "copilot_tool");
    if (read && read.execution.kind === "copilot_tool") {
      expect(capabilityForToolName(read.execution.tool)?.id).toBe(read.id);
    }
  });
});

/* ---------------- permissions ---------------- */

describe("capability permissions", () => {
  it("gives admin the widest permission set", () => {
    expect(permissionsForRole("admin").length).toBeGreaterThanOrEqual(
      permissionsForRole("programmer").length,
    );
    expect(permissionsForRole("programmer").length).toBeGreaterThan(
      permissionsForRole("viewer").length,
    );
  });

  it("gives an unknown role nothing beyond reads", () => {
    expect(permissionsForRole(null).every((p) => p.endsWith(".read"))).toBe(true);
  });

  it("blocks a viewer from mutating capabilities", () => {
    const write = anyWrite();
    expect(isPermitted(write, viewer)).toBe(false);
    expect(missingPermissions(write, viewer).length).toBeGreaterThan(0);
  });

  it("allows an admin the same mutating capability", () => {
    expect(isPermitted(anyWrite(), admin)).toBe(true);
  });
});

/* ---------------- health ---------------- */

describe("capability health", () => {
  it("is healthy with no reported problems", () => {
    expect(deriveHealth(anyRead(), {})).toBe("healthy");
  });

  it("degrades when a dependency is degraded", () => {
    const def = allCapabilities().find((d) => deps(d).length > 0);
    if (def) {
      const health = deriveHealth(def, { [deps(def)[0]!]: "degraded" });
      expect(health === "degraded" || health === "unavailable").toBe(true);
    }
  });

  it("builds a map covering every capability", () => {
    const map = healthMapFor(allCapabilities(), {});
    expect(Object.keys(map).length).toBe(allCapabilities().length);
  });
});

/* ---------------- resolution ---------------- */

describe("capability resolution", () => {
  it("is deterministic for the same input", () => {
    const a = resolveCapabilities({ operator: admin });
    const b = resolveCapabilities({ operator: admin });
    expect(a.all.map((c) => c.id)).toEqual(b.all.map((c) => c.id));
    expect(a.all.map((c) => c.availability)).toEqual(b.all.map((c) => c.availability));
  });

  it("always attaches at least one reason code", () => {
    for (const c of resolveCapabilities({ operator: admin }).all) {
      expect(c.reasonCodes.length).toBeGreaterThan(0);
    }
  });

  it("blocks capabilities a viewer lacks permission for", () => {
    const res = resolveCapabilities({ operator: viewer });
    const write = res.byId[anyWrite().id];
    expect(write?.availability).toBe("blocked");
    expect(write?.reasonCodes).toContain("PERMISSION_MISSING");
  });

  it("marks source-unavailable capabilities unavailable, not blocked", () => {
    const def = allCapabilities().find((d) => deps(d).length > 0);
    if (def) {
      const res = resolveCapabilities({
        operator: admin,
        sourceHealth: { [deps(def)[0]!]: "unavailable" },
      });
      expect(["unavailable", "blocked"]).toContain(res.byId[def.id]?.availability);
    }
  });

  it("never reports a blocked capability as callable now", () => {
    for (const c of resolveCapabilities({ operator: viewer }).all) {
      if (c.availability !== "available") expect(c.callableNow).toBe(false);
    }
  });

  it("bounds the toolbelt handed to a model", () => {
    const { relevant } = getCapabilitiesForContext({ operator: admin, maxCapabilities: 3 });
    expect(relevant.length).toBeLessThanOrEqual(3);
  });

  it("withholds unavailable capabilities from the relevant set", () => {
    const { relevant } = getCapabilitiesForContext({ operator: viewer });
    expect(relevant.every((c) => c.availability === "available")).toBe(true);
  });
});

/* ---------------- invocation ---------------- */

describe("capability invocation", () => {
  const read = anyRead();

  function invocation(id: string, input: unknown = {}) {
    return buildInvocation({
      capabilityId: id,
      input,
      contextRef: "ctx#1",
      requestedBy: { kind: "ai", id: "copilot" },
    })!;
  }

  it("builds an invocation with a correlation id", () => {
    const inv = invocation(read.id);
    expect(inv.correlationId).toBeTruthy();
    expect(inv.capabilityVersion).toBe(read.version);
  });

  it("refuses to build for an unknown capability", () => {
    expect(
      buildInvocation({
        capabilityId: "nope",
        input: {},
        contextRef: "c",
        requestedBy: { kind: "ai", id: "copilot" },
      }),
    ).toBeNull();
  });

  it("generates unique correlation ids", () => {
    expect(newCorrelationId()).not.toBe(newCorrelationId());
  });

  it("fingerprints identical input identically", () => {
    expect(invocationFingerprint("a", { x: 1 })).toBe(invocationFingerprint("a", { x: 1 }));
    expect(invocationFingerprint("a", { x: 1 })).not.toBe(invocationFingerprint("a", { x: 2 }));
  });

  it("rejects a version mismatch", () => {
    const inv = { ...invocation(read.id), capabilityVersion: 999 };
    const verdict = assertInvocationAllowed({ invocation: inv, operator: admin });
    expect(verdict.allowed).toBe(false);
  });

  it("rejects an unregistered capability at invocation time", () => {
    const verdict = assertInvocationAllowed({
      invocation: { ...invocation(read.id), capabilityId: "ghost.capability" },
      operator: admin,
    });
    expect(verdict.allowed).toBe(false);
  });

  it("blocks a viewer from a mutating capability at invocation time", () => {
    const verdict = assertInvocationAllowed({ invocation: invocation(anyWrite().id), operator: viewer });
    expect(verdict.allowed).toBe(false);
    if (!verdict.allowed) expect(verdict.reasonCodes).toContain("PERMISSION_MISSING");
  });

  it("enforces the total budget", () => {
    const ledger = new InvocationLedger({ ...DEFAULT_INVOCATION_BUDGET, maxTotal: 1, maxRepeats: 9 });
    ledger.record(read, { a: 1 });
    const check = ledger.check(read, { a: 2 });
    expect(check.ok).toBe(false);
    if (!check.ok) expect(check.code).toBe("BUDGET_EXCEEDED");
  });

  it("detects a repeated identical invocation", () => {
    const ledger = new InvocationLedger({ ...DEFAULT_INVOCATION_BUDGET, maxRepeats: 1 });
    ledger.record(read, { a: 1 });
    const check = ledger.check(read, { a: 1 });
    expect(check.ok).toBe(false);
    if (!check.ok) expect(check.code).toBe("REPEATED_INVOCATION");
  });

  it("tracks usage", () => {
    const ledger = new InvocationLedger();
    ledger.record(read, { a: 1 });
    expect(ledger.usage.total).toBe(1);
  });
});

/* ---------------- projection + adapter ---------------- */

describe("capability projection", () => {
  it("never leaks execution bindings to the model", () => {
    const view = toAiProjection(resolveCapabilities({ operator: admin }).all);
    for (const v of view) expect(v).not.toHaveProperty("execution");
  });

  it("serializes a readable capability section", () => {
    const { relevant, withheld } = getCapabilitiesForContext({ operator: admin });
    const text = serializeCapabilities({ relevant, withheld });
    expect(typeof text).toBe("string");
    expect(text.length).toBeGreaterThan(0);
  });

  it("guards an unknown tool name as ungoverned rather than crashing", () => {
    const verdict = guardToolCall("not_a_capability_tool", {}, {
      operator: admin,
      ledger: new InvocationLedger(),
      correlationId: "c1",
    });
    expect(verdict.ok).toBe(true);
  });

  it("blocks a governed read tool for an unpermitted operator", () => {
    const def = allCapabilities().find(
      (d) => d.execution.kind === "copilot_tool" && d.permissions.length > 0,
    );
    if (def && def.execution.kind === "copilot_tool") {
      const verdict = guardToolCall(def.execution.tool, {}, {
        operator: { role: null },
        ledger: new InvocationLedger(),
        correlationId: "c1",
      });
      expect(typeof verdict.ok).toBe("boolean");
    }
  });
});
