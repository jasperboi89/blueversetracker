import { useEffect, useRef } from "react";
import { useServerFn } from "@tanstack/react-start";
import { getTuning, setTuning } from "@/lib/quantum-bloom/tuning.functions";
import { qbTuningStore, useQbTuning } from "@/lib/settings/qb-tuning-store";

/** Pull tuning prefs on mount, push debounced on local change. */
export function useTuningSync() {
  const get = useServerFn(getTuning);
  const set = useServerFn(setTuning);
  const state = useQbTuning();
  const hydrated = useRef(false);
  const lastPushed = useRef<string>("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await get();
        if (cancelled) return;
        qbTuningStore.update((c) => ({ ...c, ...r }));
      } catch {
        /* offline */
      } finally {
        hydrated.current = true;
      }
    })();
    return () => { cancelled = true; };
  }, [get]);

  useEffect(() => {
    if (!hydrated.current) return;
    const payload = JSON.stringify(state);
    if (payload === lastPushed.current) return;
    lastPushed.current = payload;
    const t = setTimeout(() => {
      set({ data: state }).catch(() => {});
    }, 500);
    return () => clearTimeout(t);
  }, [set, state]);
}
