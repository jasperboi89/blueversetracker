import type { Discovery } from "@/hooks/use-discoveries";
import { getActivePhase } from "@/components/quantum-bloom/phases";

export type AdaptationLevel = "Dormant" | "Aware" | "Attuned" | "Resonant";

export interface CoreReadout {
  total: number;
  level: AdaptationLevel;
  favoritePhase: string | null;
  mostActiveHour: number | null;
  preferredWorkspace: string | null;
  perKind: Record<Discovery["kind"], number>;
}

const KIND_LABEL: Record<Discovery["kind"], string> = {
  ticket: "Tickets",
  dispatch: "Dispatch testing",
  night_plan: "Night Plan",
  shift: "Shift",
  // @ts-expect-error cosmic added later via migration
  cosmic: "Cosmic Weather",
};

function hourCentral(d: Date): number {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    hour12: false,
    hour: "2-digit",
  });
  return Number(fmt.format(d)) % 24;
}

export function deriveCore(rows: Discovery[]): CoreReadout {
  const total = rows.length;
  const level: AdaptationLevel =
    total >= 150 ? "Resonant" : total >= 50 ? "Attuned" : total >= 10 ? "Aware" : "Dormant";

  const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const recent = rows.filter((r) => new Date(r.createdAt).getTime() >= cutoff);

  const hours = new Map<number, number>();
  const phases = new Map<string, number>();
  const kinds = new Map<string, number>();
  recent.forEach((r) => {
    const d = new Date(r.createdAt);
    const h = hourCentral(d);
    hours.set(h, (hours.get(h) ?? 0) + 1);
    const phase = getActivePhase(d).label;
    phases.set(phase, (phases.get(phase) ?? 0) + 1);
    kinds.set(r.kind, (kinds.get(r.kind) ?? 0) + 1);
  });

  const top = <T,>(m: Map<T, number>): T | null => {
    let best: T | null = null;
    let count = -1;
    m.forEach((v, k) => {
      if (v > count) { best = k; count = v; }
    });
    return best;
  };

  const perKind: Record<Discovery["kind"], number> = {
    ticket: 0, dispatch: 0, night_plan: 0, shift: 0,
    // @ts-expect-error cosmic
    cosmic: 0,
  };
  rows.forEach((r) => { (perKind as Record<string, number>)[r.kind] = (perKind as Record<string, number>)[r.kind] + 1 || 1; });

  const topKind = top(kinds);

  return {
    total,
    level,
    favoritePhase: top(phases),
    mostActiveHour: top(hours),
    preferredWorkspace: topKind ? (KIND_LABEL[topKind as Discovery["kind"]] ?? topKind) : null,
    perKind,
  };
}

export function formatHour(h: number): string {
  const period = h >= 12 ? "PM" : "AM";
  const hh = h % 12 === 0 ? 12 : h % 12;
  return `${hh} ${period} Central`;
}
