/**
 * Activation 2 — the single client-side runner for governed execution.
 *
 * Every operator surface (Action Center, Night Plan, anything later) goes
 * through here so there is exactly one path from a confirmed plan to the
 * engine, the durable ledger, and the Action Center's session record.
 */

import { executePlan } from "./execution-engine";
import { executionStore } from "./execution-store";
import { registerSafeActionProviders } from "./safe-action-providers";
import { registerInternalActionProviders } from "@/lib/governed/internal-providers";
import type { ConfirmationProof, ExecutionPlan, ExecutionReceipt } from "./execution-contract";
import type { LedgerPort } from "@/lib/core/action-executor";
import type { HubRole } from "@/lib/auth/authorization.functions";

/** Server-authoritative idempotency + audit. Loaded lazily (server fn module). */
export async function serverLedgerPort(): Promise<LedgerPort> {
  const fns = await import("@/lib/core/action-ledger.functions");
  return {
    reserve: (input) => fns.reserveAction({ data: input }) as never,
    finalize: (input) =>
      fns.finalizeAction({
        data: {
          idempotencyKey: input.idempotencyKey,
          status: input.status,
          before: null,
          after: null,
          ...(input.entityType ? { entityType: input.entityType } : {}),
          ...(input.entityId ? { entityId: input.entityId } : {}),
          ...(input.error ? { error: input.error } : {}),
        },
      }) as never,
  };
}

export interface RunGovernedOptions {
  operatorRef: string;
  role: HubRole | null;
  confirmation: ConfirmationProof;
  /** Injected in tests; defaults to the real server ledger. */
  ledger?: LedgerPort;
}

export async function runGovernedExecution(
  plan: ExecutionPlan,
  opts: RunGovernedOptions,
): Promise<ExecutionReceipt> {
  registerSafeActionProviders();
  registerInternalActionProviders();
  executionStore.markRunning(plan, opts.confirmation, opts.operatorRef);
  const ledger = opts.ledger ?? (await serverLedgerPort());
  const receipt = await executePlan(plan, {
    operatorRef: opts.operatorRef,
    role: opts.role,
    confirmation: opts.confirmation,
    ledger,
  });
  executionStore.complete(plan, receipt, opts.operatorRef);
  return receipt;
}

/** Operator-facing wording that never says "done" unless verification proved it. */
export function receiptHeadline(receipt: ExecutionReceipt): {
  tone: "success" | "warning" | "error";
  text: string;
} {
  if (receipt.status === "succeeded" && receipt.verification.status === "verified") {
    return { tone: "success", text: `VERIFIED — ${receipt.message}` };
  }
  if (receipt.status === "succeeded") {
    return { tone: "warning", text: receipt.message };
  }
  if (receipt.status === "uncertain") {
    return { tone: "warning", text: `NEEDS CHECK — ${receipt.message}` };
  }
  if (receipt.status === "compensation_available") {
    return { tone: "error", text: `VERIFICATION FAILED — ${receipt.message}` };
  }
  return { tone: "error", text: receipt.message };
}
