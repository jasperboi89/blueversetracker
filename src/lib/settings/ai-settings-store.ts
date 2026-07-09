import { createPersistedStore, useStoreValue } from "./_persist";

export type AITone =
  | "professional-casual"
  | "short-direct"
  | "detailed"
  | "programming-focused"
  | "customer-service-friendly";
export type AILength = "short" | "standard" | "detailed";
export type AIDetailLevel = "low" | "medium" | "high";

export interface AISettings {
  /** Admin kill-switch: when false, every AI surface is hidden/disabled. */
  enabled: boolean;
  tone: AITone;
  length: AILength;
  technicalLevel: AIDetailLevel;
  smartDetailOverride: boolean;
  customInstructions: string;
}

export const DEFAULT_AI_SETTINGS: AISettings = {
  enabled: true,
  tone: "professional-casual",
  length: "standard",
  technicalLevel: "medium",
  smartDetailOverride: true,
  customInstructions: "",
};

export const aiSettingsStore = createPersistedStore<AISettings>(
  "aih:settings:ai:v1",
  DEFAULT_AI_SETTINGS,
);

export function useAISettings(): AISettings {
  return useStoreValue(aiSettingsStore, DEFAULT_AI_SETTINGS);
}

/** Compact style hint appended to AI system prompts from the user's preferences. */
export function aiStyleHint(s: AISettings): string {
  const parts = [
    `Tone: ${s.tone.replace(/-/g, " ")}.`,
    `Length: ${s.length}.`,
    `Technical level: ${s.technicalLevel}.`,
  ];
  if (s.customInstructions.trim()) parts.push(`Extra instructions: ${s.customInstructions.trim()}`);
  return parts.join(" ");
}

export function setAIEnabled(enabled: boolean) {
  aiSettingsStore.update((c) => ({ ...c, enabled }));
}

export const TONE_LABEL: Record<AITone, string> = {
  "professional-casual": "Professional Casual",
  "short-direct": "Short and Direct",
  detailed: "More Detailed",
  "programming-focused": "Programming-Focused",
  "customer-service-friendly": "Customer-Service-Friendly",
};
export const LENGTH_LABEL: Record<AILength, string> = {
  short: "Short",
  standard: "Standard",
  detailed: "Detailed",
};
export const DETAIL_LABEL: Record<AIDetailLevel, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
};
