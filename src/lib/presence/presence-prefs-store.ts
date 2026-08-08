import { createPersistedStore, useStoreValue } from "@/lib/settings/_persist";

export type CheckInFrequency = "off" | "relaxed" | "normal" | "attentive";
export type PresenceCorner = "br" | "bl" | "tr" | "tl";
export type VoiceMode = "device" | "ai";

export interface PresencePrefs {
  /** Master switch for the holographic avatar. */
  enabled: boolean;
  /** Collapse Clara to a small pill; alerts still arrive. */
  hidden: boolean;
  /** Speak messages out loud. */
  voice: boolean;
  /** Device speech synthesis or higher-quality AI voices. */
  voiceMode: VoiceMode;
  /** Selected device voice (speechSynthesis voiceURI). */
  deviceVoiceUri: string;
  /** Selected AI gateway voice id. */
  aiVoice: string;
  /** Speaking rate 0.6–1.4. */
  rate: number;
  /** Pitch 0.6–1.6 (device voices only). */
  pitch: number;
  /** Screen corner she docks to. */
  corner: PresenceCorner;
  /** How often the avatar checks in during an active shift. */
  checkIn: CheckInFrequency;
  /** Avatar size in px (video square edge). */
  size: number;
  /** Idle opacity 0.2–1. */
  opacity: number;
}

export const DEFAULT_PRESENCE_PREFS: PresencePrefs = {
  enabled: true,
  hidden: false,
  voice: false,
  voiceMode: "device",
  deviceVoiceUri: "",
  aiVoice: "shimmer",
  rate: 1.02,
  pitch: 1.05,
  corner: "br",
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