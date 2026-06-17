import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  listDiscoveries,
  resetDiscoveries,
} from "@/lib/quantum-bloom/discoveries.functions";
import { subscribeCelebrations } from "@/lib/quantum-bloom/celebration-bus";

export interface Discovery {
  id: string;
  kind: "ticket" | "dispatch" | "night_plan" | "shift" | "cosmic";
  label: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  context: Record<string, any>;
  createdAt: string;
}

export function useDiscoveries(active: boolean) {
  const list = useServerFn(listDiscoveries);
  const reset = useServerFn(resetDiscoveries);
  const [rows, setRows] = useState<Discovery[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const r = await list();
      setRows(r as Discovery[]);
    } catch (err) {
      console.warn("[useDiscoveries] failed to load discoveries", err);
    } finally {
      setLoading(false);
    }
  }, [list]);

  useEffect(() => {
    if (!active) return;
    void refresh();
    // Refresh shortly after any celebration fires (insert has happened or will soon).
    const unsub = subscribeCelebrations(() => {
      setTimeout(() => { void refresh(); }, 600);
    });
    return () => { unsub(); };
  }, [active, refresh]);

  const clearAll = useCallback(async () => {
    await reset();
    setRows([]);
  }, [reset]);

  return { rows, loading, refresh, clearAll };
}
