/**
 * Phase 16 — capability health.
 *
 * Health is TECHNICAL availability of the underlying system, never permission.
 * A capability whose source system is down is `unavailable` even for an admin;
 * a capability the operator may not use is still `healthy`.
 */

import type { CapabilityDefinition, CapabilityHealth } from "./capability-contract";

export type SourceSystem = "freshdesk" | "database" | "retrieval" | "account_context" | "dispatch";

export type SourceHealthMap = Partial<Record<SourceSystem, CapabilityHealth>>;

const DOMAIN_SOURCE: Record<string, SourceSystem> = {
  freshdesk: "freshdesk",
  accounts: "account_context",
  dispatch: "dispatch",
  knowledge: "retrieval",
  memory: "retrieval",
  night_plan: "database",
  additional_work: "database",
  reporting: "database",
  system: "database",
};

const WORST: CapabilityHealth[] = ["healthy", "degraded", "unavailable", "disabled"];

function worse(a: CapabilityHealth, b: CapabilityHealth): CapabilityHealth {
  return WORST.indexOf(a) >= WORST.indexOf(b) ? a : b;
}

/**
 * Derived health: lifecycle first, then the capability's own source system,
 * then the health of everything it declares a dependency on (§63) — a broken
 * dependency degrades the dependent capability before anyone invokes it.
 */
export function deriveHealth(
  def: CapabilityDefinition,
  sources: SourceHealthMap,
  resolveDependency: (id: string) => CapabilityHealth,
): CapabilityHealth {
  if (def.lifecycle === "disabled") return "disabled";

  const source = DOMAIN_SOURCE[def.domain] ?? "database";
  let health: CapabilityHealth = sources[source] ?? "healthy";

  for (const dep of def.dependsOn ?? []) {
    const depHealth = resolveDependency(dep);
    if (depHealth === "unavailable" || depHealth === "disabled") {
      health = worse(health, "degraded");
    } else {
      health = worse(health, depHealth === "degraded" ? "degraded" : "healthy");
    }
  }
  return health;
}

export function healthMapFor(
  defs: CapabilityDefinition[],
  sources: SourceHealthMap,
): Record<string, CapabilityHealth> {
  const byId = new Map(defs.map((d) => [d.id, d]));
  const memo = new Map<string, CapabilityHealth>();

  const resolve = (id: string, seen: Set<string>): CapabilityHealth => {
    const cached = memo.get(id);
    if (cached) return cached;
    const def = byId.get(id);
    if (!def) return "unavailable";
    if (seen.has(id)) return "healthy"; // cycles are rejected by the registry
    seen.add(id);
    const value = deriveHealth(def, sources, (dep) => resolve(dep, seen));
    memo.set(id, value);
    return value;
  };

  const out: Record<string, CapabilityHealth> = {};
  for (const d of defs) out[d.id] = resolve(d.id, new Set());
  return out;
}
