/**
 * Activation 3 — ONE definition of "what does a Night Plan item look like right
 * now" shared by the completion plan producer and the execution provider.
 *
 * The engine's TOCTOU check compares the plan's pre-state fingerprint with the
 * provider's live read. If the two sides computed that summary differently,
 * every completion would look like a conflict (or worse, a real change could
 * slip through unnoticed). Keeping the shape in one place makes that class of
 * bug impossible.
 */

import { nightPlanStore } from "@/lib/night-plan-store";
import { fingerprint } from "./fingerprint";
import type { ExecTargetState } from "./execution-contract";

export interface NightPlanItemSummary extends Record<string, string | number | boolean | null> {
  itemId: string;
  status: string;
  completed: boolean;
}

export function nightPlanItemSummary(itemId: string): NightPlanItemSummary | null {
  const item = nightPlanStore.get().items.find((i) => i.id === itemId);
  if (!item) return null;
  return { itemId: item.id, status: item.status, completed: item.status === "done" };
}

/** `null` means "the item is not there", which the engine treats as unreadable. */
export function nightPlanItemState(itemId: string): ExecTargetState | null {
  const summary = nightPlanItemSummary(itemId);
  if (!summary) return null;
  return {
    fingerprint: fingerprint(summary),
    observedAt: new Date().toISOString(),
    summary,
  };
}
