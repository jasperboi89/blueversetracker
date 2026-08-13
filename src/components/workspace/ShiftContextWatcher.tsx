import { useEffect } from "react";
import { startShiftContext } from "@/lib/core/shift-context";

/**
 * Headless: subscribes the Shift Working Context reducer to the Event Spine
 * for the life of the authenticated shell. Renders nothing.
 */
export function ShiftContextWatcher() {
  useEffect(() => startShiftContext(), []);
  return null;
}