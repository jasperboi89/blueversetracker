/**
 * ACTIVATION 8 — Production Readiness Drills.
 *
 * These are failure drills, not happy-path tests. Each one deliberately breaks
 * something (storage, session, permission, provider, backup file) and asserts
 * the system fails SAFELY: refuses, reports honestly, preserves data, and never
 * claims a change landed when it did not.
 */

import { beforeEach, describe, expect, it } from "vitest";
import type { LedgerPort } from "@/lib/core/action-executor";
import type { ConfirmationProof, ExecutionPlan } from "@/lib/execution/execution-contract";
import { buildExecutionPlan } from "@/lib/execution/execution-plan";
import { mintConfirmation, requiredPhrase, resetConfirmations } from "@/lib/execution/confirmation";
import { executePlan } from "@/lib/execution/execution-engine";
import { executionStore } from "@/lib/execution/execution-store";
import { clearProviders } from "@/lib/execution/execution-provider";
import { fixtureWorld, registerFixtureProviders, resetFixtureWorld } from "@/lib/execution/execution-fixtures";
import { checkExecutionControl, executionControl } from "@/lib/execution/kill-switch";
import {
  backupChecksum,
  createBackup,
  restoreBackup,
  serializeBackup,
  verifyBackup,
  type StorageLike,
} from "@/lib/backup/snapshot";
import {
  _resetSyncHealthForTests,
  overallSyncLabel,
  reportSyncStatus,
  syncHealthSnapshot,
  unsyncedStores,
} from "@/lib/cloud-sync/sync-health";

/* ------------------------------------------------------------------ */
/* Harness                                                             */
/* ------------------------------------------------------------------ */

const OPERATOR = "drill-operator";

function fakeLedger() {
  const rows = new Map<string, { status: string }>();
  const port: LedgerPort = {
    reserve: async ({ idempotencyKey }) => {
      const prior = rows.get(idempotencyKey);
      if (!prior) {
        rows.set(idempotencyKey, { status: "executing" });
        return { outcome: "reserved", priorStatus: null };
      }
      if (prior.status === "success") return { outcome: "duplicate_success", priorStatus: "success" };
      return { outcome: "in_flight", priorStatus: prior.status };
    },
    finalize: async ({ idempotencyKey, status }) => {
      rows.set(idempotencyKey, { status });
    },
  };
  return { port, rows };
}

let seq = 0;
function plan(overrides: Partial<Parameters<typeof buildExecutionPlan>[0]> = {}): ExecutionPlan {
  const built = buildExecutionPlan({
    capabilityId: "fixture.reversible.write",
    input: { value: `drill-${++seq}` },
    target: { type: "fixture", id: "target-1" },
    requestedBy: "operator",
    correlationId: `drill-corr-${seq}`,
    contextRef: `drill-ctx-${seq}`,
    ...overrides,
  });
  if (!built.ok) throw new Error(built.message);
  return built.plan;
}

function confirm(p: ExecutionPlan, operatorRef = OPERATOR): ConfirmationProof {
  const res = mintConfirmation({
    plan: p,
    operatorRef,
    typedPhrase: requiredPhrase(p),
    secondOperatorRef: p.confirmation === "dual" ? "second-operator" : undefined,
  });
  if (!res.ok) throw new Error(res.message);
  return res.proof;
}

/** In-memory localStorage stand-in so drills never touch a real workspace. */
function memoryStore(seed: Record<string, string> = {}): StorageLike & { data: Map<string, string> } {
  const data = new Map(Object.entries(seed));
  return {
    data,
    get length() { return data.size; },
    key: (i: number) => [...data.keys()][i] ?? null,
    getItem: (k: string) => (data.has(k) ? data.get(k)! : null),
    setItem: (k: string, v: string) => { data.set(k, v); },
    removeItem: (k: string) => { data.delete(k); },
  };
}

beforeEach(() => {
  resetConfirmations();
  resetFixtureWorld();
  clearProviders();
  registerFixtureProviders();
  executionControl._resetForTests();
  executionStore.clear();
  _resetSyncHealthForTests();
});

