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
  tone: AITone;
  length: AILength;
  technicalLevel: AIDetailLevel;
  smartDetailOverride: boolean;
  customInstructions: string;
}

export const DEFAULT_AI_SETTINGS: AISettings = {
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