import { beforeEach, describe, expect, it } from "vitest";
import {
  prepareCompletedWorkEntry,
  prepareShiftSummaryDraft,
  prepareScriptFixFinding,
  COMPLETED_WORK_CREATE_CAPABILITY,
  SHIFT_SUMMARY_DRAFT_CAPABILITY,
  SCRIPT_FIX_FINDING_CAPABILITY,
} from "./governed-producers";
import { INTERNAL_ACTION_HANDLERS } from "./internal-handlers";
import { internalRecords } from "./internal-records";
import { proposeSevenZeroTwoTwoDemo } from "./demo-actions";
import { executionStore, queueStatus, type ExecutionEntry } from "@/lib/execution/execution-store";
import { executePlan } from "@/lib/execution/execution-engine";
import { registerInternalActionProviders } from "./internal-providers";
import { mintConfirmation, requiredPhrase, resetConfirmations } from "@/lib/execution/confirmation";
import { executionControl } from "@/lib/execution/kill-switch";
import type {
  ExecutionPlan,
  ConfirmationProof,
  ExecutionReceipt,
} from "@/lib/execution/execution-contract";
import type { LedgerPort } from "@/lib/core/action-executor";

const OPERATOR = "op-1";

/** Minimal in-memory ledger port, mirroring the phase-10 test fixture. */
function fakeLedger(): LedgerPort {
  const rows = new Map<string, string>();
  return {
    reserve: async ({ idempotencyKey }) => {
      if (!rows.has(idempotencyKey)) {
        rows.set(idempotencyKey, "executing");
        return { outcome: "reserved", priorStatus: null };
      }
      const s = rows.get(idempotencyKey)!;
      if (s === "success") return { outcome: "duplicate_success", priorStatus: "success" };
      rows.set(idempotencyKey, "executing");
      return { outcome: "retry", priorStatus: "failed" };
    },
    finalize: async ({ idempotencyKey, status }) => {
      rows.set(idempotencyKey, status);
    },
  };
}

function confirm(plan: ExecutionPlan): ConfirmationProof {
  const res = mintConfirmation({ plan, operatorRef: OPERATOR, typedPhrase: requiredPhrase(plan) });
  if (!res.ok) throw new Error(res.message);
  return res.proof;
}

function planOf(result: ReturnType<typeof prepareCompletedWorkEntry>): ExecutionPlan {
  if (!result.ok) throw new Error(result.message);
  return result.plan;
}

beforeEach(() => {
  resetConfirmations();
  executionStore.clear();
  internalRecords.clear();
  executionControl.enable();
  registerInternalActionProviders();
});

describe("governed producers", () => {
  it("prepares a completed-work entry on the right capability with the input", () => {
    const r = prepareCompletedWorkEntry({
      operatorRef: OPERATOR,
      title: "Fix 7022",
      accountNumber: "7022",
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.plan.capabilityId).toBe(COMPLETED_WORK_CREATE_CAPABILITY);
      expect(r.plan.input.title).toBe("Fix 7022");
      expect(r.plan.unmetPreconditions).toHaveLength(0);
    }
  });

  it("flags unmet preconditions when the operator or title is missing", () => {
    const noOp = prepareCompletedWorkEntry({ operatorRef: "", title: "x" });
    const noTitle = prepareCompletedWorkEntry({ operatorRef: OPERATOR, title: "  " });
    if (noOp.ok) expect(noOp.plan.unmetPreconditions).toContain("authenticated");
    if (noTitle.ok) expect(noTitle.plan.unmetPreconditions).toContain("title_present");
  });

  it("prepares shift-summary and script-fix producers", () => {
    const ss = prepareShiftSummaryDraft({
      operatorRef: OPERATOR,
      shiftKey: "s1",
      title: "T",
      body: "B",
    });
    const sf = prepareScriptFixFinding({
      operatorRef: OPERATOR,
      accountNumber: "7022",
      summary: "S",
    });
    if (ss.ok) expect(ss.plan.capabilityId).toBe(SHIFT_SUMMARY_DRAFT_CAPABILITY);
    if (sf.ok) expect(sf.plan.capabilityId).toBe(SCRIPT_FIX_FINDING_CAPABILITY);
    expect(ss.ok && sf.ok).toBe(true);
  });
});