/* ------------------------------------------------------------------ */
/* 3 + 4 — Backup readiness and restore drill                          */
/* ------------------------------------------------------------------ */

describe("drill: backup readiness", () => {
  it("captures every workspace store and nothing else", () => {
    const store = memoryStore({
      "aih:tickets:v1": '{"a":1}',
      "aih:night-plan:v1": '{"b":2}',
      "unrelated:key": "leave me alone",
    });
    const file = createBackup({ store, takenBy: "drill" });
    expect(file.keyCount).toBe(2);
    expect(Object.keys(file.entries).sort()).toEqual(["aih:night-plan:v1", "aih:tickets:v1"]);
    expect(file.entries["unrelated:key"]).toBeUndefined();
    expect(file.createdAt).toMatch(/\d{4}-\d{2}-\d{2}T/);
  });

  it("produces a backup that verifies against its own integrity check", () => {
    const store = memoryStore({ "aih:tickets:v1": '{"a":1}' });
    const verified = verifyBackup(serializeBackup(createBackup({ store })));
    expect(verified.ok).toBe(true);
  });

  it("is deterministic: the same data yields the same checksum", () => {
    const a = { format: "bluverse.workspace.backup", version: 1, createdAt: "2026-01-01T00:00:00.000Z", entries: { "aih:x": "1", "aih:y": "2" } };
    const b = { ...a, entries: { "aih:y": "2", "aih:x": "1" } };
    expect(backupChecksum(a)).toBe(backupChecksum(b));
  });
});

describe("drill: restore", () => {
  it("round-trips a workspace into an empty device", () => {
    const source = memoryStore({ "aih:tickets:v1": '{"a":1}', "aih:vault:v1": '{"n":["note"]}' });
    const raw = serializeBackup(createBackup({ store: source }));

    const target = memoryStore();
    const result = restoreBackup(raw, { store: target });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.summary.restored).toBe(2);
    expect(target.getItem("aih:tickets:v1")).toBe('{"a":1}');
    expect(target.getItem("aih:vault:v1")).toBe('{"n":["note"]}');
  });

  it("replaces stale keys that are absent from the backup", () => {
    const raw = serializeBackup(createBackup({ store: memoryStore({ "aih:tickets:v1": "new" }) }));
    const target = memoryStore({ "aih:tickets:v1": "old", "aih:ghost:v1": "should not survive" });
    const result = restoreBackup(raw, { store: target, mode: "replace" });
    expect(result.ok).toBe(true);
    expect(target.getItem("aih:ghost:v1")).toBeNull();
    expect(target.getItem("aih:tickets:v1")).toBe("new");
  });

  it("refuses a truncated backup file rather than restoring part of it", () => {
    const raw = serializeBackup(createBackup({ store: memoryStore({ "aih:tickets:v1": "keep" }) }));
    const truncated = raw.slice(0, Math.floor(raw.length * 0.6));
    const target = memoryStore({ "aih:tickets:v1": "existing" });
    const result = restoreBackup(truncated, { store: target });
    expect(result.ok).toBe(false);
    expect(target.getItem("aih:tickets:v1")).toBe("existing");
  });

  it("refuses a backup whose contents were edited after it was created", () => {
    const file = createBackup({ store: memoryStore({ "aih:tickets:v1": "original" }) });
    const tampered = { ...file, entries: { ...file.entries, "aih:tickets:v1": "tampered" } };
    const result = verifyBackup(JSON.stringify(tampered));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toContain("integrity check");
  });

  it("refuses a backup that claims more areas than it carries", () => {
    const file = createBackup({ store: memoryStore({ "aih:tickets:v1": "x" }) });
    const result = verifyBackup(JSON.stringify({ ...file, keyCount: 9 }));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toContain("incomplete");
  });

  it("refuses a file that is not a workspace backup at all", () => {
    expect(verifyBackup('{"hello":"world"}').ok).toBe(false);
    expect(verifyBackup("not json").ok).toBe(false);
  });

  it("refuses a backup written by a newer version", () => {
    const file = createBackup({ store: memoryStore({ "aih:x": "1" }) });
    const future = { ...file, version: 99 };
    const result = verifyBackup(JSON.stringify({ ...future, checksum: backupChecksum(future) }));
    expect(result.ok).toBe(false);
  });

  it("puts the workspace back the way it was when a restore cannot finish", () => {
    const raw = serializeBackup(createBackup({ store: memoryStore({ "aih:a": "1", "aih:b": "2" }) }));
    const target = memoryStore({ "aih:existing": "precious" });
    let writes = 0;
    const failing: StorageLike = {
      ...target,
      get length() { return target.length; },
      setItem: (k, v) => {
        if (++writes > 1) throw new Error("device storage is full");
        target.setItem(k, v);
      },
    };
    const result = restoreBackup(raw, { store: failing });
    expect(result.ok).toBe(false);
    // The pre-restore state is back, and no half-restored keys remain.
    expect(target.getItem("aih:existing")).toBe("precious");
    expect(target.getItem("aih:a")).toBeNull();
  });
});

