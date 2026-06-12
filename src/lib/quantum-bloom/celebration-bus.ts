import { themeStore } from "@/lib/settings/theme-store";

export type CelebrationKind = "ticket" | "dispatch" | "night_plan" | "shift" | "cosmic";

export interface CelebrationEvent {
  id: string;
  kind: CelebrationKind;
  label: string;
  context?: Record<string, unknown>;
  ts: number;
}

type Listener = (e: CelebrationEvent) => void;

const listeners = new Set<Listener>();
let lastEmit = 0;
let pendingTimer: ReturnType<typeof setTimeout> | null = null;
let pending: CelebrationEvent | null = null;

const MERGE_WINDOW_MS = 400;

function emit(event: CelebrationEvent) {
  lastEmit = Date.now();
  listeners.forEach((l) => {
    try { l(event); } catch {}
  });
}

export function subscribeCelebrations(l: Listener) {
  listeners.add(l);
  return () => listeners.delete(l);
}

/**
 * Trigger a Quantum Bloom celebration + record a Discovery row.
 * No-op unless theme === 'quantum-bloom'.
 * Coalesces multiple emits within MERGE_WINDOW_MS into one.
 */
export function triggerCelebration(input: {
  kind: CelebrationKind;
  label: string;
  context?: Record<string, unknown>;
}) {
  if (typeof window === "undefined") return;
  const theme = themeStore.get().theme;
  if (theme !== "quantum-bloom") return;

  const event: CelebrationEvent = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    kind: input.kind,
    label: input.label,
    context: input.context,
    ts: Date.now(),
  };

  // Best-effort: record discovery to cloud (fire & forget).
  void recordSafely(event);

  const since = Date.now() - lastEmit;
  if (since < MERGE_WINDOW_MS) {
    // Merge: keep the newer event but defer to single emit.
    pending = event;
    if (!pendingTimer) {
      pendingTimer = setTimeout(() => {
        const p = pending;
        pending = null;
        pendingTimer = null;
        if (p) emit(p);
      }, MERGE_WINDOW_MS - since);
    }
    return;
  }
  emit(event);
}

async function recordSafely(event: CelebrationEvent) {
  try {
    const { recordDiscovery } = await import("./discoveries.functions");
    await recordDiscovery({
      data: {
        kind: event.kind,
        label: event.label,
        context: event.context ?? {},
      },
    });
  } catch {
    // offline / not signed in — silent
  }
}
