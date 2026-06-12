import { useMemo } from "react";
import type { Discovery } from "@/hooks/use-discoveries";

const COLOR: Record<string, string> = {
  ticket: "var(--cyan-glow)",
  dispatch: "var(--electric)",
  night_plan: "var(--violet-glow)",
  shift: "var(--gold-glow)",
  cosmic: "var(--pink-glow)",
};

function hashId(id: string): { x: number; y: number } {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  const x = ((h & 0xffff) / 0xffff) * 0.9 + 0.05;
  const y = (((h >>> 16) & 0xffff) / 0xffff) * 0.9 + 0.05;
  return { x, y };
}

interface Star extends Discovery {
  x: number;
  y: number;
  dayKey: string;
}

export function ConstellationField({ rows }: { rows: Discovery[] }) {
  const stars = useMemo<Star[]>(() => {
    return rows.map((r) => {
      const p = hashId(r.id);
      const dayKey = new Date(r.createdAt).toISOString().slice(0, 10);
      return { ...r, x: p.x, y: p.y, dayKey };
    });
  }, [rows]);

  const lines = useMemo(() => {
    const byDay = new Map<string, Star[]>();
    stars.forEach((s) => {
      const list = byDay.get(s.dayKey) ?? [];
      list.push(s);
      byDay.set(s.dayKey, list);
    });
    const out: { x1: number; y1: number; x2: number; y2: number }[] = [];
    byDay.forEach((list) => {
      const slice = list.slice(0, 50);
      for (let i = 1; i < slice.length; i++) {
        out.push({ x1: slice[i - 1].x, y1: slice[i - 1].y, x2: slice[i].x, y2: slice[i].y });
      }
    });
    return out;
  }, [stars]);

  if (stars.length === 0) {
    return (
      <div className="grid h-[400px] place-items-center rounded-lg border border-border/30 text-sm text-muted-foreground">
        Your sky is empty. Complete work in Quantum Bloom to seed your constellations.
      </div>
    );
  }

  return (
    <div className="relative h-[480px] w-full overflow-hidden rounded-lg border border-border/30 bg-[oklch(0.06_0.04_270)]">
      <svg viewBox="0 0 1 1" preserveAspectRatio="none" className="absolute inset-0 h-full w-full">
        {lines.map((l, i) => (
          <line
            key={i}
            x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2}
            stroke="oklch(0.7 0.18 250 / 0.18)"
            strokeWidth={0.0015}
          />
        ))}
      </svg>
      {stars.map((s) => (
        <div
          key={s.id}
          className="group absolute"
          style={{ left: `${s.x * 100}%`, top: `${s.y * 100}%`, transform: "translate(-50%, -50%)" }}
        >
          <span
            className="block h-2 w-2 rounded-full"
            style={{
              background: COLOR[s.kind] ?? "white",
              boxShadow: `0 0 8px ${COLOR[s.kind] ?? "white"}`,
            }}
          />
          <div className="pointer-events-none absolute left-3 top-3 z-10 hidden whitespace-nowrap rounded-md border border-border/40 bg-background/90 px-2 py-1 text-[10px] text-foreground backdrop-blur group-hover:block">
            <div className="font-medium">{s.label}</div>
            <div className="text-muted-foreground">
              {new Date(s.createdAt).toLocaleString(undefined, {
                month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
              })}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
