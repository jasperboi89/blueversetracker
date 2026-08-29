/**
 * Activation 8 — backup and restore for operator-owned workspace data.
 *
 * What this protects: every `aih:`-prefixed local store (tickets, dispatch,
 * night plan, knowledge vault workspace, settings, memory, ledgers). These are
 * the same blobs cloud-sync mirrors, so a snapshot taken here is a complete
 * copy of what the workspace would restore from.
 *
 * Deliberate boundaries:
 *   - This is NOT an authoritative archive and never becomes one. It is an
 *     operator-triggered export the operator stores themselves.
 *   - Restore is all-or-nothing and integrity-checked. A truncated, edited or
 *     wrong-format file is REFUSED, never partially applied. Refusing to
 *     restore is always safer than restoring half a workspace.
 *   - Nothing here talks to Freshdesk, Amtelco or any provider.
 */

export const BACKUP_FORMAT = "bluverse.workspace.backup";
export const BACKUP_VERSION = 1;
export const BACKUP_KEY_PREFIX = "aih:";

export interface BackupFile {
  format: string;
  version: number;
  createdAt: string;
  /** Optional, best-effort label of who took it. Never a credential. */
  takenBy: string;
  keyCount: number;
  /** Raw serialized store values, keyed by storage key. */
  entries: Record<string, string>;
  /** Integrity check over format+version+createdAt+entries. */
  checksum: string;
}

export type VerifyResult =
  | { ok: true; file: BackupFile; keyCount: number; createdAt: string }
  | { ok: false; reason: string };

export interface RestoreSummary {
  restored: number;
  removed: number;
  mode: RestoreMode;
}

export type RestoreMode =
  /** Wipe every aih: key first, then write the backup exactly. */
  | "replace"
  /** Write backup keys over the current ones, leaving unrelated keys alone. */
  | "merge";

/* ------------------------------------------------------------------ */
/* Integrity                                                           */
/* ------------------------------------------------------------------ */

/** Stable FNV-1a over a canonical serialization. Detects truncation and edits. */
export function backupChecksum(input: Pick<BackupFile, "format" | "version" | "createdAt" | "entries">): string {
  const keys = Object.keys(input.entries).sort();
  let canonical = `${input.format}|${input.version}|${input.createdAt}|${keys.length}`;
  for (const k of keys) canonical += `\u0000${k}\u0001${input.entries[k]}`;
  let h = 0x811c9dc5;
  for (let i = 0; i < canonical.length; i++) {
    h ^= canonical.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return `fnv1a-${h.toString(16).padStart(8, "0")}-${canonical.length.toString(16)}`;
}

/* ------------------------------------------------------------------ */
/* Create                                                              */
/* ------------------------------------------------------------------ */

export interface StorageLike {
  length: number;
  key(index: number): string | null;
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

function storage(explicit?: StorageLike): StorageLike | null {
  if (explicit) return explicit;
  if (typeof window === "undefined") return null;
  try { return window.localStorage; } catch { return null; }
}

function workspaceKeys(store: StorageLike): string[] {
  const keys: string[] = [];
  for (let i = 0; i < store.length; i++) {
    const k = store.key(i);
    if (k && k.startsWith(BACKUP_KEY_PREFIX)) keys.push(k);
  }
  return keys.sort();
}

export function createBackup(opts: { takenBy?: string; store?: StorageLike; now?: () => number } = {}): BackupFile {
  const store = storage(opts.store);
  const entries: Record<string, string> = {};
  if (store) {
    for (const k of workspaceKeys(store)) {
      const v = store.getItem(k);
      if (typeof v === "string") entries[k] = v;
    }
  }
  const createdAt = new Date((opts.now ?? Date.now)()).toISOString();
  const base = { format: BACKUP_FORMAT, version: BACKUP_VERSION, createdAt, entries };
  return {
    ...base,
    takenBy: opts.takenBy ?? "",
    keyCount: Object.keys(entries).length,
    checksum: backupChecksum(base),
  };
}

export function serializeBackup(file: BackupFile): string {
  return JSON.stringify(file, null, 2);
}

export function backupFilename(file: BackupFile): string {
  const stamp = file.createdAt.replace(/[:.]/g, "-");
  return `bluverse-workspace-backup-${stamp}.json`;
}

/* ------------------------------------------------------------------ */
/* Verify                                                              */
/* ------------------------------------------------------------------ */

export function verifyBackup(raw: string): VerifyResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, reason: "This file is not readable backup data — it may be truncated or not a backup file." };
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { ok: false, reason: "This file does not contain a workspace backup." };
  }
  const f = parsed as Partial<BackupFile>;
  if (f.format !== BACKUP_FORMAT) {
    return { ok: false, reason: "This file was not produced by this workspace, so it cannot be restored." };
  }
  if (typeof f.version !== "number" || f.version > BACKUP_VERSION) {
    return { ok: false, reason: `This backup was made by a newer version (${String(f.version)}) and cannot be restored here.` };
  }
  if (typeof f.createdAt !== "string" || Number.isNaN(Date.parse(f.createdAt))) {
    return { ok: false, reason: "The backup is missing a valid creation time." };
  }
  if (!f.entries || typeof f.entries !== "object" || Array.isArray(f.entries)) {
    return { ok: false, reason: "The backup contains no restorable data." };
  }
  const entries = f.entries as Record<string, unknown>;
  for (const [k, v] of Object.entries(entries)) {
    if (typeof v !== "string") {
      return { ok: false, reason: `The saved value for “${k}” is damaged, so this backup was not restored.` };
    }
    if (!k.startsWith(BACKUP_KEY_PREFIX)) {
      return { ok: false, reason: `The backup contains an unexpected entry (“${k}”) and was refused.` };
    }
  }
  const count = Object.keys(entries).length;
  if (typeof f.keyCount === "number" && f.keyCount !== count) {
    return { ok: false, reason: `The backup is incomplete: it lists ${f.keyCount} saved areas but contains ${count}.` };
  }
  const expected = backupChecksum({
    format: f.format,
    version: f.version,
    createdAt: f.createdAt,
    entries: entries as Record<string, string>,
  });
  if (f.checksum !== expected) {
    return { ok: false, reason: "The backup failed its integrity check — it was changed or damaged after it was created. Nothing was restored." };
  }
  return {
    ok: true,
    file: { ...(f as BackupFile), keyCount: count },
    keyCount: count,
    createdAt: f.createdAt,
  };
}

