import { useEffect, useState } from "react";
import { createPersistedStore, useStoreValue } from "./_persist";

export type ShiftProgressDisplay = "ring" | "bar" | "both";
export type MotionPref = "full" | "reduced";
export type SidebarDefault = "expanded" | "collapsed";

export interface DisplayPrefs {
  shiftProgress: ShiftProgressDisplay;
  freshdeskShowDueTimes: boolean;
  freshdeskShowPriority: boolean;
  sidebar: SidebarDefault;
  motion: MotionPref;
  /** When true, proactive insight toasts stay silent (Copilot dot still pulses). */
  quietInsights: boolean;
}

export const DEFAULT_DISPLAY_PREFS: DisplayPrefs = {
  shiftProgress: "both",
  freshdeskShowDueTimes: true,
  freshdeskShowPriority: true,
  sidebar: "expanded",
  motion: "full",
  quietInsights: false,
};

export const displayPrefsStore = createPersistedStore<DisplayPrefs>(
  "aih:settings:display:v1",
  DEFAULT_DISPLAY_PREFS,
);

export function useDisplayPrefs(): DisplayPrefs {
  return useStoreValue(displayPrefsStore, DEFAULT_DISPLAY_PREFS);
}

/**
 * OS accessibility setting wins toward reduced: if the operating system asks
 * for reduced motion, the app honors it regardless of the in-app preference.
 */
export function useEffectiveMotion(): MotionPref {
  const prefs = useDisplayPrefs();
  const [osReduced, setOsReduced] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setOsReduced(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setOsReduced(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return osReduced || prefs.motion === "reduced" ? "reduced" : "full";
}

/** Apply motion + sidebar root attrs so CSS can react. Mount once at app root. */
export function useApplyDisplayPrefs() {
  const prefs = useDisplayPrefs();
  const motion = useEffectiveMotion();
  useEffect(() => {
    if (typeof document === "undefined") return;
    document.documentElement.dataset.motion = motion;
    document.documentElement.dataset.sidebar = prefs.sidebar;
  }, [motion, prefs.sidebar]);
}
