import { getCentralNow } from "@/lib/shift";

/** Aurora color phase. Three oklch colors used by both CSS and the WebGL shader. */
export interface AuroraPhase {
  /** Hour 0-23 in Central time the phase belongs to. */
  hour: number;
  /** Human label. */
  label: string;
  /** Dominant nebula color (oklch). */
  primary: string;
  /** Secondary swirl color (oklch). */
  secondary: string;
  /** Spectral accent / rim color (oklch). */
  accent: string;
}

// Anchored to the spec. Each entry covers from `hour` until the next entry.
const PHASES: AuroraPhase[] = [
  { hour: 22, label: "10 PM · Ignition",   primary: "oklch(0.78 0.18 220)", secondary: "oklch(0.7 0.22 250)",  accent: "oklch(0.85 0.16 210)" },
  { hour: 23, label: "11 PM · Blue→Violet", primary: "oklch(0.7 0.22 250)",  secondary: "oklch(0.7 0.22 285)",  accent: "oklch(0.78 0.2 240)"  },
  { hour: 0,  label: "12 AM · Deep Violet", primary: "oklch(0.55 0.2 290)",  secondary: "oklch(0.5 0.22 300)",  accent: "oklch(0.7 0.22 295)"  },
  { hour: 1,  label: "1 AM · Violet+Magenta", primary: "oklch(0.6 0.22 320)", secondary: "oklch(0.65 0.22 350)", accent: "oklch(0.8 0.16 350)" },
  { hour: 2,  label: "2 AM · Indigo",       primary: "oklch(0.45 0.18 275)", secondary: "oklch(0.55 0.2 265)",  accent: "oklch(0.7 0.18 270)"  },
  { hour: 3,  label: "3 AM · Royal + Gold", primary: "oklch(0.5 0.2 270)",   secondary: "oklch(0.65 0.2 255)",  accent: "oklch(0.85 0.16 85)"  },
  { hour: 4,  label: "4 AM · Indigo→Blue",  primary: "oklch(0.5 0.18 265)",  secondary: "oklch(0.65 0.2 240)",  accent: "oklch(0.8 0.18 225)"  },
  { hour: 5,  label: "5 AM · Cyan Return",  primary: "oklch(0.7 0.18 215)",  secondary: "oklch(0.78 0.16 205)", accent: "oklch(0.85 0.16 195)" },
  { hour: 6,  label: "6 AM · Completion",   primary: "oklch(0.78 0.12 200)", secondary: "oklch(0.82 0.1 180)",  accent: "oklch(0.9 0.08 190)"  },
];

// Daytime resting palette (between 7 AM and 9 PM). Muted, low-saturation.
const DAY_PHASE: AuroraPhase = {
  hour: -1,
  label: "Resting",
  primary: "oklch(0.35 0.06 270)",
  secondary: "oklch(0.3 0.06 260)",
  accent: "oklch(0.55 0.08 240)",
};

export function getActivePhase(now: Date = new Date()): AuroraPhase {
  const { hour } = getCentralNow.call(null) as unknown as { hour: number };
  // getCentralNow ignores its arg and reads "now". Build a fresh read instead:
  const h = getHourCentral(now);
  if (h >= 7 && h < 22) return DAY_PHASE;
  // Find best matching phase.
  // Sort by hour but handle wrap: 22, 23, 0, 1, 2, 3, 4, 5, 6
  const order = [22, 23, 0, 1, 2, 3, 4, 5, 6];
  const idx = order.lastIndexOf(h);
  if (idx >= 0) return PHASES[idx];
  // Fallback to closest earlier hour in the night cycle.
  return PHASES[0];
}

export function isShiftActive(now: Date = new Date()): boolean {
  const h = getHourCentral(now);
  return h >= 22 || h < 7;
}

function getHourCentral(d: Date): number {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    hour12: false,
    hour: "2-digit",
  });
  return Number(fmt.format(d)) % 24;
}