import type { ModelTier, RouteTier, RoutingReasonCode, TaskKind } from "./task-types";

/**
 * Privacy-conscious routing telemetry: routing shape only. Prompts, model
 * responses, ticket bodies and account content are never recorded here.
 */
export interface RoutingTelemetryEntry {
  at: string;
  taskKind: TaskKind;
  tier: RouteTier;
  modelId?: string;
  reasonCode: RoutingReasonCode;
  fallbackUsed: boolean;
  escalated?: boolean;
  durationMs?: number;
  success?: boolean;
  toolsUsed?: number;
  usage?: { inputTokens?: number; outputTokens?: number };
}

const MAX_ENTRIES = 100;
const buffer: RoutingTelemetryEntry[] = [];

/** Fields that must never appear in a telemetry entry. */
const FORBIDDEN = new Set(["prompt", "system", "input", "text", "response", "content", "messages"]);

export function recordRouting(entry: RoutingTelemetryEntry) {
  const clean = { ...entry } as unknown as Record<string, unknown>;
  for (const key of Object.keys(clean)) {
    if (FORBIDDEN.has(key)) delete clean[key];
  }
  buffer.push(clean as unknown as RoutingTelemetryEntry);
  if (buffer.length > MAX_ENTRIES) buffer.splice(0, buffer.length - MAX_ENTRIES);
}

export function routingTelemetry(): RoutingTelemetryEntry[] {
  return [...buffer];
}

export function clearRoutingTelemetry() {
  buffer.length = 0;
}

/** Dev-only, machine-readable one-liner for the routing inspector. */
export function describeRouting(entry: {
  taskKind: TaskKind;
  tier: RouteTier;
  modelId?: string;
  reasonCode: RoutingReasonCode;
  capabilities?: Record<string, boolean>;
}): string {
  const caps = Object.entries(entry.capabilities ?? {})
    .filter(([, v]) => v)
    .map(([k]) => k)
    .join(", ");
  return `[route] task=${entry.taskKind} tier=${entry.tier} model=${entry.modelId ?? "none"} reason=${entry.reasonCode}${caps ? ` caps=${caps}` : ""}`;
}

export function logRoutingIfDev(line: string) {
  if (process.env.NODE_ENV === "production") return;
  if (process.env.ROUTER_DEBUG !== "true") return;
  console.info(line);
}

export type { ModelTier };