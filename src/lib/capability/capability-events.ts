/**
 * Phase 16 — capability lifecycle events on the existing Event Spine.
 *
 * Meaningful transitions only: a capability appearing in a resolution list is
 * NOT an event. Metadata is limited to ids, versions and reason codes — the
 * spine stays a coordination log, never a content archive.
 */

import { eventSpine } from "@/lib/core/event-spine";
import type { AccEventType } from "@/lib/core/events";
import type {
  CapabilityDefinition,
  CapabilityReasonCode,
  CapabilityRequester,
  CapabilityResult,
} from "./capability-contract";

function emit(
  type: AccEventType,
  def: Pick<CapabilityDefinition, "id" | "version">,
  metadata: Record<string, unknown>,
): void {
  try {
    eventSpine.emit({
      type,
      source: "capability",
      metadata: { capabilityId: def.id, capabilityVersion: def.version, ...metadata },
    });
  } catch {
    // Telemetry must never break the operator's work.
  }
}

/** Only emitted when a resolution BLOCKS something the caller wanted. */
export function emitCapabilityBlocked(
  def: Pick<CapabilityDefinition, "id" | "version">,
  args: { requestedBy: CapabilityRequester; reasonCode: CapabilityReasonCode; correlationId?: string },
): void {
  emit("capability.blocked", def, {
    requestedBy: args.requestedBy,
    reasonCode: args.reasonCode,
    ...(args.correlationId ? { correlationId: args.correlationId } : {}),
  });
}

export function emitCapabilityInvoked(
  def: Pick<CapabilityDefinition, "id" | "version">,
  args: { requestedBy: CapabilityRequester; correlationId: string },
): void {
  emit("capability.invoked", def, { requestedBy: args.requestedBy, correlationId: args.correlationId });
}

/**
 * Completion and verification are separate events on purpose: "it ran" never
 * implies "it worked".
 */
export function emitCapabilityResult(
  def: Pick<CapabilityDefinition, "id" | "version">,
  result: CapabilityResult,
): void {
  const type: AccEventType =
    result.status === "success"
      ? "capability.completed"
      : result.status === "failed"
        ? "capability.failed"
        : "capability.blocked";
  emit(type, def, {
    correlationId: result.correlationId,
    verificationStatus: result.verificationStatus,
    ...(result.reasonCodes[0] ? { reasonCode: result.reasonCodes[0] } : {}),
  });
  if (result.status === "success" && result.verificationStatus === "pending") {
    emit("capability.verification_pending", def, { correlationId: result.correlationId });
  }
}

export function emitCapabilityVerified(
  def: Pick<CapabilityDefinition, "id" | "version">,
  args: { correlationId: string; authority: string },
): void {
  emit("capability.verified", def, { correlationId: args.correlationId, reason: args.authority });
}
