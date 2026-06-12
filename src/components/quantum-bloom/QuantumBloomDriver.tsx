import { useEffect } from "react";
import { getActivePhase } from "./phases";

/**
 * Writes the current Aurora phase colors to CSS custom properties on :root
 * so the rest of the UI can react via var(--qb-phase-*).
 * Updates every minute (phase boundaries are hourly; one-minute granularity
 * is plenty for gradient transitions handled by CSS transition).
 */
export function QuantumBloomDriver() {
  useEffect(() => {
    function apply() {
      const p = getActivePhase(new Date());
      const root = document.documentElement;
      root.style.setProperty("--qb-phase-primary", p.primary);
      root.style.setProperty("--qb-phase-secondary", p.secondary);
      root.style.setProperty("--qb-phase-accent", p.accent);
      root.dataset.qbPhase = String(p.hour);
    }
    apply();
    const id = setInterval(apply, 60_000);
    return () => clearInterval(id);
  }, []);
  return null;
}