/**
 * Phase 17 — agent run lifecycle on the Event Spine.
 *
 * Only meaningful transitions are published, and only ids/counters/reason
 * codes travel with them: the spine stays a coordination log.
 */

import { eventSpine } from "@/lib/core/event-spine";
import type { AccEventType } from "@/lib/core/events";
import type { AgentRun } from "./agent-contract";

function emit(type: AccEventType, run: AgentRun, metadata: Record<string, unknown> = {}): void {
  try {
    eventSpine.emit({
      type,
      source: "agent",
      metadata: {
        runId: run.task.id,
        mode: run.task.mode,
        correlationId: run.task.correlationId,
        cycle: run.usage.cycles,
        ...metadata,
      },
    });
  } catch {
    // Telemetry must never break the operator's work.
  }
}

export function emitAgentStarted(run: AgentRun): void {
  emit("agent.run.started", run);
}

export function emitAgentCycle(run: AgentRun, capabilityId?: string): void {
  emit("agent.run.cycle", run, capabilityId ? { capabilityId } : {});
}

export function emitAgentFinished(run: AgentRun): void {
  const type: AccEventType =
    run.state === "completed"
      ? "agent.run.completed"
      : run.state === "awaiting_confirmation"
        ? "agent.run.awaiting_confirmation"
        : run.state === "blocked"
          ? "agent.run.blocked"
          : "agent.run.failed";
  emit(type, run, run.stopReason ? { stopReason: run.stopReason } : {});
}