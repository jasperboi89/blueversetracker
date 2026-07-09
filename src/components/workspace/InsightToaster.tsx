import { useEffect, useRef } from "react";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { useInsights, type Insight } from "@/lib/ai/awareness";
import { useDisplayPrefs } from "@/lib/settings/display-prefs-store";

/**
 * Mounts once inside the authenticated shell. Watches the deterministic
 * `useInsights()` layer; when a new high/warn insight appears, fires a
 * sonner toast with a jump action. Re-fires only after the insight clears
 * and comes back. Quiet mode silences toasts but the Copilot dot still pulses.
 */
export function InsightToaster() {
  const insights = useInsights();
  const prefs = useDisplayPrefs();
  const navigate = useNavigate();
  const firedRef = useRef<Set<string>>(new Set());
  const lastAtRef = useRef<Record<string, number>>({});

  useEffect(() => {
    if (prefs.quietInsights) return;
    const now = Date.now();
    const currentIds = new Set(insights.map((i) => i.id));

    // Clear memory for insights that have gone away so they can re-fire later.
    for (const id of Array.from(firedRef.current)) {
      if (!currentIds.has(id)) firedRef.current.delete(id);
    }

    for (const ins of insights) {
      if (ins.severity === "info") continue;
      if (firedRef.current.has(ins.id)) continue;
      const last = lastAtRef.current[ins.severity] ?? 0;
      if (now - last < 20_000) continue; // per-severity debounce

      firedRef.current.add(ins.id);
      lastAtRef.current[ins.severity] = now;
      fireToast(ins, () => {
        if (!ins.to) return;
        navigate({ to: ins.to as never, params: (ins.params ?? {}) as never });
      });
    }
  }, [insights, prefs.quietInsights, navigate]);

  return null;
}

function fireToast(ins: Insight, onOpen: () => void) {
  const opts = {
    id: `insight-${ins.id}`,
    description: ins.to ? "Tap Open to jump there." : undefined,
    action: ins.to
      ? { label: "Open", onClick: onOpen }
      : undefined,
    duration: ins.severity === "high" ? 9000 : 6500,
  };
  if (ins.severity === "high") toast.error(ins.text, opts);
  else toast.warning(ins.text, opts);
}