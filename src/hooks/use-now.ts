import { useEffect, useState } from "react";

// SSR-safe: start from a fixed epoch so server and first client render match,
// then swap to real time after mount to avoid hydration mismatches.
const SSR_EPOCH = new Date(0);

export function useNow(intervalMs = 1000) {
  const [now, setNow] = useState<Date>(SSR_EPOCH);
  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}