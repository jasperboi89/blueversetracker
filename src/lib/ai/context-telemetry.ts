import type { ModelTier, RouteTier, TaskKind } from "./router/task-types";

/**
 * Context assembly telemetry — shape only.
 *
 * Follows the routing-telemetry privacy philosophy: never prompts, ticket
 * bodies, note content, caller details or model output. Counts, kinds and
 * durations only.
 */
export interface ContextTelemetryEntry {
  at: string;
  taskKind: TaskKind;
  tier: RouteTier | ModelTier;
  routeId: string;
  area: string;
  contextChars: number;
  evidenceAvailable: number;
  evidenceIncluded: number;
  evidenceTrimmed: number;
  sourceTypes: string[];
  sections: string[];
  accountContextIncluded: boolean;
  retrievalUsed: boolean;
  degraded: boolean;
  truncated: boolean;
  assemblyMs?: number;
}

const MAX_ENTRIES = 100;
const buffer: ContextTelemetryEntry[] = [];

/** Anything resembling raw content is dropped before the entry is stored. */
const FORBIDDEN = new Set([
  "prompt",
  "system",
  "text",
  "content",
  "messages",
  "summary",
  "body",
  "caller",
  "response",
]);

export function recordContextAssembly(entry: ContextTelemetryEntry) {
  const clean = { ...entry } as unknown as Record<string, unknown>;
  for (const key of Object.keys(clean)) if (FORBIDDEN.has(key)) delete clean[key];
  buffer.push(clean as unknown as ContextTelemetryEntry);
  if (buffer.length > MAX_ENTRIES) buffer.splice(0, buffer.length - MAX_ENTRIES);
}

export function contextTelemetry(): ContextTelemetryEntry[] {
  return [...buffer];
}

export function clearContextTelemetry() {
  buffer.length = 0;
}
