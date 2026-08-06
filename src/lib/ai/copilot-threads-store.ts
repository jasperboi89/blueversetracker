import { createPersistedStore, useStoreValue } from "@/lib/settings/_persist";
import { attachCloudSync } from "@/lib/cloud-sync/blob-sync";

export interface CopilotMessage {
  role: "user" | "assistant";
  content: string;
  tools?: string[];
  at: number;
}

export interface CopilotThread {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: CopilotMessage[];
}

export interface CopilotThreadsState {
  threads: CopilotThread[];
  activeId: string | null;
  /** Rolling operator profile the Copilot uses to personalize answers. */
  profile: string;
  profileAt: number;
}

const MAX_THREADS = 30;
const DEFAULT: CopilotThreadsState = { threads: [], activeId: null, profile: "", profileAt: 0 };

const store = createPersistedStore<CopilotThreadsState>("aih:copilot:threads:v1", DEFAULT);

function newId() {
  return Math.random().toString(36).slice(2, 10);
}

function titleFrom(text: string) {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > 48 ? `${clean.slice(0, 48)}…` : clean || "New chat";
}

export const copilotThreads = {
  subscribe: store.subscribe,
  get: store.get,

  /** Currently open thread, creating one on demand. */
  ensureActive(): CopilotThread {
    const s = store.get();
    const existing = s.threads.find((t) => t.id === s.activeId);
    if (existing) return existing;
    return copilotThreads.newThread();
  },

  newThread(): CopilotThread {
    const thread: CopilotThread = {
      id: newId(),
      title: "New chat",
      createdAt: Date.now(),
      updatedAt: Date.now(),
      messages: [],
    };
    store.update((s) => ({
      ...s,
      threads: [thread, ...s.threads].slice(0, MAX_THREADS),
      activeId: thread.id,
    }));
    return thread;
  },

  select(id: string) {
    store.update((s) => ({ ...s, activeId: id }));
  },

  remove(id: string) {
    store.update((s) => {
      const threads = s.threads.filter((t) => t.id !== id);
      return { ...s, threads, activeId: s.activeId === id ? (threads[0]?.id ?? null) : s.activeId };
    });
  },

  rename(id: string, title: string) {
    store.update((s) => ({
      ...s,
      threads: s.threads.map((t) => (t.id === id ? { ...t, title } : t)),
    }));
  },

  append(id: string, message: CopilotMessage) {
    store.update((s) => ({
      ...s,
      threads: s.threads.map((t) =>
        t.id === id
          ? {
              ...t,
              messages: [...t.messages, message].slice(-60),
              updatedAt: Date.now(),
              title:
                t.title === "New chat" && message.role === "user"
                  ? titleFrom(message.content)
                  : t.title,
            }
          : t,
      ),
    }));
  },

  setProfile(profile: string) {
    store.update((s) => ({ ...s, profile, profileAt: Date.now() }));
  },
};

export function useCopilotThreads(): CopilotThreadsState {
  return useStoreValue(store, DEFAULT);
}

attachCloudSync<CopilotThreadsState>({
  storeKey: "copilot-threads",
  subscribe: (cb) => store.subscribe(cb),
  getSnapshot: () => store.get(),
  applyServerSnapshot: (next) => store.applyServerSnapshot(next),
  isEmpty: (s) => (s.threads?.length ?? 0) === 0,
});