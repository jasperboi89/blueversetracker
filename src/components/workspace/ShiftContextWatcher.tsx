import { useEffect } from "react";
import { startShiftContext } from "@/lib/core/shift-context";
import { startAwareness } from "@/lib/core/awareness-store";
import { startAccountContextInvalidation } from "@/lib/core/account-context-service";

/**
 * Headless: subscribes the Shift Working Context reducer to the Event Spine
 * — and the deterministic Awareness engine on top of it — for the life of the
 * authenticated shell. Renders nothing.
 */
export function ShiftContextWatcher() {
  useEffect(() => {
    const stopCtx = startShiftContext();
    const stopAwareness = startAwareness();
    const stopContextCache = startAccountContextInvalidation();
    return () => {
      stopContextCache();
      stopAwareness();
      stopCtx();
    };
  }, []);
  return null;
}