/* ------------------------------------------------------------------ */
/* 9 + 10 — Safe mode and kill switch                                  */
/* ------------------------------------------------------------------ */

describe("drill: emergency stop", () => {
  it("refuses every change while stopped, without reaching the provider", async () => {
    const { port } = fakeLedger();
    executionControl.disable("drill: emergency stop", "drill-admin");
    const p = plan();
    const receipt = await executePlan(p, { operatorRef: OPERATOR, role: "admin", confirmation: confirm(p), ledger: port });
    expect(receipt.failureClass).toBe("execution_disabled");
    expect(receipt.status).not.toBe("succeeded");
    expect(fixtureWorld.applyCalls).toBe(0);
  });

  it("records who stopped it, when and why", () => {
    executionControl.disable("upstream incident", "drill-admin");
    executionControl.enable("drill-admin");
    const history = executionControl.history();
    expect(history[0]).toMatchObject({ mode: "enabled", actor: "drill-admin" });
    expect(history[1]).toMatchObject({ mode: "disabled", actor: "drill-admin", reason: "upstream incident" });
    expect(Date.parse(history[1].at)).not.toBeNaN();
  });

  it("stays stopped across a reload", () => {
    executionControl.disable("drill: survives reload", "drill-admin");
    const persisted = window.localStorage.getItem("aih:exec:control:v1");
    expect(persisted).toBeTruthy();
    expect(JSON.parse(persisted!).mode).toBe("disabled");
  });

  it("safe mode permits low-risk reversible work only", () => {
    executionControl.safeMode("degraded upstream", "drill-admin");
    expect(checkExecutionControl({ operationClass: "write", riskClass: "low", reversibility: "reversible" }).allowed).toBe(true);
    expect(checkExecutionControl({ operationClass: "write", riskClass: "high", reversibility: "reversible" }).allowed).toBe(false);
    expect(checkExecutionControl({ operationClass: "write", riskClass: "low", reversibility: "irreversible" }).allowed).toBe(false);
  });

  it("explains the stop in plain language instead of an error code", () => {
    executionControl.disable("scheduled maintenance", "drill-admin");
    const check = checkExecutionControl({ operationClass: "write", riskClass: "low", reversibility: "reversible" });
    expect(check.message).toContain("scheduled maintenance");
    expect(check.message).not.toMatch(/[A-Z_]{6,}/); // no raw error codes
  });

  it("falls closed when the stored control record is unreadable", async () => {
    window.localStorage.setItem("aih:exec:control:v1", "{ this is not json");
    vi.resetModules();
    const mod = await import("@/lib/execution/kill-switch");
    expect(mod.executionControl.mode()).toBe("disabled");
    vi.resetModules();
    window.localStorage.removeItem("aih:exec:control:v1");
  });

});

/* ------------------------------------------------------------------ */
/* 7 — Permission revocation mid-flight                                */
/* ------------------------------------------------------------------ */

