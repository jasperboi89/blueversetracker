/**
 * Activation 8 — honest cloud-sync status.
 *
 * Before this, a failed cloud write looked exactly like a successful one on
 * screen: the work was saved locally and the retry loop ran forever in the
 * console. This registry gives every synced store an explicit, operator-facing
 * state so "saved" never quietly means "saved on this device only".
 *
 * Deliberately NOT a second source of truth: it reports, it does not store work.
 */

import { useSyncExternalStore } from "react";

export type SyncStatus =
  /** Cloud copy matches what is on this device. */
  | "synced"
  /** Not signed in / sync paused — work is safe locally but only here. */
  | "local_only"
  /** A write failed and a retry is scheduled. */
  | "retrying"
  /** Retries exhausted: this device holds changes the cloud does not have. */
  | "sync_failed";

export interface StoreSyncHealth {
  storeKey: string;
  status: SyncStatus;
  /** Consecutive failed write attempts since the last success. */
  failures: number;
  lastSyncedAt: string | null;
  lastError: string | null;
  updatedAt: string;
}

const health = new Map<string, StoreSyncHealth>();
const listeners = new Set<() => void>();
let snapshot: StoreSyncHealth[] = [];

function rebuild(): void {
  snapshot = [...health.values()].sort((a, b) => a.storeKey.localeCompare(b.storeKey));
  for (const fn of listeners) fn();
}

export function reportSyncStatus(
  storeKey: string,
  status: SyncStatus,
  detail: { failures?: number; error?: string | null } = {},
): void {
  const prev = health.get(storeKey);
  health.set(storeKey, {
    storeKey,
    status,
    failures: detail.failures ?? (status === "synced" || status === "local_only" ? 0 : prev?.failures ?? 0),
    lastSyncedAt: status === "synced" ? new Date().toISOString() : prev?.lastSyncedAt ?? null,
    lastError: detail.error ?? (status === "synced" ? null : prev?.lastError ?? null),
    updatedAt: new Date().toISOString(),
  });
  rebuild();
}

export function syncHealthSnapshot(): StoreSyncHealth[] {
  return snapshot;
}

/** Stores that currently hold work the cloud does not have. */
export function unsyncedStores(entries = snapshot): StoreSyncHealth[] {
  return entries.filter((e) => e.status === "sync_failed" || e.status === "retrying");
}

/** One plain-English line for the whole workspace. */
export function overallSyncLabel(entries = snapshot): { tone: "ok" | "warn" | "bad"; text: string } {
  if (entries.length === 0) return { tone: "ok", text: "Nothing to sync yet." };
  const failed = entries.filter((e) => e.status === "sync_failed");
  const retrying = entries.filter((e) => e.status === "retrying");
  if (failed.length > 0) {
    return {
      tone: "bad",
      text: `${failed.length} area${failed.length === 1 ? "" : "s"} could not be saved to the cloud. Your work is safe on this device only — do not clear the browser or switch devices until this clears.`,
    };
  }
  if (retrying.length > 0) {
    return { tone: "warn", text: `Retrying cloud save for ${retrying.length} area${retrying.length === 1 ? "" : "s"}.` };
  }
  if (entries.every((e) => e.status === "local_only")) {
    return { tone: "warn", text: "Sync is paused — work is being kept on this device only." };
  }
  return { tone: "ok", text: "All work is saved to the cloud." };
}

export function _resetSyncHealthForTests(): void {
  health.clear();
  rebuild();
}

export function useSyncHealth(): StoreSyncHealth[] {
  return useSyncExternalStore(
    (l) => { listeners.add(l); return () => listeners.delete(l); },
    () => snapshot,
    () => snapshot,
  );
}
