import { createPersistedStore, useStoreValue } from "@/lib/settings/_persist";
import { attachCloudSync } from "@/lib/cloud-sync/blob-sync";

/**
 * Knowledge Vault workspace preferences: pane geometry, note-stack density,
 * context drawer state, and the presentation-only note lifecycle + book order.
 *
 * Lifecycle/order live here (not in the notes table) so the remodel needs no
 * schema migration; both are additive presentation metadata keyed by note id.
 */

export type VaultDensity = "compact" | "comfortable" | "cards";
export type NoteStatus = "draft" | "saved" | "reference";
export type ContextTab = "details" | "versions" | "tags" | "attachments" | "related";

export const NAV_MIN = 180;
export const NAV_MAX = 420;
export const NAV_DEFAULT = 244;
export const STACK_MIN = 260;
export const STACK_MAX = 640;
export const STACK_DEFAULT = 350;

export interface VaultWorkspaceState {
  navWidth: number;
  stackWidth: number;
  navCollapsed: boolean;
  stackCollapsed: boolean;
  density: VaultDensity;
  drawerOpen: boolean;
  drawerTab: ContextTab;
  lastView: string;
  shelfOpen: boolean;
  /** noteId -> lifecycle state. Absent = "saved". */
  status: Record<string, NoteStatus>;
  /** folderId -> ordered note ids (partial lists are fine; unknown notes append). */
  bookOrder: Record<string, string[]>;
  /** folderId -> bookmarked note id. */
  bookmarks: Record<string, string>;
}

const DEFAULT: VaultWorkspaceState = {
  navWidth: NAV_DEFAULT,
  stackWidth: STACK_DEFAULT,
  navCollapsed: false,
  stackCollapsed: false,
  density: "comfortable",
  drawerOpen: false,
  drawerTab: "details",
  lastView: "all",
  shelfOpen: false,
  status: {},
  bookOrder: {},
  bookmarks: {},
};

export const vaultWorkspaceStore = createPersistedStore<VaultWorkspaceState>(
  "aih:knowledge:workspace:v1",
  DEFAULT,
);

export function useVaultWorkspace(): VaultWorkspaceState {
  return useStoreValue(vaultWorkspaceStore, DEFAULT);
}

export function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, Math.round(value)));
}

export const vaultWorkspace = {
  setNavWidth(width: number) {
    vaultWorkspaceStore.update((s) => ({ ...s, navWidth: clamp(width, NAV_MIN, NAV_MAX) }));
  },
  setStackWidth(width: number) {
    vaultWorkspaceStore.update((s) => ({ ...s, stackWidth: clamp(width, STACK_MIN, STACK_MAX) }));
  },
  resetNavWidth() {
    vaultWorkspaceStore.update((s) => ({ ...s, navWidth: NAV_DEFAULT, navCollapsed: false }));
  },
  resetStackWidth() {
    vaultWorkspaceStore.update((s) => ({ ...s, stackWidth: STACK_DEFAULT, stackCollapsed: false }));
  },
  setNavCollapsed(collapsed: boolean) {
    vaultWorkspaceStore.update((s) => ({ ...s, navCollapsed: collapsed }));
  },
  setStackCollapsed(collapsed: boolean) {
    vaultWorkspaceStore.update((s) => ({ ...s, stackCollapsed: collapsed }));
  },
  setDensity(density: VaultDensity) {
    vaultWorkspaceStore.update((s) => ({ ...s, density }));
  },
  setDrawer(open: boolean, tab?: ContextTab) {
    vaultWorkspaceStore.update((s) => ({ ...s, drawerOpen: open, drawerTab: tab ?? s.drawerTab }));
  },
  setDrawerTab(tab: ContextTab) {
    vaultWorkspaceStore.update((s) => ({ ...s, drawerTab: tab, drawerOpen: true }));
  },
  setShelfOpen(open: boolean) {
    vaultWorkspaceStore.update((s) => ({ ...s, shelfOpen: open }));
  },
  setLastView(view: string) {
    vaultWorkspaceStore.update((s) => ({ ...s, lastView: view }));
  },
  setStatus(noteId: string, status: NoteStatus) {
    vaultWorkspaceStore.update((s) => ({ ...s, status: { ...s.status, [noteId]: status } }));
  },
  setBookOrder(folderId: string, noteIds: string[]) {
    vaultWorkspaceStore.update((s) => ({
      ...s,
      bookOrder: { ...s.bookOrder, [folderId]: noteIds },
    }));
  },
  setBookmark(folderId: string, noteId: string) {
    vaultWorkspaceStore.update((s) => ({
      ...s,
      bookmarks: { ...s.bookmarks, [folderId]: noteId },
    }));
  },
};

/** Lifecycle of a note; "reference" opens read-only and needs an explicit unlock. */
export function noteStatus(state: VaultWorkspaceState, noteId: string): NoteStatus {
  return state.status[noteId] ?? "saved";
}

/** Apply a stored book order to a collection's notes; unknown notes keep their natural order. */
export function orderedForBook<T extends { id: string }>(
  notes: T[],
  order: string[] | undefined,
): T[] {
  if (!order || order.length === 0) return notes;
  const rank = new Map(order.map((id, index) => [id, index]));
  return [...notes].sort((a, b) => {
    const ar = rank.get(a.id);
    const br = rank.get(b.id);
    if (ar === undefined && br === undefined) return 0;
    if (ar === undefined) return 1;
    if (br === undefined) return -1;
    return ar - br;
  });
}

attachCloudSync<VaultWorkspaceState>({
  storeKey: "knowledge-workspace",
  subscribe: (cb) => vaultWorkspaceStore.subscribe(cb),
  getSnapshot: () => vaultWorkspaceStore.get(),
  applyServerSnapshot: (next) => vaultWorkspaceStore.applyServerSnapshot(next),
  isEmpty: (s) =>
    Object.keys(s.status ?? {}).length === 0 && Object.keys(s.bookOrder ?? {}).length === 0,
});