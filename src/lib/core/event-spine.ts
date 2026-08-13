import { createPersistedStore, useStoreValue } from "@/lib/settings/_persist";
import { getShiftKey } from "@/lib/shift";
import {
  matchesFilter,
  type AccEvent,
  type AccEventFilter,
  type AccEventHandler,
  type AccEventInput,
} from "./events";

/** Keep the buffer small — it's working context, not an archive. */
const MAX_EVENTS = 300;

interface SpineState {
  shiftKey: string;
  events: AccEvent[];
}

const DEFAULT: SpineState = { shiftKey: "", events: [] };

const store = createPersistedStore<SpineState>("aih:core:eventspine:v1", DEFAULT);

const handlers = new Set<{ fn: AccEventHandler; filter?: AccEventFilter }>();

function newId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Drop events from a previous shift so context never leaks across shifts. */
function currentEvents(state: SpineState, shiftKey: string): AccEvent[] {
  return state.shiftKey === shiftKey ? state.events : [];
}

export const eventSpine = {
  /** Publish a fact. Never throws into the caller. */
  emit(input: AccEventInput): AccEvent {
    const event: AccEvent = {
      ...input,
      id: newId(),
      timestamp: input.timestamp ?? new Date().toISOString(),
    };
    try {
      const shiftKey = getShiftKey();
      store.update((s) => ({
        shiftKey,
        events: [event, ...currentEvents(s, shiftKey)].slice(0, MAX_EVENTS),
      }));
    } catch (err) {
      console.warn("[event-spine] persist failed", err);
    }
    for (const h of handlers) {
      if (!matchesFilter(event, h.filter)) continue;
      try {
        h.fn(event);
      } catch (err) {
        console.warn("[event-spine] subscriber failed", err);
      }
    }
    return event;
  },

  /** Listen for events. Returns an unsubscribe function. */
  subscribe(fn: AccEventHandler, filter?: AccEventFilter): () => void {
    const entry = { fn, filter };
    handlers.add(entry);
    return () => {
      handlers.delete(entry);
    };
  },

  /** Remove every subscription registered with this handler function. */
  unsubscribe(fn: AccEventHandler): void {
    for (const h of [...handlers]) if (h.fn === fn) handlers.delete(h);
  },

  /** Most recent events first, current shift only. */
  recent(limit = 50, filter?: AccEventFilter): AccEvent[] {
    const shiftKey = getShiftKey();
    return currentEvents(store.get(), shiftKey)
      .filter((e) => matchesFilter(e, filter))
      .slice(0, limit);
  },

  clear(): void {
    store.set({ shiftKey: getShiftKey(), events: [] });
  },

  /** Reactive subscription for React views (buffer changes). */
  subscribeStore(l: () => void) {
    return store.subscribe(l);
  },

  getState(): SpineState {
    return store.get();
  },
};

/** Read the current shift's event buffer in a component. */
export function useRecentEvents(limit = 50): AccEvent[] {
  const state = useStoreValue(store, DEFAULT);
  const shiftKey = typeof window === "undefined" ? state.shiftKey : getShiftKey();
  return currentEvents(state, shiftKey).slice(0, limit);
}