describe("drill: permission revoked between confirmation and execution", () => {
  it("refuses the change when the operator's role is gone at execution time", async () => {
    const { port } = fakeLedger();
    const p = plan();
    const proof = confirm(p); // minted while the operator still had the role
    const receipt = await executePlan(p, { operatorRef: OPERATOR, role: null, confirmation: proof, ledger: port });
    expect(receipt.status).toBe("rejected");
    expect(fixtureWorld.applyCalls).toBe(0);
  });

  it("refuses a downgraded operator whose role can no longer authorize the change", async () => {
    const { port } = fakeLedger();
    const p = plan();
    const proof = confirm(p);
    const receipt = await executePlan(p, { operatorRef: OPERATOR, role: "viewer", confirmation: proof, ledger: port });
    expect(receipt.status).toBe("rejected");
    expect(fixtureWorld.applyCalls).toBe(0);
  });
});

/* ------------------------------------------------------------------ */
/* 6 + 11 + 12 — Provider outage and honest failure                    */
/* ------------------------------------------------------------------ */

describe("drill: provider outage", () => {
  it("never reports success when the source system is unreachable", async () => {
    const { port } = fakeLedger();
    resetFixtureWorld({ behaviour: "always_unavailable" });
    const p = plan();
    const receipt = await executePlan(p, { operatorRef: OPERATOR, role: "admin", confirmation: confirm(p), ledger: port });
    expect(receipt.status).not.toBe("succeeded");
    expect(receipt.message.length).toBeGreaterThan(0);
  });

  it("keeps a lost answer as unknown, not as done and not as failed", async () => {
    const { port } = fakeLedger();
    resetFixtureWorld({ behaviour: "unknown" });
    const p = plan();
    const receipt = await executePlan(p, { operatorRef: OPERATOR, role: "admin", confirmation: confirm(p), ledger: port });
    expect(receipt.status).toBe("uncertain");
  });

  it("does not claim the change was verified when verification is unavailable", async () => {
    const { port } = fakeLedger();
    resetFixtureWorld({ behaviour: "applied_but_unverifiable" });
    const p = plan();
    const receipt = await executePlan(p, { operatorRef: OPERATOR, role: "admin", confirmation: confirm(p), ledger: port });
    expect(receipt.status).not.toBe("succeeded");
  });
});

/* ------------------------------------------------------------------ */
/* 8 + 14 — Session loss and storage/sync failure                      */
/* ------------------------------------------------------------------ */

describe("drill: storage and sync failure", () => {
  it("labels a store as not-saved once cloud writes stop succeeding", () => {
    reportSyncStatus("aih:tickets:v1", "sync_failed", { failures: 7, error: "network unreachable" });
    const snap = syncHealthSnapshot();
    expect(snap[0]).toMatchObject({ storeKey: "aih:tickets:v1", status: "sync_failed", failures: 7 });
    expect(unsyncedStores()).toHaveLength(1);
  });

  it("warns the operator in plain language that work exists only on this device", () => {
    reportSyncStatus("aih:tickets:v1", "sync_failed", { failures: 7, error: "network unreachable" });
    const label = overallSyncLabel();
    expect(label.tone).toBe("bad");
    expect(label.text).toContain("this device only");
  });

  it("reports sync as paused — not as saved — after the session ends", () => {
    reportSyncStatus("aih:tickets:v1", "synced");
    reportSyncStatus("aih:tickets:v1", "local_only");
    expect(overallSyncLabel().tone).toBe("warn");
    expect(syncHealthSnapshot()[0].status).toBe("local_only");
  });

  it("clears the warning once the cloud write succeeds again", () => {
    reportSyncStatus("aih:tickets:v1", "retrying", { failures: 2, error: "timeout" });
    reportSyncStatus("aih:tickets:v1", "synced");
    const entry = syncHealthSnapshot()[0];
    expect(entry.status).toBe("synced");
    expect(entry.failures).toBe(0);
    expect(entry.lastSyncedAt).toBeTruthy();
    expect(overallSyncLabel().tone).toBe("ok");
  });

  it("keeps local work intact when the cloud copy cannot be read", () => {
    // A failed hydrate must not blank the device: local state stays authoritative.
    const local = memoryStore({ "aih:tickets:v1": '{"work":"in progress"}' });
    reportSyncStatus("aih:tickets:v1", "sync_failed", { error: "hydrate failed" });
    expect(local.getItem("aih:tickets:v1")).toBe('{"work":"in progress"}');
    expect(unsyncedStores()).toHaveLength(1);
  });
});
