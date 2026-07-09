import { useSyncExternalStore } from "react";
import { toast } from "sonner";
import {
  freshdeskGetMyAgent,
  freshdeskListAssignedToMe,
  type AssignedTicketRow,
} from "./api/freshdesk-assigned.functions";
import { displayPrefsStore } from "./settings/display-prefs-store";

interface State {
  agentId?: number;
  agentName?: string;
  tickets: AssignedTicketRow[];
  seenIds: string[]; // ticket numbers already toasted
  dismissedIds: string[];
  lastSyncedAt?: number;
  lastError?: string;
  syncing: boolean;
}

const KEY = "aih:assigned-inbox:v1";
const POLL_MS = 3 * 60 * 1000;

let state: State = { tickets: [], seenIds: [], dismissedIds: [], syncing: false };
let loaded = false;
let pollTimer: ReturnType<typeof setInterval> | null = null;
let pollerStarted = false;
const listeners = new Set<() => void>();

function load() {
  if (loaded || typeof window === "undefined") return;
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<State>;
      state = {
        agentId: parsed.agentId,
        agentName: parsed.agentName,
        tickets: Array.isArray(parsed.tickets) ? parsed.tickets : [],
        seenIds: Array.isArray(parsed.seenIds) ? parsed.seenIds : [],
        dismissedIds: Array.isArray(parsed.dismissedIds) ? parsed.dismissedIds : [],
        lastSyncedAt: parsed.lastSyncedAt,
        lastError: parsed.lastError,
        syncing: false,
      };
    }
  } catch {}
  loaded = true;
}

function persist() {
  if (typeof window !== "undefined") {
    try {
      const { syncing: _s, ...rest } = state;
      void _s;
      localStorage.setItem(KEY, JSON.stringify(rest));
    } catch {}
  }
  listeners.forEach((l) => l());
}

async function ensureAgent(): Promise<number | undefined> {
  load();
  if (state.agentId) return state.agentId;
  const res = await freshdeskGetMyAgent();
  if (!res.ok) {
    state = { ...state, lastError: res.error };
    persist();
    return undefined;
  }
  state = { ...state, agentId: res.agentId, agentName: res.name, lastError: undefined };
  persist();
  return res.agentId;
}

async function refresh(silent = false): Promise<void> {
  load();
  if (state.syncing) return;
  const agentId = await ensureAgent();
  if (!agentId) return;

  state = { ...state, syncing: true };
  persist();
  try {
    const res = await freshdeskListAssignedToMe({ data: { agentId } });
    if (!res.ok) {
      state = { ...state, syncing: false, lastError: res.error };
      persist();
      return;
    }

    const prevIds = new Set(state.tickets.map((t) => t.number));
    const seenSet = new Set(state.seenIds);
    const dismissedSet = new Set(state.dismissedIds);
    const newlyArrived: AssignedTicketRow[] = [];
    for (const t of res.tickets) {
      if (!prevIds.has(t.number) && !seenSet.has(t.number)) newlyArrived.push(t);
    }

    // Prune dismissed for tickets no longer present.
    const currentIds = new Set(res.tickets.map((t) => t.number));
    const nextDismissed = state.dismissedIds.filter((id) => currentIds.has(id));
    const nextSeen = Array.from(new Set([...state.seenIds, ...res.tickets.map((t) => t.number)]));

    state = {
      ...state,
      tickets: res.tickets,
      lastSyncedAt: res.fetchedAt,
      lastError: undefined,
      syncing: false,
      seenIds: nextSeen.slice(-500),
      dismissedIds: nextDismissed,
    };
    persist();

    if (!silent && newlyArrived.length > 0) {
      const quiet = displayPrefsStore.get().quietInsights;
      if (!quiet) fireNewTicketToasts(newlyArrived, dismissedSet);
    }
  } catch (e) {
    state = {
      ...state,
      syncing: false,
      lastError: e instanceof Error ? e.message : "Sync failed.",
    };
    persist();
  }
}

function fireNewTicketToasts(tickets: AssignedTicketRow[], dismissed: Set<string>) {
  const fresh = tickets.filter((t) => !dismissed.has(t.number));
  if (fresh.length === 0) return;
  if (fresh.length === 1) {
    const t = fresh[0];
    toast.warning(`New ticket assigned: FD #${t.number}`, {
      description: t.subject,
      duration: 8000,
      action: {
        label: "Open",
        onClick: () => {
          window.location.assign("/assigned-to-me");
        },
      },
    });
  } else {
    toast.warning(`${fresh.length} new tickets assigned to you`, {
      description: fresh
        .slice(0, 3)
        .map((t) => `#${t.number}`)
        .join(", ") + (fresh.length > 3 ? "…" : ""),
      duration: 9000,
      action: {
        label: "Open",
        onClick: () => {
          window.location.assign("/assigned-to-me");
        },
      },
    });
  }
}

function startPolling() {
  if (pollerStarted || typeof window === "undefined") return;
  pollerStarted = true;
  load();

  const tick = () => {
    if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
    void refresh();
  };
  // First run shortly after mount (don't block startup).
  setTimeout(tick, 4000);
  pollTimer = setInterval(tick, POLL_MS);
  if (typeof document !== "undefined") {
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") {
        const last = state.lastSyncedAt ?? 0;
        if (Date.now() - last > POLL_MS) tick();
      }
    });
  }
}

export const assignedInboxStore = {
  subscribe(l: () => void) {
    listeners.add(l);
    return () => listeners.delete(l);
  },
  get(): State {
    load();
    return state;
  },
  refresh,
  startPolling,
  dismiss(ticketNumber: string) {
    load();
    if (state.dismissedIds.includes(ticketNumber)) return;
    state = { ...state, dismissedIds: [...state.dismissedIds, ticketNumber] };
    persist();
  },
  markAllSeen() {
    load();
    state = {
      ...state,
      seenIds: Array.from(new Set([...state.seenIds, ...state.tickets.map((t) => t.number)])),
    };
    persist();
  },
  clearError() {
    load();
    state = { ...state, lastError: undefined };
    persist();
  },
};

const EMPTY: State = { tickets: [], seenIds: [], dismissedIds: [], syncing: false };

export function useAssignedInbox() {
  return useSyncExternalStore(assignedInboxStore.subscribe, () => assignedInboxStore.get(), () => EMPTY);
}

/** Count of tickets not yet acknowledged (seen) or dismissed. */
export function useAssignedUnreadCount(): number {
  const s = useAssignedInbox();
  const dismissed = new Set(s.dismissedIds);
  const seen = new Set(s.seenIds);
  // Unread = tickets present now that weren't in seenIds before this session's mark.
  // We treat "unseen" as: not in seenIds AND not dismissed.
  return s.tickets.filter((t) => !seen.has(t.number) && !dismissed.has(t.number)).length;
}

/** Convenience: returns rows filtered to non-dismissed. */
export function useVisibleAssignedTickets(): AssignedTicketRow[] {
  const s = useAssignedInbox();
  const dismissed = new Set(s.dismissedIds);
  return s.tickets.filter((t) => !dismissed.has(t.number));
}