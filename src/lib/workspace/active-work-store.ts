import { createPersistedStore, useStoreValue } from "@/lib/settings/_persist";
import { attachCloudSync } from "@/lib/cloud-sync/blob-sync";
import { logWorkSession } from "@/lib/workspace/work-log-store";
import { eventSpine } from "@/lib/core/event-spine";

/** Map a work kind onto the Event Spine's correlation field. */
function correlate(w: { kind: ActiveKind; id: string }) {
  if (w.kind === "ticket") return { ticketId: w.id };
  if (w.kind === "dispatch") return { dispatchId: w.id };
  return { workItemId: w.id };
}

export type ActiveKind = "ticket" | "dispatch" | "additional";

export interface ActiveWork {
  kind: ActiveKind;
  id: string;
  label: string;
  /** TanStack route id + params so the dock can link straight back. */
  to: string;
  params: Record<string, string>;
  startedAt: number; // epoch ms the current running segment began
  accumulatedMs: number; // time banked from earlier paused segments this session
  running: boolean;
  /** Account context so timer sessions can be filed on the account timeline. */
  accountNumber?: string;
  accountName?: string;
  /** Epoch ms the session first started (for the durable work-log entry). */
  sessionStartedAt: number;
}

export interface ActiveWorkState {
  current: ActiveWork | null;
  /** id -> total banked ms across sessions (read by the shift summary). */
  totals: Record<string, number>;
}

const DEFAULT: ActiveWorkState = { current: null, totals: {} };

export const activeWorkStore = createPersistedStore<ActiveWorkState>(
  "aih:workspace:active:v1",
  DEFAULT,
);

export function useActiveWork(): ActiveWorkState {
  return useStoreValue(activeWorkStore, DEFAULT);
}

/** Live elapsed for a work item (banked + current running segment). */
export function elapsedMs(w: ActiveWork, now = Date.now()): number {
  return w.accumulatedMs + (w.running ? Math.max(0, now - w.startedAt) : 0);
}

/** Format elapsed ms as m:ss or h:mm:ss. */
export function formatElapsed(ms: number): string {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
}

function bank(state: ActiveWorkState): ActiveWorkState {
  const cur = state.current;
  if (!cur) return state;
  const ms = elapsedMs(cur);
  return {
    ...state,
    totals: { ...state.totals, [cur.id]: (state.totals[cur.id] ?? 0) + ms },
  };
}

/** Start (or focus) a work item. Switching items banks the previous one's time. */
export function setActiveWork(input: {
  kind: ActiveKind;
  id: string;
  label: string;
  to: string;
  params: Record<string, string>;
  accountNumber?: string;
  accountName?: string;
}) {
  activeWorkStore.update((s) => {
    if (s.current?.id === input.id) {
      // Same item re-opened — keep timing, just refresh label/route.
      return {
        ...s,
        current: {
          ...s.current,
          label: input.label,
          to: input.to,
          params: input.params,
          accountNumber: input.accountNumber ?? s.current.accountNumber,
          accountName: input.accountName ?? s.current.accountName,
        },
      };
    }
    const banked = bankAndLog(s); // bank + log the outgoing item, if any
    const now = Date.now();
    eventSpine.emit({
      type: "work.started",
      source: "active-work",
      accountId: input.accountNumber || undefined,
      ...correlate(input),
      metadata: { label: input.label, accountName: input.accountName, kind: input.kind },
    });
    eventSpine.emit({
      type: "timer.started",
      source: "active-work",
      accountId: input.accountNumber || undefined,
      ...correlate(input),
      metadata: { label: input.label },
    });
    return {
      ...banked,
      current: {
        ...input,
        startedAt: now,
        sessionStartedAt: now,
        accumulatedMs: 0,
        running: true,
      },
    };
  });
}

export function pauseActive() {
  activeWorkStore.update((s) => {
    if (!s.current?.running) return s;
    eventSpine.emit({
      type: "work.paused",
      source: "active-work",
      accountId: s.current.accountNumber || undefined,
      ...correlate(s.current),
      metadata: { label: s.current.label },
    });
    return {
      ...s,
      current: { ...s.current, accumulatedMs: elapsedMs(s.current), running: false },
    };
  });
}

export function resumeActive() {
  activeWorkStore.update((s) => {
    if (!s.current || s.current.running) return s;
    eventSpine.emit({
      type: "timer.started",
      source: "active-work",
      accountId: s.current.accountNumber || undefined,
      ...correlate(s.current),
      metadata: { label: s.current.label, resumed: true },
    });
    return { ...s, current: { ...s.current, startedAt: Date.now(), running: true } };
  });
}

/** Set the live timer's elapsed time to an exact value (manual correction). */
export function setActiveElapsed(ms: number) {
  const next = Math.max(0, Math.round(ms));
  activeWorkStore.update((s) => {
    if (!s.current) return s;
    return {
      ...s,
      current: { ...s.current, accumulatedMs: next, startedAt: Date.now() },
    };
  });
}

/** Nudge the live timer by a delta in ms (can be negative). */
export function adjustActiveElapsed(deltaMs: number) {
  const cur = activeWorkStore.get().current;
  if (!cur) return;
  setActiveElapsed(elapsedMs(cur) + deltaMs);
}

/** Stop the active item and bank its time into totals. */
export function stopActive() {
  activeWorkStore.update((s) => ({ ...bankAndLog(s), current: null }));
}

/**
 * Called by a work route's cleanup effect when the user navigates away.
 * Stops the timer and records a durable session entry — but only if the
 * currently-tracked item is still the one this route owns (switching
 * directly to another work item is handled by setActiveWork's own banking).
 */
export function leaveActiveWork(id: string) {
  activeWorkStore.update((s) => {
    if (s.current?.id !== id) return s;
    return { ...bankAndLog(s), current: null };
  });
}

export function clearTotals() {
  activeWorkStore.update((s) => ({ ...s, totals: {} }));
}

/** Bank the outgoing item's time AND write a durable work-log entry. */
function bankAndLog(state: ActiveWorkState): ActiveWorkState {
  const cur = state.current;
  if (!cur) return state;
  const endedAt = Date.now();
  const durationMs = elapsedMs(cur, endedAt);
  eventSpine.emit({
    type: "timer.stopped",
    source: "active-work",
    accountId: cur.accountNumber || undefined,
    ...correlate(cur),
    metadata: { label: cur.label, durationMs },
  });
  logWorkSession({
    kind: cur.kind,
    workId: cur.id,
    label: cur.label,
    accountNumber: cur.accountNumber ?? "",
    accountName: cur.accountName,
    startedAt: cur.sessionStartedAt ?? endedAt - durationMs,
    endedAt,
    durationMs,
    to: cur.to,
    params: cur.params,
  });
  return {
    ...state,
    totals: { ...state.totals, [cur.id]: (state.totals[cur.id] ?? 0) + durationMs },
  };
}

attachCloudSync<ActiveWorkState>({
  storeKey: "workspace-active",
  subscribe: (cb) => activeWorkStore.subscribe(cb),
  getSnapshot: () => activeWorkStore.get(),
  applyServerSnapshot: (next) => activeWorkStore.applyServerSnapshot(next),
  isEmpty: (s) => !s.current && Object.keys(s.totals ?? {}).length === 0,
});
