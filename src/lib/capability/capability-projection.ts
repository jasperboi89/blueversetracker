/**
 * Phase 16 — AI-safe projection of the Capability Registry.
 *
 * The model receives a bounded description of what it can and cannot do —
 * never the registry itself, never execution bindings, never schemas that
 * would let it fabricate a write path.
 */

import type { CapabilityDefinition, ResolvedCapability } from "./capability-contract";

const MAX_CHARS = 1200;

export interface AiCapabilityView {
  id: string;
  version: number;
  operation: string;
  risk: string;
  description: string;
  callable: boolean;
  requiresProposal: boolean;
  confirmation: string;
}

export function toAiProjection(caps: ResolvedCapability[]): AiCapabilityView[] {
  return caps.map((c) => ({
    id: c.id,
    version: c.version,
    operation: c.operation,
    risk: c.risk,
    description: c.description,
    callable: c.callableNow,
    requiresProposal: Boolean(c.ai.requiresProposal),
    confirmation: c.confirmation,
  }));
}

/**
 * Bounded prompt section. Knowing a capability exists is not authorization,
 * and anything absent here must be treated as "not available" rather than
 * invented (§24/§46).
 */
export function serializeCapabilities(args: {
  relevant: ResolvedCapability[];
  withheld: ResolvedCapability[];
}): string {
  const lines: string[] = ["## CAPABILITIES (governed by the portal, not by you)"];
  lines.push(
    "- You may only use what is listed as AVAILABLE. Anything not listed does not exist for this turn.",
    "- PROPOSAL-ONLY capabilities are never executed by you: you prepare them and the operator confirms.",
    "- Never claim you performed a change, and never invent a tool or a limitation.",
  );

  if (args.relevant.length) {
    lines.push("", "AVAILABLE:");
    for (const c of args.relevant) {
      lines.push(
        `- ${c.id}@${c.version} [${c.operation.toUpperCase()}/${c.risk}] ${
          c.callableNow ? "callable" : "proposal-only"
        } — ${c.description}`,
      );
    }
  } else {
    lines.push("", "AVAILABLE: none for this task — answer from context or say what you would need.");
  }

  if (args.withheld.length) {
    lines.push("", "NOT AVAILABLE (say this plainly if asked):");
    for (const c of args.withheld.slice(0, 6)) {
      lines.push(`- ${c.id} — ${c.availability.toUpperCase()}: ${c.note ?? c.reasonCodes[0]}`);
    }
  }

  const text = lines.join("\n");
  return text.length > MAX_CHARS ? `${text.slice(0, MAX_CHARS - 1)}…` : text;
}

/* ------------------------------------------------------------------ */
/* Model boundary                                                      */
/* ------------------------------------------------------------------ */

export type ModelRouteLocality = "local" | "external";

export interface ExposureVerdict {
  allowed: boolean;
  /** Output must be reduced to non-sensitive fields before it is sent. */
  sanitize: boolean;
  reason?: string;
}

/**
 * §54/§55 — a capability's output policy constrains model routing. Nothing is
 * silently stripped: an incompatible route is refused, not quietly degraded.
 */
export function exposureForRoute(
  def: Pick<CapabilityDefinition, "ai" | "dataClass">,
  locality: ModelRouteLocality,
): ExposureVerdict {
  switch (def.ai.exposure) {
    case "none":
      return { allowed: false, sanitize: false, reason: "Output may not be sent to a model." };
    case "local_only":
      return locality === "local"
        ? { allowed: true, sanitize: false }
        : {
            allowed: false,
            sanitize: false,
            reason: "Output is restricted to a local model route.",
          };
    case "sanitized":
      return { allowed: true, sanitize: true };
    case "allowed":
    default:
      return { allowed: true, sanitize: def.dataClass === "restricted" };
  }
}
