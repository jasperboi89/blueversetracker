import { useEffect } from "react";
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
}

export const DEFAULT_DISPLAY_PREFS: DisplayPrefs = {
  shiftProgress: "both",
  freshdeskShowDueTimes: true,
  freshdeskShowPriority: true,
  sidebar: "expanded",
  motion: "full",
};

export const displayPrefsStore = createPersistedStore<DisplayPrefs>(
  "aih:settings:display:v1",
  DEFAULT_DISPLAY_PREFS,
);

export function useDisplayPrefs(): DisplayPrefs {
  return useStoreValue(displayPrefsStore, DEFAULT_DISPLAY_PREFS);
}

/** Apply motion + sidebar root attrs so CSS can react. Mount once at app root. */
export function useApplyDisplayPrefs() {
  const prefs = useDisplayPrefs();
  useEffect(() => {
    if (typeof document === "undefined") return;
    document.documentElement.dataset.motion = prefs.motion;
    document.documentElement.dataset.sidebar = prefs.sidebar;
  }, [prefs.motion, prefs.sidebar]);
}