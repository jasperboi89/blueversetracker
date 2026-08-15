/**
 * Phase 16 — permission adapter.
 *
 * The registry DECLARES required permissions; this module translates them
 * against the existing Hub role model. It grants nothing on its own and it is
 * never cached as execution authority: `assertInvocationAllowed` re-runs it at
 * invocation time, and that check is the authoritative one.
 */

import type { HubRole } from "@/lib/auth/authorization.functions";
import type { CapabilityDefinition, CapabilityPermission } from "./capability-contract";

const ROLE_PERMISSIONS: Record<HubRole, CapabilityPermission[]> = {
  viewer: ["portal.read"],
  programmer: [
    "portal.read",
    "night_plan.write",
    "ticket.write",
    "timer.write",
    "knowledge.write",
    "memory.write",
  ],
  admin: [
    "portal.read",
    "night_plan.write",
    "ticket.write",
    "timer.write",
    "knowledge.write",
    "memory.write",
    "admin",
  ],
};

const ROLE_RANK: Record<HubRole, number> = { viewer: 0, programmer: 1, admin: 2 };

export interface OperatorPrincipal {
  userId?: string;
  role: HubRole | null;
}

export function permissionsForRole(role: HubRole | null): CapabilityPermission[] {
  return role ? ROLE_PERMISSIONS[role] : [];
}

/** Missing declared permissions for this principal. Empty === permitted. */
export function missingPermissions(
  def: CapabilityDefinition,
  principal: OperatorPrincipal,
): CapabilityPermission[] {
  if (!principal.role) return def.permissions.required;
  const held = permissionsForRole(principal.role);
  const missing = def.permissions.required.filter((p) => !held.includes(p));
  if (
    !missing.length &&
    ROLE_RANK[principal.role] < ROLE_RANK[def.permissions.minimumRole]
  ) {
    return def.permissions.required;
  }
  return missing;
}

export function isPermitted(def: CapabilityDefinition, principal: OperatorPrincipal): boolean {
  return missingPermissions(def, principal).length === 0;
}
