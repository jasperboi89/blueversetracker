/**
 * Phase 10 — deterministic fixture providers.
 *
 * Every governed failure mode (rejection, unavailability, unknown outcome,
 * partial effect, verification failure, TOCTOU drift) is reproducible without
 * touching production stores or the network. Tests assert on behaviour, not on
 * luck.
 */

import { fingerprint } from "./fingerprint";
import { registerProvider, type ExecutionProvider, type ProviderApplyOutcome } from "./execution-provider";
import type { ExecTargetState } from "./execution-contract";

export type FixtureBehaviour =
  | "applied"
  | "rejected"
  | "unavailable_then_applied"
  | "always_unavailable"
  | "unknown"
  | "partial"
  | "applied_but_unverifiable"
  | "applied_but_verification_fails";

interface FixtureWorld {
  behaviour: FixtureBehaviour;
  value: string;
  /** Simulates another actor changing the target between plan and apply. */
  drift: boolean;
  /** `null` state = unreadable target. */
  readable: boolean;
  applyCalls: number;
  unavailableCallsLeft: number;
}

export const fixtureWorld: FixtureWorld = {
  behaviour: "applied",
  value: "initial",
  drift: false,
  readable: true,
  applyCalls: 0,
  unavailableCallsLeft: 1,
};

export function resetFixtureWorld(patch: Partial<FixtureWorld> = {}): void {
  Object.assign(fixtureWorld, {
    behaviour: "applied",
    value: "initial",
    drift: false,
    readable: true,
    applyCalls: 0,
    unavailableCallsLeft: 1,
    ...patch,
  });
}

function currentState(): ExecTargetState | null {
  if (!fixtureWorld.readable) return null;
  const summary = { value: fixtureWorld.drift ? `${fixtureWorld.value}!drifted` : fixtureWorld.value };
  return { fingerprint: fingerprint(summary), observedAt: new Date().toISOString(), summary };
}

function applyOnce(next: string): ProviderApplyOutcome {
  fixtureWorld.applyCalls++;
  switch (fixtureWorld.behaviour) {
    case "rejected":
      return { status: "rejected", note: "The source system refused the change." };
    case "always_unavailable":
      return { status: "unavailable", note: "The source system is unreachable." };
    case "unavailable_then_applied":
      if (fixtureWorld.unavailableCallsLeft > 0) {
        fixtureWorld.unavailableCallsLeft--;
        return { status: "unavailable", note: "The source system is unreachable." };
      }
      fixtureWorld.value = next;
      return { status: "applied", note: "Applied on retry.", providerRef: "fixture-ref" };
    case "unknown":
      return { status: "unknown", note: "No decisive answer was returned." };
    case "partial":
      fixtureWorld.value = next;
      return {
        status: "partial",
        note: "Only part of the change landed.",
        appliedEffects: ["value"],
        missingEffects: ["notification"],
      };
    case "applied_but_unverifiable":
    case "applied_but_verification_fails":
    case "applied":
    default:
      fixtureWorld.value = next;
      return { status: "applied", note: "Applied.", providerRef: "fixture-ref" };
  }
}

const reversible: ExecutionProvider = {
  capabilityId: "fixture.reversible.write",
  readState: async () => currentState(),
  apply: async (plan) => applyOnce(String(plan.input["value"] ?? "")),
  verify: async (plan) => {
    if (fixtureWorld.behaviour === "applied_but_unverifiable") return "unavailable";
    if (fixtureWorld.behaviour === "applied_but_verification_fails") return "failed";
    return fixtureWorld.value === String(plan.input["value"] ?? "") ? "verified" : "failed";
  },
};

const external: ExecutionProvider = {
  capabilityId: "fixture.external.side_effect",
  readState: async () => currentState(),
  apply: async (plan) => applyOnce(String(plan.input["value"] ?? "")),
  verify: async () => (fixtureWorld.behaviour === "applied" ? "verified" : "unavailable"),
};

export function registerFixtureProviders(): void {
  registerProvider(reversible);
  registerProvider(external);
}