describe("internal handlers write only internally", () => {
  it("rejects invalid payloads and writes on valid ones", () => {
    const h = INTERNAL_ACTION_HANDLERS["record_script_fix_finding"]!;
    expect(h.validate({}).ok).toBe(false);
    const v = h.validate({ accountNumber: "7022", summary: "Routing fixed" });
    expect(v.ok).toBe(true);
    if (v.ok) {
      void h.execute(v.payload);
      expect(internalRecords.get().findings.some((f) => f.summary === "Routing fixed")).toBe(true);
    }
  });

  it("writes a shift-summary draft through its handler", () => {
    const h = INTERNAL_ACTION_HANDLERS["create_shift_summary_draft"]!;
    const v = h.validate({ shiftKey: "s1", title: "T", body: "B" });
    expect(v.ok).toBe(true);
    if (v.ok) {
      void h.execute(v.payload);
      expect(internalRecords.get().drafts.some((d) => d.shiftKey === "s1")).toBe(true);
    }
  });
});

describe("queueStatus maps every lifecycle state", () => {
  const entry = (over: Partial<ExecutionEntry>): ExecutionEntry =>
    ({
      plan: { id: "p" } as ExecutionPlan,
      operatorRef: OPERATOR,
      updatedAt: "",
      status: "awaiting_confirmation",
      ...over,
    }) as ExecutionEntry;
  const receipt = (over: Partial<ExecutionReceipt>): ExecutionReceipt =>
    ({
      status: "succeeded",
      verification: { status: "not_required" },
      ...over,
    }) as ExecutionReceipt;

  it("covers proposed/confirmed/executed/verified/cancelled/failed", () => {
    expect(queueStatus(entry({ status: "awaiting_confirmation" }))).toBe("proposed");
    expect(queueStatus(entry({ status: "running" }))).toBe("confirmed");
    expect(queueStatus(entry({ status: "cancelled" }))).toBe("cancelled");
    expect(
      queueStatus(
        entry({
          status: "done",
          receipt: receipt({ status: "succeeded", verification: { status: "verified" } }),
        }),
      ),
    ).toBe("verified");
    expect(
      queueStatus(
        entry({
          status: "done",
          receipt: receipt({ status: "succeeded", verification: { status: "unavailable" } }),
        }),
      ),
    ).toBe("executed");
    expect(queueStatus(entry({ status: "done", receipt: receipt({ status: "failed" }) }))).toBe(
      "failed",
    );
  });
});

describe("cancel", () => {
  it("moves a proposed change to cancelled and never applies it", () => {
    const plan = planOf(prepareCompletedWorkEntry({ operatorRef: OPERATOR, title: "Cancel me" }));
    executionStore.propose(plan, OPERATOR, "because");
    expect(queueStatus(executionStore.get(plan.id)!)).toBe("proposed");
    executionStore.cancel(plan.id);
    expect(queueStatus(executionStore.get(plan.id)!)).toBe("cancelled");
  });
});

describe("confirm → execute → verify", () => {
  it("runs a confirmed completed-work plan to a verified receipt", async () => {
    const plan = planOf(
      prepareCompletedWorkEntry({
        operatorRef: OPERATOR,
        title: "Verified fix 7022",
        accountNumber: "7022",
      }),
    );
    executionStore.propose(plan, OPERATOR, "record tonight's fix");
    const receipt = await executePlan(plan, {
      operatorRef: OPERATOR,
      role: "admin",
      confirmation: confirm(plan),
      ledger: fakeLedger(),
    });
    executionStore.complete(plan, receipt, OPERATOR);
    expect(receipt.status).toBe("succeeded");
    expect(receipt.verification.status).toBe("verified");
    expect(queueStatus(executionStore.get(plan.id)!)).toBe("verified");
  });
});

describe("7022 demo action", () => {
  it("proposes the completed entry, knowledge note and shift-summary line with reasons", () => {
    const out = proposeSevenZeroTwoTwoDemo({ operatorRef: OPERATOR, includeKnowledgeNote: true });
    expect(out.proposed).toHaveLength(3);
    const entries = executionStore.list();
    expect(entries).toHaveLength(3);
    expect(entries.every((e) => (e.reason ?? "").length > 0)).toBe(true);
    // Every demo action targets an internal capability — no external writers.
    for (const e of entries) {
      expect(
        e.plan.capabilityId.startsWith("work.") ||
          e.plan.capabilityId.startsWith("knowledge.") ||
          e.plan.capabilityId.startsWith("shift."),
      ).toBe(true);
    }
  });

  it("omits the knowledge note when not requested", () => {
    const out = proposeSevenZeroTwoTwoDemo({ operatorRef: OPERATOR, includeKnowledgeNote: false });
    expect(out.proposed).toHaveLength(2);
  });
});
