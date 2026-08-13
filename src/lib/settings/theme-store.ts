import { useEffect } from "react";
import { createPersistedStore, useStoreValue } from "./_persist";

export type ThemeName = "blueverse" | "quantum-bloom" | "holoquiet";

export const THEME_NAMES: readonly ThemeName[] = ["blueverse", "quantum-bloom", "holoquiet"];

export interface ThemeState {
  theme: ThemeName;
  /** Whether the long Quantum Bloom first-entry sequence has played at least once for this user. */
  qbFirstEntryCompleted: boolean;
}

const DEFAULT: ThemeState = { theme: "blueverse", qbFirstEntryCompleted: false };

export const themeStore = createPersistedStore<ThemeState>(
  "aih:settings:theme:v1",
  DEFAULT,
);

export function useTheme(): ThemeName {
  return useStoreValue(themeStore, DEFAULT).theme;
}

export function useThemeState(): ThemeState {
  return useStoreValue(themeStore, DEFAULT);
}

export function setTheme(theme: ThemeName) {
  themeStore.update((c) => ({ ...c, theme }));
}

export function markQbFirstEntryCompleted() {
  themeStore.update((c) => ({ ...c, qbFirstEntryCompleted: true }));
}

/** Mirror the active theme to <html data-theme=...>. Mount once at app root. */
export function useApplyTheme() {
  const theme = useTheme();
  useEffect(() => {
    if (typeof document === "undefined") return;
    document.documentElement.dataset.theme = theme;
  }, [theme]);
}