import { createPersistedStore, useStoreValue } from "@/lib/settings/_persist";
import { attachCloudSync } from "@/lib/cloud-sync/blob-sync";

/** Absolute geometry + window state for one floating pane, in canvas pixels. */
export interface PaneRect {
  x: number;
  y: number;
  w: number;
  h: number;
  z: number;
  collapsed: boolean;
  locked: boolean;
  hidden: boolean;
}

/** Percent-based default a workspace declares per pane (converted to px on first render). */
export interface PaneDefault {
  xPct: number;
  yPct: number;
  wPct: number;
  hPct: number;
}

export type PresetName = "Single" | "Dual";
export const PRESET_NAMES: PresetName[] = ["Single", "Dual"];

/** "auto" = Floating on wide screens, Stacked on narrow; the others force it. */
export type LayoutMode = "auto" | "floating" | "stacked";

/** presetName -> paneId -> stored rect (only panes the user has touched are stored). */
export interface PaneLayoutState {
  activePreset: PresetName;
  mode: LayoutMode;
  presets: Record<string, Record<string, Partial<PaneRect>>>;
}

const DEFAULT: PaneLayoutState = {
  activePreset: "Single",
  mode: "auto",
  presets: { Single: {}, Dual: {} },
};

// One workspace ("ticket-work") for now; the store is keyed so more can be added later.
const STORE_KEY = "aih:workspace:panes:v1";

export const paneLayoutStore = createPersistedStore<PaneLayoutState>(STORE_KEY, DEFAULT);

export function usePaneLayout(): PaneLayoutState {
  return useStoreValue(paneLayoutStore, DEFAULT);
}

function ensurePreset(s: PaneLayoutState, preset: string): PaneLayoutState {
  if (s.presets[preset]) return s;
  return { ...s, presets: { ...s.presets, [preset]: {} } };
}

export function setActivePreset(preset: PresetName) {
  paneLayoutStore.update((s) => ensurePreset({ ...s, activePreset: preset }, preset));
}

export function setLayoutMode(mode: LayoutMode) {
  paneLayoutStore.update((s) => ({ ...s, mode }));
}

/** Resolve the effective layout: honor an explicit mode, else fall back to width. */
export function resolveFloating(mode: LayoutMode, isNarrow: boolean): boolean {
  if (mode === "floating") return true;
  if (mode === "stacked") return false;
  return !isNarrow;
}

export function patchPane(paneId: string, patch: Partial<PaneRect>) {
  paneLayoutStore.update((s) => {
    const preset = s.activePreset;
    const withPreset = ensurePreset(s, preset);
    const cur = withPreset.presets[preset][paneId] ?? {};
    return {
      ...withPreset,
      presets: {
        ...withPreset.presets,
        [preset]: { ...withPreset.presets[preset], [paneId]: { ...cur, ...patch } },
      },
    };
  });
}

/** Bring one pane to the front by bumping its z above the current max. */
export function bringToFront(paneId: string) {
  paneLayoutStore.update((s) => {
    const preset = s.activePreset;
    const rects = s.presets[preset] ?? {};
    const maxZ = Object.values(rects).reduce((m, r) => Math.max(m, r.z ?? 0), 0);
    const cur = rects[paneId] ?? {};
    if ((cur.z ?? 0) === maxZ && maxZ > 0) return s;
    return {
      ...s,
      presets: { ...s.presets, [preset]: { ...rects, [paneId]: { ...cur, z: maxZ + 1 } } },
    };
  });
}

/** Clear all stored rects for the active preset (panes fall back to their declared defaults). */
export function resetActivePreset() {
  paneLayoutStore.update((s) => ({
    ...s,
    presets: { ...s.presets, [s.activePreset]: {} },
  }));
}

export function setAllLocked(locked: boolean, paneIds: string[]) {
  paneLayoutStore.update((s) => {
    const preset = s.activePreset;
    const rects = { ...(s.presets[preset] ?? {}) };
    for (const id of paneIds) rects[id] = { ...(rects[id] ?? {}), locked };
    return { ...s, presets: { ...s.presets, [preset]: rects } };
  });
}

export function getStoredRect(
  state: PaneLayoutState,
  paneId: string,
): Partial<PaneRect> | undefined {
  return state.presets[state.activePreset]?.[paneId];
}

/** Convert a percent default into an absolute rect for a given canvas size, clamped. */
export function defaultToRect(def: PaneDefault, canvasW: number, canvasH: number): PaneRect {
  const w = Math.round((def.wPct / 100) * canvasW);
  const h = Math.round((def.hPct / 100) * canvasH);
  return {
    x: Math.round((def.xPct / 100) * canvasW),
    y: Math.round((def.yPct / 100) * canvasH),
    w,
    h,
    z: 1,
    collapsed: false,
    locked: false,
    hidden: false,
  };
}

export const PANE_MIN_W = 260;
export const PANE_MIN_H = 120;

/** Keep a pane inside the canvas; never let its title bar go off-screen. */
export function clampRect(r: PaneRect, canvasW: number, canvasH: number): PaneRect {
  const w = Math.max(PANE_MIN_W, Math.min(r.w, canvasW));
  const h = Math.max(PANE_MIN_H, Math.min(r.h, Math.max(PANE_MIN_H, canvasH)));
  const x = Math.max(0, Math.min(r.x, Math.max(0, canvasW - w)));
  const y = Math.max(0, Math.min(r.y, Math.max(0, canvasH - Math.min(h, 48))));
  return { ...r, x, y, w, h };
}

attachCloudSync<PaneLayoutState>({
  storeKey: "workspace-panes",
  subscribe: (cb) => paneLayoutStore.subscribe(cb),
  getSnapshot: () => paneLayoutStore.get(),
  applyServerSnapshot: (next) => paneLayoutStore.applyServerSnapshot(next),
  isEmpty: (s) =>
    Object.keys(s.presets?.Single ?? {}).length === 0 &&
    Object.keys(s.presets?.Dual ?? {}).length === 0,
});
