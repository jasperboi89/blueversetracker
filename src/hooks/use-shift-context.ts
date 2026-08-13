import { useShiftWorkingContext, getShiftSummary, type ShiftSummary, type ShiftWorkingContext } from "@/lib/core/shift-context";
import { useNow } from "@/hooks/use-now";

export interface ShiftContextView extends ShiftWorkingContext {
  shiftSummary: ShiftSummary;
}

/**
 * Read the live Shift Working Context. The summary is derived on read and
 * refreshed on a slow tick so counts stay honest without extra subscriptions.
 */
export function useShiftContext(): ShiftContextView {
  const ctx = useShiftWorkingContext();
  useNow(30_000);
  return { ...ctx, shiftSummary: getShiftSummary() };
}