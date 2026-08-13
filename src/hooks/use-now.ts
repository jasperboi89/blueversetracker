import { useEffect, useState } from "react";

// SSR-safe: start from a fixed epoch so server and first client render match,
// then swap to real time after mount to avoid hydration mismatches.
const SSR_EPOCH = new Date(0);

/**
 * One shared interval per period. During a long shift several components ask
 * for the same cadence (three separate 1s tickers used to run concurrently);
 * sharing the timer keeps their re-renders aligned and cheap.
 */
type Clock = { id: ReturnType<typeof setInterval>; subs: Set<(d: Date) => void> };
const clocks = new Map<number, Clock>();

function subscribe(intervalMs: number, fn: (d: Date) => void): () => void {
  let clock = clocks.get(intervalMs);
  if (!clock) {
    const subs = new Set<(d: Date) => void>();
    const id = setInterval(() => {
      const d = new Date();
      for (const s of subs) s(d);
    }, intervalMs);
    clock = { id, subs };
    clocks.set(intervalMs, clock);
  }
  clock.subs.add(fn);
  return () => {
    const c = clocks.get(intervalMs);
    if (!c) return;
    c.subs.delete(fn);
    if (c.subs.size === 0) {
      clearInterval(c.id);
      clocks.delete(intervalMs);
    }
  };
}

export function useNow(intervalMs = 1000) {
  const [now, setNow] = useState<Date>(SSR_EPOCH);
  useEffect(() => {
    setNow(new Date());
    return subscribe(intervalMs, setNow);
  }, [intervalMs]);
  return now;
}