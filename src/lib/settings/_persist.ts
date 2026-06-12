import { useSyncExternalStore } from "react";

/** Minimal localStorage-backed reactive store factory used across Settings. */
export function createPersistedStore<T>(key: string, initial: T) {
  let state: T = initial;
  let loaded = false;
  const listeners = new Set<() => void>();

  function load() {
    if (typeof window === "undefined") return;
    if (loaded) return;
    try {
      const raw = localStorage.getItem(key);
      if (raw) {
        const parsed = JSON.parse(raw) as T;
        if (parsed && typeof parsed === "object") {
          state = { ...initial, ...parsed } as T;
        } else {
          state = parsed;
        }
      }
    } catch {}
    loaded = true;
  }

  function persist() {
    if (typeof window !== "undefined") {
      try { localStorage.setItem(key, JSON.stringify(state)); } catch {}
    }
    listeners.forEach((l) => l());
  }

  return {
    subscribe(l: () => void) { listeners.add(l); return () => listeners.delete(l); },
    get(): T { load(); return state; },
    set(next: T) { load(); state = next; persist(); },
    update(updater: (cur: T) => T) { load(); state = updater(state); persist(); },
    reset() { load(); state = initial; persist(); },
  };
}

export function useStoreValue<T>(store: { subscribe: (l: () => void) => void | (() => void); get: () => T }, fallback: T): T {
  return useSyncExternalStore(
    (l) => {
      const unsub = store.subscribe(l);
      return typeof unsub === "function" ? unsub : () => {};
    },
    () => store.get(),
    () => fallback,
  );
}