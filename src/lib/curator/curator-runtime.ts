/**
 * Intelligence Core — Phase 13: Curator runtime.
 *
 * Deterministic triggers only — a curation pass runs when memory changes, a
 * knowledge/resolution record changes, at shift end, or on an explicit
 * refresh. No timers, no per-event AI, and every path is guarded so a curator
 * failure can never interfere with operational work.
 */

import { eventSpine } from "@/lib/core/event-spine";
import type { AccEvent, AccEventType } from "@/lib/core/events";
import type { EvidenceConflict } from "@/lib/core/evidence-contract";
import { allMemories } from "@/lib/memory/memory-store";
import { applyConflicts, curateMemories } from "./curator-engine";
import { allCandidates, saveCandidates } from "./curator-store";
import type { CuratedMemoryCandidate } from "./curator-contract";

const TRIGGERS: AccEventType[] = [
  "memory.captured",
  "memory.candidate_created",
  "memory.promoted",
  "knowledge.created",
  "knowledge.updated",
  "resolution.created",
  "resolution.updated",
  "resolution.superseded",
  "change.verified",
  "handoff.published",
];

export interface CurationPassResult {
  candidateCount: number;
  created: number;
  strengthened: number;
  revived: number;
  reviewReady: number;
  blocked: number;
  durationMs: number;
}

const EMPTY_PASS: CurationPassResult = {
  candidateCount: 0,
  created: 0,
  strengthened: 0,
  revived: 0,
  reviewReady: 0,
  blocked: 0,
  durationMs: 0,
};

/** One bounded, incremental pass. Safe to call repeatedly. */
export function runCurationPass(options: { conflicts?: EvidenceConflict[]; now?: number } = {}): CurationPassResult {
  const startedAt = Date.now();
  try {
    const memories = allMemories();
    const outcome = curateMemories({
      memories,
      existing: allCandidates(),
      ...(options.now !== undefined ? { now: options.now } : {}),
    });

    const conflicts = options.conflicts ?? [];
    const candidates: CuratedMemoryCandidate[] = conflicts.length
      ? outcome.candidates.map((c) => applyConflicts(c, conflicts, options.now))
      : outcome.candidates;

    saveCandidates(candidates);

    const reviewReady = candidates.filter((c) => c.lifecycle === "review_ready");
    const blocked = candidates.filter((c) => c.lifecycle === "blocked");

    // Telemetry-safe events: ids and counts only, never candidate text.
    for (const id of outcome.created) {
      eventSpine.emit({ type: "curator.candidate.clustered", source: "curator", metadata: { candidateId: id } });
    }
    for (const id of outcome.strengthened) {
      eventSpine.emit({ type: "curator.candidate.supported", source: "curator", metadata: { candidateId: id } });
    }
    for (const c of reviewReady) {
      eventSpine.emit({
        type: "curator.candidate.review_ready",
        source: "curator",
        metadata: { candidateId: c.id, lifecycle: c.lifecycle },
      });
    }
    for (const c of blocked) {
      eventSpine.emit({
        type: "curator.candidate.blocked",
        source: "curator",
        metadata: { candidateId: c.id, reason: c.blockReason ?? "blocked" },
      });
    }

    return {
      candidateCount: candidates.length,
      created: outcome.created.length,
      strengthened: outcome.strengthened.length,
      revived: outcome.revived.length,
      reviewReady: reviewReady.length,
      blocked: blocked.length,
      durationMs: Date.now() - startedAt,
    };
  } catch (err) {
    // Curation is an enhancement. Operational work continues regardless.
    console.warn("[memory-curator] pass failed", err);
    return { ...EMPTY_PASS, durationMs: Date.now() - startedAt };
  }
}

/** Shift-end summary: "tonight's learning", never a demand to review now. */
export function summarizePass(result: CurationPassResult): string[] {
  const lines: string[] = [];
  if (result.created) lines.push(`${result.created} new candidate${result.created === 1 ? "" : "s"}`);
  if (result.strengthened) lines.push(`${result.strengthened} candidate${result.strengthened === 1 ? "" : "s"} strengthened`);
  if (result.revived) lines.push(`${result.revived} reactivated`);
  if (result.reviewReady) lines.push(`${result.reviewReady} ready for review`);
  if (result.blocked) lines.push(`${result.blocked} blocked by conflicting evidence`);
  return lines.length ? lines : ["nothing new to curate"];
}

let pending: ReturnType<typeof setTimeout> | null = null;

function schedule(): void {
  if (pending) return;
  // Coalesce bursts: one pass per turn of work, not one per event.
  pending = setTimeout(() => {
    pending = null;
    runCurationPass();
  }, 1500);
}

function onEvent(event: AccEvent): void {
  try {
    if (!TRIGGERS.includes(event.type)) return;
    schedule();
  } catch (err) {
    console.warn("[memory-curator] trigger failed", err);
  }
}

/** Subscribe the Curator to the Event Spine. Returns an unsubscribe function. */
export function startMemoryCurator(): () => void {
  try {
    const unsubscribe = eventSpine.subscribe(onEvent);
    return () => {
      if (pending) clearTimeout(pending);
      pending = null;
      unsubscribe();
    };
  } catch (err) {
    console.warn("[memory-curator] subscribe failed", err);
    return () => {};
  }
}
