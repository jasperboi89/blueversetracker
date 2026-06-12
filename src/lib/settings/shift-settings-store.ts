import { createPersistedStore, useStoreValue } from "./_persist";

export interface ShiftSettings {
  /** 24h hour for shift start (e.g. 22 = 10 PM Central) */
  startHour: number;
  startMinute: number;
  endHour: number;
  endMinute: number;
  finalHour: number;   // e.g. 5 = 5 AM Central
  finalMinute: number;
  timeZone: string;
}

export const DEFAULT_SHIFT_SETTINGS: ShiftSettings = {
  startHour: 22, startMinute: 0,
  endHour: 6,   endMinute: 0,
  finalHour: 5, finalMinute: 0,
  timeZone: "America/Chicago",
};

export const shiftSettingsStore = createPersistedStore<ShiftSettings>(
  "aih:settings:shift:v1",
  DEFAULT_SHIFT_SETTINGS,
);

export function useShiftSettings(): ShiftSettings {
  return useStoreValue(shiftSettingsStore, DEFAULT_SHIFT_SETTINGS);
}

export function fmtHour(h: number, m: number) {
  const period = h >= 12 ? "PM" : "AM";
  const display = ((h + 11) % 12) + 1;
  const mm = String(m).padStart(2, "0");
  return `${display}:${mm} ${period}`;
}