export const INACTIVITY_WARN_MS = 28 * 60 * 1000; // 28 min
export const INACTIVITY_LOGOUT_MS = 30 * 60 * 1000; // 30 min
export const INACTIVITY_ACTIVITY_EVENTS = [
  "mousemove",
  "keydown",
  "click",
  "touchstart",
  "scroll",
] as const;