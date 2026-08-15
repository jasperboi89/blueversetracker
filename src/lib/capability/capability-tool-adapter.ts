/**
 * Phase 16 — Copilot tool ↔ capability adapter (§17/§26).
 *
 * Existing tools keep their behaviour. The adapter only:
 *   - maps the tool name to its capability descriptor,
 *   - re-checks permission/scope/health at invocation time,
 *   - enforces the turn's invocation budget and loop detection,
 *   - stamps a correlation id and provenance on the result.
 *
 * It never duplicates the tool's domain logic and never gains a write path:
 * mutations remain `propose_action` -> Safe Action Executor.
 */

import type { PortalContextEnvelope } from "@/lib/core/portal-context";
import type { CapabilityReasonCode, CapabilityRequester } from "./capability-contract";
import { capabilityForToolName } from "./capability-registry";
import type { OperatorPrincipal } from "./capability-permissions";
import {
  assertInvocationAllowed,
  buildInvocation,
  InvocationLedger,
  capabilityProvenance,
} from "./capability-invocation";

export interface ToolGuardContext {
  operator: OperatorPrincipal;
  ledger: InvocationLedger;
  correlationId: string;
  envelope?: PortalContextEnvelope | null;
  requestedBy?: CapabilityRequester;
  contextRef?: string;
}

export type ToolGuardVerdict =
  | { ok: true; capabilityId: string; provenance: ReturnType<typeof capabilityProvenance> }
  /** Ungoverned tool (e.g. propose_action) — existing behaviour is unchanged. */
  | { ok: true; capabilityId: null; provenance: null }
  | { ok: false; reasonCodes: CapabilityReasonCode[]; message: string };

/**
 * Guard one Copilot tool call. A refusal is returned as data so the model can
 * explain the real limitation instead of hallucinating a workaround.
 */
export function guardToolCall(
  toolName: string,
  args: unknown,
  ctx: ToolGuardContext,
): ToolGuardVerdict {
  const def = capabilityForToolName(toolName);
  if (!def) return { ok: true, capabilityId: null, provenance: null };

  const invocation = buildInvocation({
    capabilityId: def.id,
    input: args,
    contextRef: ctx.contextRef ?? ctx.correlationId,
    requestedBy: ctx.requestedBy ?? "copilot",
    correlationId: ctx.correlationId,
  });
  if (!invocation) {
    return { ok: false, reasonCodes: ["UNSUPPORTED_OPERATION"], message: "Capability not registered." };
  }

  const verdict = assertInvocationAllowed({
    invocation,
    operator: ctx.operator,
    ledger: ctx.ledger,
    ...(ctx.envelope !== undefined ? { resolve: { envelope: ctx.envelope } } : {}),
  });

  if (!verdict.allowed) {
    return { ok: false, reasonCodes: verdict.reasonCodes, message: verdict.message };
  }
  return {
    ok: true,
    capabilityId: def.id,
    provenance: capabilityProvenance(def, ctx.correlationId),
  };
}
