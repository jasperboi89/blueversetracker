import { useSyncExternalStore } from "react";
import type { PortalEntityType } from "./portal-context";

/**
 * Portal Presence — the small pieces of "where am I / what am I touching"
 * that no authoritative store owns: Knowledge Vault note selection, the
 * current presentation mode, and unsaved-work signals.
 *
 * Deliberately in-memory (never persisted, never synced) and metadata only:
 * surfaces publish IDs, labels and a dirty flag — never draft content.
 */

export interface KnowledgePresence {
  id: string;
  title?: string;
  collection?: string;
  noteType?: string;
  status?: string;
  updatedAt?: string;
  /** reader | edit | book | focus */
  presentation?: string;
}

export interface PortalPresenceState {
  knowledgeNote?: KnowledgePresence;
  /** entityType -> entity ids with unsaved edits. Content is never stored. */
  unsaved: Partial<Record<PortalEntityType, string[]>>;
  editMode: boolean;
}

const EMPTY: PortalPresenceState = { unsaved: {}, editMode: false };

let state: PortalPresenceState = EMPTY;
const listeners = new Set<() => void>();

function commit(next: PortalPresenceState) {
  if (next === state) return;
  state = next;
  for (const l of listeners) l();
}

function sameIds(a: string[] | undefined, b: string[]): boolean {
  return (a?.length ?? 0) === b.length && (a ?? []).every((v, i) => v === b[i]);
}

export const portalPresence = {
  get(): PortalPresenceState {
    return state;
  },
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  /** Publish (or clear) the Knowledge Vault note the operator has selected. */
  setKnowledgeNote(note: KnowledgePresence | null) {
    const cur = state.knowledgeNote;
    if (!note) {
      if (!cur) return;
      commit({ ...state, knowledgeNote: undefined });
      return;
    }
    if (
      cur &&
      cur.id === note.id &&
      cur.title === note.title &&
      cur.status === note.status &&
      cur.presentation === note.presentation &&
      cur.collection === note.collection &&
      cur.updatedAt === note.updatedAt
    ) {
      return;
    }
    commit({ ...state, knowledgeNote: note });
  },
  /** Signal only: "this entity has unsaved edits". Never the edits themselves. */
  setUnsaved(entityType: PortalEntityType, entityId: string, dirty: boolean) {
    const cur = state.unsaved[entityType] ?? [];
    const next = dirty
      ? cur.includes(entityId)
        ? cur
        : [...cur, entityId]
      : cur.filter((id) => id !== entityId);
    if (sameIds(cur, next)) return;
    const unsaved = { ...state.unsaved };
    if (next.length) unsaved[entityType] = next;
    else delete unsaved[entityType];
    commit({ ...state, unsaved });
  },
  setEditMode(editMode: boolean) {
    if (state.editMode === editMode) return;
    commit({ ...state, editMode });
  },
  reset() {
    commit(EMPTY);
  },
};

export function usePortalPresence(): PortalPresenceState {
  return useSyncExternalStore(
    portalPresence.subscribe,
    portalPresence.get,
    () => EMPTY,
  );
}
