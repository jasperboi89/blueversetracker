/**
 * Intelligence Core — Phase 12: durable memory storage.
 *
 * Persisted per operator and cloud-synced, so experience survives reloads and
 * follows the operator between machines. Storage is deliberately dumb: all
 * meaning is decided by the compiler and the review surface.
 */

import { createPersistedStore, useStoreValue } from "@/lib/settings/_persist";
import { attachCloudSync } from "@/lib/cloud-sync/blob-sync";
import {
  isPendingReview,
  isRetrievableMemory,
  type MemoryClass,
  type OperationalMemory,
} from "./memory-contract";

interface MemoryState {
  memories: OperationalMemory[];
}

const DEFAULT: MemoryState = { memories: [] };
/** Hard ceiling — memory is curated experience, not an archive. */
const MAX_MEMORIES = 600;

export const memoryStore = createPersistedStore<MemoryState>("aih:memory:cortex:v1", DEFAULT);

export function useOperationalMemories(): OperationalMemory[] {
  return useStoreValue(memoryStore, DEFAULT).memories;
}

export function allMemories(): OperationalMemory[] {
  return memoryStore.get().memories;
}

/** Least important, oldest, already-reviewed memories are evicted first. */
function prune(list: OperationalMemory[]): OperationalMemory[] {
  if (list.length <= MAX_MEMORIES) return list;
  const scored = [...list].sort((a, b) => {
    const rank = (m: OperationalMemory) =>
      (m.status === "promoted" ? 2 : m.status === "candidate" ? 1 : 0) + m.importance;
    const diff = rank(b) - rank(a);
    return diff !== 0 ? diff : Date.parse(b.occurredAt) - Date.parse(a.occurredAt);
  });
  return scored.slice(0, MAX_MEMORIES);
}

/**
 * Insert or merge by fingerprint. Re-compiling the same experience updates it
 * in place instead of creating a duplicate; a reviewed memory is never
 * silently overwritten by the compiler.
 */
export function upsertMemories(incoming: OperationalMemory[]): OperationalMemory[] {
  if (!incoming.length) return [];
  const saved: OperationalMemory[] = [];
  memoryStore.update((s) => {
    const byFp = new Map(s.memories.map((m) => [m.fingerprint, m] as const));
    for (const m of incoming) {
      const prev = byFp.get(m.fingerprint);
      if (prev?.reviewedAt) {
        saved.push(prev);
        continue;
      }
      const merged: OperationalMemory = prev ? { ...prev, ...m, id: prev.id } : m;
      byFp.set(m.fingerprint, merged);
      saved.push(merged);
    }
    return {
      memories: prune(
        [...byFp.values()].sort((a, b) => Date.parse(b.occurredAt) - Date.parse(a.occurredAt)),
      ),
    };
  });
  return saved;
}

function patch(id: string, fn: (m: OperationalMemory) => OperationalMemory): void {
  memoryStore.update((s) => ({ memories: s.memories.map((m) => (m.id === id ? fn(m) : m)) }));
}

/** Operator accepted a candidate — the only path to verified, reusable memory. */
export function promoteMemory(id: string, note?: string): void {
  patch(id, (m) => ({
    ...m,
    status: "promoted",
    origin: "operator_confirmed",
    confidence: "verified",
    reviewedAt: new Date().toISOString(),
    ...(note ? { reviewNote: note } : {}),
  }));
}

export function rejectMemory(id: string, note?: string): void {
  patch(id, (m) => ({
    ...m,
    status: "rejected",
    confidence: "unknown",
    reviewedAt: new Date().toISOString(),
    ...(note ? { reviewNote: note } : {}),
  }));
}

export function archiveMemory(id: string): void {
  patch(id, (m) => ({ ...m, status: "archived" }));
}

/** Supersede without deleting: the older memory stays queryable as history. */
export function supersedeMemory(olderId: string, newerId: string): void {
  memoryStore.update((s) => ({
    memories: s.memories.map((m) => {
      if (m.id === olderId) {
        return {
          ...m,
          status: "superseded" as const,
          supersededBy: Array.from(new Set([...(m.supersededBy ?? []), newerId])),
        };
      }
      if (m.id === newerId) {
        return { ...m, supersedes: Array.from(new Set([...(m.supersedes ?? []), olderId])) };
      }
      return m;
    }),
  }));
}

export function pendingCandidates(): OperationalMemory[] {
  return allMemories().filter(isPendingReview);
}

export function memoriesOfClass(cls: MemoryClass): OperationalMemory[] {
  return allMemories().filter((m) => m.class === cls && isRetrievableMemory(m));
}

export function clearMemories(): void {
  memoryStore.set({ memories: [] });
}

attachCloudSync<MemoryState>({
  storeKey: "memory-cortex",
  subscribe: (cb) => memoryStore.subscribe(cb),
  getSnapshot: () => memoryStore.get(),
  applyServerSnapshot: (next) => memoryStore.applyServerSnapshot(next),
  isEmpty: (s) => !s.memories || s.memories.length === 0,
});