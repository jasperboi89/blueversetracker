/**
 * Intelligence Core — Phase 12: Memory Cortex runtime.
 *
 * Buffers Event Spine activity per work correlation and compiles an episode
 * when a DETERMINISTIC eligibility rule fires (work completion, verified
 * change, published handoff, or an explicit manual capture). No timers, no
 * background AI, no speculative capture.
 *
 * Resilience rule: a compiler or storage failure must never interfere with
 * the operator's work — every path here is fully guarded.
 */

import { eventSpine } from "@/lib/core/event-spine";
import type { AccEvent } from "@/lib/core/events";
import { getShiftKey } from "@/lib/shift";
import { CLOSING_EVENTS, compileEpisode, deriveCandidates } from "./experience-compiler";
import type { MemoryScope, MemoryTrigger, OperationalMemory } from "./memory-contract";
import { upsertMemories } from "./memory-store";

/** Rolling buffer of the current shift's events, oldest last. */
const MAX_BUFFER = 400;
let buffer: AccEvent[] = [];
let bufferShift = "";

function correlationKey(e: AccEvent): string {
  return e.ticketId
    ? `ticket:${e.ticketId}`
    : e.dispatchId
      ? `dispatch:${e.dispatchId}`
      : e.workItemId
        ? `work:${e.workItemId}`
        : e.accountId
          ? `account:${e.accountId}`
          : "shift";
}

function scopeFrom(events: AccEvent[], shiftKey: string): MemoryScope {
  const scope: MemoryScope = { shiftKey };
  for (const e of events) {
    if (e.ticketId && !scope.ticketId) scope.ticketId = e.ticketId;
    if (e.dispatchId && !scope.dispatchId) scope.dispatchId = e.dispatchId;
    if (e.workItemId && !scope.workItemId) scope.workItemId = e.workItemId;
    if (e.accountId && !scope.accountNumber) scope.accountNumber = e.accountId;
  }
  return scope;
}

function record(event: AccEvent): void {
  const shiftKey = getShiftKey();
  if (shiftKey !== bufferShift) {
    buffer = [];
    bufferShift = shiftKey;
  }
  buffer = [...buffer, event].slice(-MAX_BUFFER);
}

function persist(memories: OperationalMemory[]): OperationalMemory[] {
  const saved = upsertMemories(memories);
  for (const m of saved) {
    eventSpine.emit({
      type: m.status === "candidate" ? "memory.candidate_created" : "memory.captured",
      source: "memory",
      ...(m.scope.accountNumber ? { accountId: m.scope.accountNumber } : {}),
      ...(m.scope.ticketId ? { ticketId: m.scope.ticketId } : {}),
      metadata: { label: m.title, kind: m.class, confidence: m.confidence },
    });
  }
  return saved;
}

/**
 * Compile everything currently buffered for one correlation. Exposed so a
 * manual "remember this" command can capture without waiting for completion.
 */
export function captureEpisode(options: {
  trigger?: MemoryTrigger;
  correlation?: string;
  minTransitions?: number;
} = {}): OperationalMemory | null {
  try {
    const shiftKey = getShiftKey();
    const scoped = options.correlation
      ? buffer.filter((e) => correlationKey(e) === options.correlation)
      : buffer;
    if (!scoped.length) return null;
    const episode = compileEpisode({
      events: scoped,
      scope: scopeFrom(scoped, shiftKey),
      trigger: options.trigger ?? "manual_capture",
      ...(options.minTransitions !== undefined ? { minTransitions: options.minTransitions } : {}),
    });
    if (!episode) return null;
    const [saved] = persist([episode, ...deriveCandidates(episode)]);
    return saved ?? episode;
  } catch (err) {
    console.warn("[memory-cortex] capture failed", err);
    return null;
  }
}

function onEvent(event: AccEvent): void {
  try {
    record(event);
    const trigger = CLOSING_EVENTS[event.type];
    if (!trigger) return;
    const correlation = correlationKey(event);
    const scoped = buffer.filter((e) => correlationKey(e) === correlation);
    const episode = compileEpisode({
      events: scoped.length ? scoped : [event],
      scope: scopeFrom(scoped.length ? scoped : [event], getShiftKey()),
      trigger,
    });
    if (!episode) return;
    persist([episode, ...deriveCandidates(episode)]);
    // The experience is preserved; stop replaying it into the next episode.
    buffer = buffer.filter((e) => correlationKey(e) !== correlation);
  } catch (err) {
    // Never let memory capture break the work that produced it.
    console.warn("[memory-cortex] compile failed", err);
  }
}

/** Subscribe the cortex to the Event Spine. Returns an unsubscribe function. */
export function startMemoryCortex(): () => void {
  bufferShift = getShiftKey();
  buffer = [];
  try {
    return eventSpine.subscribe(onEvent);
  } catch (err) {
    console.warn("[memory-cortex] subscribe failed", err);
    return () => {};
  }
}

/** Test seam. */
export function __resetMemoryBuffer(): void {
  buffer = [];
  bufferShift = "";
}