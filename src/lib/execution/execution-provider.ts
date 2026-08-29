/**
 * Phase 10 — provider ports.
 *
 * The engine owns governance; providers own effects. A provider may only:
 *   - read the target's execution-relevant state (for TOCTOU + verification),
 *   - apply the change,
 *   - report an HONEST outcome, including "unknown" and "partial".
 *
 * A provider can never grant itself confirmation, skip verification, or decide
 * it is allowed to run.
 */

import type { ExecTargetState, ExecutionPlan } from "./execution-contract";

export type ProviderApplyOutcome =
  | { status: "applied"; providerRef?: string; note?: string }
  | { status: "rejected"; note: string }
  | { status: "unavailable"; note: string }
  /** The call did not return a decisive answer. NOT a failure, NOT a success. */
  | { status: "unknown"; note: string }
  /** Some effects landed, others did not. Always terminal + operator-facing. */
  | { status: "partial"; note: string; appliedEffects: string[]; missingEffects: string[] };

export interface ExecutionProvider {
  capabilityId: string;
  /** `null` when state cannot be read — the engine treats that as unknown, not clean. */
  readState: (plan: ExecutionPlan) => Promise<ExecTargetState | null>;
  apply: (plan: ExecutionPlan) => Promise<ProviderApplyOutcome>;
  /**
   * Independent confirmation that the effect is real, read from the declared
   * authority. Returning `unavailable` is honest; returning `true` blindly is
   * the failure mode this exists to prevent.
   */
  verify: (plan: ExecutionPlan, post: ExecTargetState | null) => Promise<"verified" | "failed" | "unavailable">;
}

const providers = new Map<string, ExecutionProvider>();

export function registerProvider(provider: ExecutionProvider): void {
  providers.set(provider.capabilityId, provider);
}

export function getProvider(capabilityId: string): ExecutionProvider | undefined {
  return providers.get(capabilityId);
}

export function clearProviders(): void {
  providers.clear();
}