/* ------------------------------------------------------------------ */
/* Restore                                                             */
/* ------------------------------------------------------------------ */

export type RestoreResult =
  | { ok: true; summary: RestoreSummary; safetyCopy: BackupFile }
  | { ok: false; reason: string };

/**
 * Restores a verified backup. Always takes a safety copy of the CURRENT state
 * first and rolls back to it if any write fails, so a failed restore leaves
 * the workspace exactly where it started rather than half-overwritten.
 *
 * The caller is expected to reload the app afterwards: in-memory stores hold
 * the pre-restore state until they re-read local storage.
 */
export function restoreBackup(
  raw: string,
  opts: { mode?: RestoreMode; store?: StorageLike } = {},
): RestoreResult {
  const mode: RestoreMode = opts.mode ?? "replace";
  const verified = verifyBackup(raw);
  if (!verified.ok) return { ok: false, reason: verified.reason };

  const store = storage(opts.store);
  if (!store) return { ok: false, reason: "Local storage is unavailable, so nothing was restored." };

  const safetyCopy = createBackup({ takenBy: "pre-restore safety copy", store });
  const existing = workspaceKeys(store);
  let removed = 0;
  let restored = 0;

  try {
    if (mode === "replace") {
      for (const k of existing) {
        store.removeItem(k);
        removed += 1;
      }
    }
    for (const [k, v] of Object.entries(verified.file.entries)) {
      store.setItem(k, v);
      restored += 1;
    }
  } catch (err) {
    // Roll back to the safety copy — a partial restore is the one outcome we
    // never accept.
    try {
      for (const k of workspaceKeys(store)) store.removeItem(k);
      for (const [k, v] of Object.entries(safetyCopy.entries)) store.setItem(k, v);
    } catch { /* nothing further we can do; the safety copy is still returned */ }
    return {
      ok: false,
      reason: `The restore could not be completed (${err instanceof Error ? err.message : String(err)}), so the workspace was put back the way it was.`,
    };
  }

  return { ok: true, summary: { restored, removed, mode }, safetyCopy };
}
