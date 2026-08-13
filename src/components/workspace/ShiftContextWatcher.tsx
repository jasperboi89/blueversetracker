import { useEffect } from "react";
import { startShiftContext } from "@/lib/core/shift-context";
import { startAwareness } from "@/lib/core/awareness-store";
import { startAccountContextInvalidation } from "@/lib/core/account-context-service";
import { startBlockerReconciler } from "@/lib/core/blocker-reconciler";

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
    const stopBlockers = startBlockerReconciler();
    return () => {
      stopBlockers();
      stopContextCache();
      stopAwareness();
      stopCtx();
    };
  }, []);
  return null;
}