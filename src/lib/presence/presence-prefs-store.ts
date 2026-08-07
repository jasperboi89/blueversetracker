import { createPersistedStore, useStoreValue } from "@/lib/settings/_persist";

export type CheckInFrequency = "off" | "relaxed" | "normal" | "attentive";

export interface PresencePrefs {
  /** Master switch for the holographic avatar. */
  enabled: boolean;
  /** Speak messages out loud. */
  voice: boolean;
  /** How often the avatar checks in during an active shift. */
  checkIn: CheckInFrequency;
  /** Avatar size in px (video square edge). */
  size: number;
  /** Idle opacity 0.2–1. */
  opacity: number;
}

export const DEFAULT_PRESENCE_PREFS: PresencePrefs = {
  enabled: true,
  voice: false,
  checkIn: "relaxed",
  size: 132,
  opacity: 0.75,
};

export const presencePrefsStore = createPersistedStore<PresencePrefs>(
  "aih:settings:presence:v1",
  DEFAULT_PRESENCE_PREFS,
);

export function usePresencePrefs(): PresencePrefs {
  return useStoreValue(presencePrefsStore, DEFAULT_PRESENCE_PREFS);
}

/** Minutes between check-ins for each frequency (0 = off). */
export const CHECK_IN_MINUTES: Record<CheckInFrequency, number> = {
  off: 0,
  relaxed: 45,
  normal: 25,
  attentive: 12,
};