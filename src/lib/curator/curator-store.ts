/**
 * Intelligence Core — Phase 13: Curator storage.
 *
 * Persisted per operator and cloud-synced, additive to the Phase 12 memory
 * store. Candidates are never destructively deleted: they are dismissed,
 * archived, merged or superseded, and their lineage survives.
 */

import { createPersistedStore, useStoreValue } from "@/lib/settings/_persist";
import { attachCloudSync } from "@/lib/cloud-sync/blob-sync";
import {
  OPEN_LIFECYCLES,
  type CandidateLifecycle,
  type CuratedMemoryCandidate,
  type PromotionDestination,
  type PromotionPacket,
} from "./curator-contract";

export interface PromotionHistoryEntry {
  id: string;
  packetId: string;
  candidateId: string;
  operation: string;
  destination: PromotionDestination;
  targetId?: string;
  status: "approved" | "completed" | "failed" | "rejected";
  at: string;
  message?: string;
}

interface CuratorState {
  candidates: CuratedMemoryCandidate[];
  packets: PromotionPacket[];
  history: PromotionHistoryEntry[];
}

const DEFAULT: CuratorState = { candidates: [], packets: [], history: [] };
const MAX_CANDIDATES = 400;
const MAX_PACKETS = 60;
const MAX_HISTORY = 300;

export const curatorStore = createPersistedStore<CuratorState>("aih:curator:v1", DEFAULT);

export function useCuratedCandidates(): CuratedMemoryCandidate[] {
  return useStoreValue(curatorStore, DEFAULT).candidates;
}

export function usePromotionHistory(): PromotionHistoryEntry[] {
  return useStoreValue(curatorStore, DEFAULT).history;
}

export function allCandidates(): CuratedMemoryCandidate[] {
  return curatorStore.get().candidates;
}

export function getCandidate(id: string): CuratedMemoryCandidate | undefined {
  return allCandidates().find((c) => c.id === id);
}

export function openCandidates(): CuratedMemoryCandidate[] {
  return allCandidates().filter((c) => OPEN_LIFECYCLES.includes(c.lifecycle));
}

export function candidatesByLifecycle(lifecycle: CandidateLifecycle): CuratedMemoryCandidate[] {
  return allCandidates().filter((c) => c.lifecycle === lifecycle);
}

/** Replace the candidate set with a curated pass result. Nothing is dropped. */
export function saveCandidates(next: CuratedMemoryCandidate[]): void {
  curatorStore.update((s) => ({
    ...s,
    candidates: next
      .slice()
      .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
      .slice(0, MAX_CANDIDATES),
  }));
}

export function patchCandidate(
  id: string,
  fn: (c: CuratedMemoryCandidate) => CuratedMemoryCandidate,
): CuratedMemoryCandidate | undefined {
  let out: CuratedMemoryCandidate | undefined;
  curatorStore.update((s) => ({
    ...s,
    candidates: s.candidates.map((c) => {
      if (c.id !== id) return c;
      out = fn(c);
      return out;
    }),
  }));
  return out;
}

export function recordDecision(id: string, action: string, note?: string): void {
  patchCandidate(id, (c) => ({
    ...c,
    decisions: [...(c.decisions ?? []), { at: new Date().toISOString(), action, ...(note ? { note } : {}) }],
    updatedAt: new Date().toISOString(),
  }));
}

export function setLifecycle(id: string, lifecycle: CandidateLifecycle, note?: string): void {
  patchCandidate(id, (c) => ({ ...c, lifecycle, updatedAt: new Date().toISOString() }));
  recordDecision(id, lifecycle, note);
}

/** Merge preserves both histories; the source candidate is never erased. */
export function mergeCandidates(sourceId: string, targetId: string): void {
  const source = getCandidate(sourceId);
  const target = getCandidate(targetId);
  if (!source || !target || sourceId === targetId) return;
  patchCandidate(targetId, (c) => ({
    ...c,
    sourceMemoryIds: Array.from(new Set([...c.sourceMemoryIds, ...source.sourceMemoryIds])),
    supportLog: [...c.supportLog, ...source.supportLog],
    evidenceRefs: Array.from(new Set([...c.evidenceRefs, ...source.evidenceRefs])),
    relatedEntities: [...c.relatedEntities, ...source.relatedEntities].filter(
      (e, i, all) => all.findIndex((x) => x.type === e.type && x.id === e.id) === i,
    ),
    mergedFrom: Array.from(new Set([...(c.mergedFrom ?? []), sourceId])),
    updatedAt: new Date().toISOString(),
  }));
  patchCandidate(sourceId, (c) => ({
    ...c,
    lifecycle: "merged",
    mergedInto: targetId,
    updatedAt: new Date().toISOString(),
  }));
  recordDecision(targetId, "merged_in", sourceId);
}

/** Split an incorrect cluster: the memory moves out, lineage is preserved. */
export function splitCandidate(id: string, memoryIds: string[]): void {
  patchCandidate(id, (c) => ({
    ...c,
    sourceMemoryIds: c.sourceMemoryIds.filter((m) => !memoryIds.includes(m)),
    supportLog: c.supportLog.filter((e) => !memoryIds.includes(e.memoryId)),
    decisions: [
      ...(c.decisions ?? []),
      { at: new Date().toISOString(), action: "split", note: memoryIds.join(",").slice(0, 200) },
    ],
    updatedAt: new Date().toISOString(),
  }));
}

export function savePacket(packet: PromotionPacket): void {
  curatorStore.update((s) => ({
    ...s,
    packets: [packet, ...s.packets.filter((p) => p.candidateId !== packet.candidateId)].slice(0, MAX_PACKETS),
  }));
}

export function getPacket(id: string): PromotionPacket | undefined {
  return curatorStore.get().packets.find((p) => p.id === id);
}

export function appendHistory(entry: PromotionHistoryEntry): void {
  curatorStore.update((s) => ({ ...s, history: [entry, ...s.history].slice(0, MAX_HISTORY) }));
}

export function clearCurator(): void {
  curatorStore.set({ candidates: [], packets: [], history: [] });
}

attachCloudSync<CuratorState>({
  storeKey: "memory-curator",
  subscribe: (cb) => curatorStore.subscribe(cb),
  getSnapshot: () => curatorStore.get(),
  applyServerSnapshot: (next) => curatorStore.applyServerSnapshot(next),
  isEmpty: (s) => !s.candidates || s.candidates.length === 0,
});
