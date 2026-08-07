import { createPersistedStore, useStoreValue } from "./_persist";
import { attachCloudSync } from "@/lib/cloud-sync/blob-sync";

/**
 * Reusable text snippets the operator inserts into any rich text box.
 * Scope keeps the picker short: a work-note snippet doesn't clutter the
 * dispatch summary box.
 */
export const SNIPPET_SCOPES = ["work-note", "retest", "dispatch", "general"] as const;
export type SnippetScope = (typeof SNIPPET_SCOPES)[number];

export const SNIPPET_SCOPE_LABEL: Record<SnippetScope, string> = {
  "work-note": "Work note",
  retest: "Retest note",
  dispatch: "Dispatch summary",
  general: "General",
};

export interface Snippet {
  id: string;
  title: string;
  /** Stored as HTML so it round-trips through the rich editor. */
  html: string;
  scope: SnippetScope;
  usageCount: number;
  createdAt: number;
}

interface State {
  snippets: Snippet[];
}

const DEFAULT: State = { snippets: [] };

export const snippetsStore = createPersistedStore<State>("aih:settings:snippets:v1", DEFAULT);

export function useSnippets(scope?: SnippetScope): Snippet[] {
  const all = useStoreValue(snippetsStore, DEFAULT).snippets;
  const list = scope ? all.filter((s) => s.scope === scope || s.scope === "general") : all;
  return [...list].sort((a, b) => b.usageCount - a.usageCount || b.createdAt - a.createdAt);
}

export const snippetsActions = {
  add(input: { title: string; html: string; scope: SnippetScope }): Snippet {
    const snippet: Snippet = {
      id: `snip-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      title: input.title.trim().slice(0, 80) || "Untitled snippet",
      html: input.html,
      scope: input.scope,
      usageCount: 0,
      createdAt: Date.now(),
    };
    snippetsStore.update((s) => ({ snippets: [...s.snippets, snippet] }));
    return snippet;
  },
  update(id: string, patch: Partial<Omit<Snippet, "id">>) {
    snippetsStore.update((s) => ({
      snippets: s.snippets.map((x) => (x.id === id ? { ...x, ...patch } : x)),
    }));
  },
  remove(id: string) {
    snippetsStore.update((s) => ({ snippets: s.snippets.filter((x) => x.id !== id) }));
  },
  markUsed(id: string) {
    snippetsStore.update((s) => ({
      snippets: s.snippets.map((x) => (x.id === id ? { ...x, usageCount: x.usageCount + 1 } : x)),
    }));
  },
};

attachCloudSync<State>({
  storeKey: "settings:snippets",
  subscribe: snippetsStore.subscribe,
  getSnapshot: () => snippetsStore.get(),
  applyServerSnapshot: (next) => snippetsStore.applyServerSnapshot(next),
});