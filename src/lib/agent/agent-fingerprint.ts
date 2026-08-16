/**
 * Phase 17 — deterministic fingerprints for loop and no-progress detection.
 *
 * A bounded agent must be able to prove it is still learning something. These
 * helpers are pure: same input -> same fingerprint, no clock, no randomness.
 */

import type { AgentIntent, AgentObservation } from "./agent-contract";

function stable(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (typeof value !== "object") return String(value);
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => a.localeCompare(b));
  return `{${entries.map(([k, v]) => `${k}:${stable(v)}`).join(",")}}`;
}

/** Identity of a reasoning step — repeated identical steps mean a loop. */
export function intentFingerprint(intent: AgentIntent): string {
  switch (intent.kind) {
    case "invoke_capability":
      return `invoke:${intent.capabilityId}:${stable(intent.input).slice(0, 300)}`;
    case "propose_action":
      return `propose:${intent.actionType}:${stable(intent.payload).slice(0, 300)}`;
    case "answer":
      return `answer:${intent.answer.trim().slice(0, 200)}`;
    case "need_operator":
      return `ask:${intent.question.trim().slice(0, 200)}`;
    case "stop":
    default:
      return "stop";
  }
}

/** Identity of what a cycle actually learned. */
export function observationFingerprint(args: {
  capabilityId: string;
  status: string;
  summary: string;
  factIds: string[];
}): string {
  return `${args.capabilityId}|${args.status}|${[...args.factIds].sort().join(",")}|${args.summary
    .trim()
    .slice(0, 200)}`;
}

/**
 * Knowledge state of the run so far. When two consecutive cycles produce the
 * same knowledge fingerprint, the run made no progress.
 */
export function knowledgeFingerprint(observations: AgentObservation[]): string {
  return observations.map((o) => o.fingerprint).join("~");
}

export function countRepeats(fingerprints: string[], candidate: string): number {
  return fingerprints.filter((f) => f === candidate).length;
}