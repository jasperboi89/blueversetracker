import { getCentralHM } from "@/lib/shift";
import { useNow } from "@/hooks/use-now";

/**
 * HoloQuiet Plane 1 — Architecture.
 *
 * A static, extremely low-contrast future-office environment: overhead light,
 * faint glass partitions, one floor line, and a distant horizon glow. No
 * particles, no parallax, no animation. The only variation is an almost
 * imperceptible horizon tint that follows the existing shift clock.
 */

/** Horizon tint by Central hour — reuses the app's existing shift time source. */
export function horizonTint(hour: number): string {
  if (hour >= 22 || hour < 1) return "oklch(0.55 0.05 245)"; // early shift · cool office
  if (hour >= 1 && hour < 2) return "oklch(0.48 0.06 262)"; // midnight cobalt
  if (hour >= 2 && hour < 4) return "oklch(0.4 0.03 258)"; // darkest, calmest
  if (hour >= 4 && hour < 7) return "oklch(0.68 0.03 235)"; // faint silver-blue horizon
  return "oklch(0.5 0.04 250)";
}

export function HoloQuietBackground() {
  // Slow tick: the tint only needs to be right, never smooth.
  useNow(10 * 60_000);
  const { hour } = getCentralHM();
  return (
    <div
      aria-hidden
      className="hq-architecture"
      style={{ ["--hq-horizon" as string]: horizonTint(hour) }}
    />
  );
}
