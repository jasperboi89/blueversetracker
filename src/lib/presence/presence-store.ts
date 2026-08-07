import { useSyncExternalStore } from "react";

export type PresenceTone = "alert" | "checkin" | "greeting" | "wrap" | "neutral";

export interface PresenceMessage {
  /** Stable key used for dedupe + cooldown. */
  id: string;
  text: string;
  tone: PresenceTone;
  /** Optional jump target (URL path) and params. */
  to?: string;
  params?: Record<string, string>;
  /** Seed text for the Copilot when the operator taps "Ask". */
  ask?: string;
  /** Auto-dismiss after ms (0 = stay until dismissed). */
  ttlMs?: number;
  at: number;
}

interface PresenceState {
  current: PresenceMessage | null;
}

let state: PresenceState = { current: null };
const listeners = new Set<() => void>();
const lastSpokenAt = new Map<string, number>();
let hideTimer: ReturnType<typeof setTimeout> | null = null;

function emit() {
  listeners.forEach((l) => l());
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

/** Global cooldown so messages never pile up on top of each other. */
const GLOBAL_COOLDOWN_MS = 45_000;
let lastAnyAt = 0;

export interface SpeakOptions extends Omit<PresenceMessage, "at"> {
  /** Minimum ms before the same id can speak again. Default 15 min. */
  cooldownMs?: number;
  /** Bypass cooldowns (used for explicit summon). */
  force?: boolean;
}

export function presenceSpeak(opts: SpeakOptions): boolean {
  const now = Date.now();
  if (!opts.force) {
    if (now - lastAnyAt < GLOBAL_COOLDOWN_MS) return false;
    const last = lastSpokenAt.get(opts.id) ?? 0;
    if (now - last < (opts.cooldownMs ?? 15 * 60_000)) return false;
    if (typeof document !== "undefined" && document.hidden) return false;
  }
  lastSpokenAt.set(opts.id, now);
  lastAnyAt = now;
  state = {
    current: {
      id: opts.id,
      text: opts.text,
      tone: opts.tone,
      to: opts.to,
      params: opts.params,
      ask: opts.ask,
      ttlMs: opts.ttlMs ?? 22_000,
      at: now,
    },
  };
  emit();
  if (hideTimer) clearTimeout(hideTimer);
  const ttl = state.current?.ttlMs ?? 0;
  if (ttl > 0) hideTimer = setTimeout(() => presenceDismiss(), ttl);
  return true;
}

export function presenceDismiss() {
  if (hideTimer) {
    clearTimeout(hideTimer);
    hideTimer = null;
  }
  if (!state.current) return;
  state = { current: null };
  emit();
}

export function usePresenceMessage(): PresenceMessage | null {
  return useSyncExternalStore(
    (l) => {
      const unsub = subscribe(l);
      return () => { unsub(); };
    },
    () => state.current,
    () => null,
  );
}