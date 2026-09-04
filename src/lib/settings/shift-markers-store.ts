import { attachCloudSync } from "@/lib/cloud-sync/blob-sync";
import { createPersistedStore, useStoreValue } from "./_persist";

/**
 * User-configurable shift markers (breaks, lunch, coverage, meetings…).
 *
 * Presentation-layer preference only — persisted with the same localStorage
 * mechanism every other Settings store uses. No backend, no governance
 * surface, no execution semantics.
 */
export interface ShiftMarker {
  id: string;
  /** Free-text label — "Break", "Lunch", "Coverage", anything the operator types. */
  name: string;
  /** Central-time hour (0-23) the marker starts. */
  hour: number;
  /** Central-time minute (0-59) the marker starts. */
  minute: number;
  /** Optional duration in minutes. */
  durationMin?: number;
  /** Marks a milestone rather than a rest break (rendered in gold). */
  milestone?: boolean;
}

export interface ShiftMarkersState {
  markers: ShiftMarker[];
}

export const DEFAULT_SHIFT_MARKERS: ShiftMarkersState = { markers: [] };

export const shiftMarkersStore = createPersistedStore<ShiftMarkersState>(
  "aih:settings:shift-markers:v1",
  DEFAULT_SHIFT_MARKERS,
);

// Markers are a per-operator preference, so they ride the same user-scoped
// blob sync every other Settings store uses. Sign-out purges the "aih:" local
// mirror for workstation hygiene; the cloud copy re-hydrates on next sign-in.
attachCloudSync<ShiftMarkersState>({
  storeKey: "settings:shift-markers",
  subscribe: shiftMarkersStore.subscribe,
  getSnapshot: () => shiftMarkersStore.get(),
  applyServerSnapshot: (next) => shiftMarkersStore.applyServerSnapshot(next),
  // An empty local set must never be uploaded over a saved cloud set: the
  // one-time local import only runs when there is genuinely something to keep.
  isEmpty: (s) => !s.markers || s.markers.length === 0,
});

export function useShiftMarkers(): ShiftMarker[] {
  return useStoreValue(shiftMarkersStore, DEFAULT_SHIFT_MARKERS).markers;
}

export function newMarkerId(): string {
  return `mk_${Math.random().toString(36).slice(2, 9)}`;
}

export function setMarkers(markers: ShiftMarker[]) {
  shiftMarkersStore.set({ markers: sortMarkers(markers) });
}

/** Order markers by their offset inside the shift window. */
export function sortMarkers(markers: ShiftMarker[], startHour = 22, startMinute = 0): ShiftMarker[] {
  return [...markers].sort(
    (a, b) =>
      offsetFromShiftStart(a.hour, a.minute, startHour, startMinute) -
      offsetFromShiftStart(b.hour, b.minute, startHour, startMinute),
  );
}

/** Minutes from shift start, wrapping past midnight. Always 0..1439. */
export function offsetFromShiftStart(
  hour: number,
  minute: number,
  startHour: number,
  startMinute: number,
): number {
  const raw = hour * 60 + minute - (startHour * 60 + startMinute);
  return ((raw % 1440) + 1440) % 1440;
}

/** Shift window length in minutes, wrapping past midnight. */
export function shiftLengthMinutes(
  startHour: number,
  startMinute: number,
  endHour: number,
  endMinute: number,
): number {
  const len = offsetFromShiftStart(endHour, endMinute, startHour, startMinute);
  return len === 0 ? 1440 : len;
}

export function formatClock(hour: number, minute: number): string {
  const period = hour >= 12 ? "PM" : "AM";
  const display = ((hour + 11) % 12) + 1;
  return `${display}:${String(minute).padStart(2, "0")} ${period}`;
}

/** "22:30" <-> {hour,minute} helpers for <input type="time"> binding. */
export function toTimeValue(hour: number, minute: number): string {
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

export function fromTimeValue(value: string): { hour: number; minute: number } | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!m) return null;
  const hour = Number(m[1]);
  const minute = Number(m[2]);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return { hour, minute };
}
