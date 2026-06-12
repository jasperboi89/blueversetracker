import { useMemo } from "react";
import type { Discovery } from "@/hooks/use-discoveries";

const KIND_COLOR: Record<string, string> = {
  ticket: "var(--cyan-glow)",
  dispatch: "var(--electric)",
  night_plan: "var(--violet-glow)",
  shift: "var(--gold-glow)",
  cosmic: "var(--pink-glow)",
};

const KIND_LABEL: Record<string, string> = {
  ticket: "Tickets",
  dispatch: "Dispatch",
  night_plan: "Night Plan",
  shift: "Shifts",
  cosmic: "Cosmic",
};

export function ArchiveTimeline({ rows }: { rows: Discovery[] }) {
  const { days, max, totals } = useMemo(() => {
    const map = new Map<string, number>();
    const totals: Record<string, number> = {};
    rows.forEach((r) => {
      const day = new Date(r.createdAt).toISOString().slice(0, 10);
      map.set(day, (map.get(day) ?? 0) + 1);
      totals[r.kind] = (totals[r.kind] ?? 0) + 1;
    });
    const days: { day: string; count: number; label: string }[] = [];
    for (let i = 59; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      days.push({
        day: key,
        count: map.get(key) ?? 0,
        label: d.toLocaleDateString(undefined, { month: "short", day: "numeric" }),
      });
    }
    const max = Math.max(1, ...days.map((d) => d.count));
    return { days, max, totals };
  }, [rows]);

  return (
    <div className="space-y-6">
      <section>
        <h3 className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Last 60 days
        </h3>
        <div className="flex items-end gap-1 rounded-lg border border-border/30 p-3" style={{ height: 160 }}>
          {days.map((d) => (
            <div
              key={d.day}
              className="flex-1 rounded-sm transition hover:opacity-80"
              title={`${d.label}: ${d.count}`}
              style={{
                height: `${(d.count / max) * 100}%`,
                minHeight: d.count > 0 ? 4 : 2,
                background: d.count > 0
                  ? "linear-gradient(180deg, var(--qb-phase-accent, var(--cyan-glow)), var(--qb-phase-primary, var(--electric)))"
                  : "oklch(0.3 0.04 270 / 0.5)",
              }}
            />
          ))}
        </div>
      </section>

      <section>
        <h3 className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
          All-time totals
        </h3>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          {Object.keys(KIND_LABEL).map((k) => (
            <div key={k} className="rounded-md border border-border/30 p-3">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground" style={{ color: KIND_COLOR[k] }}>
                {KIND_LABEL[k]}
              </div>
              <div className="mt-1 text-xl font-semibold text-foreground">{totals[k] ?? 0}</div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
