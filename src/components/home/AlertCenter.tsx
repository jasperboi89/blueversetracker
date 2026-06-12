import { useMemo, useState } from "react";
import { AlertTriangle, Bell, Info, X } from "lucide-react";
import { mockAlerts, type AlertPriority, type MockAlert } from "@/lib/mock/alerts";
import { formatCentralShort } from "@/lib/shift";
import { Button } from "@/components/ui/button";

const order: AlertPriority[] = ["critical", "warning", "info"];
const styles: Record<AlertPriority, { color: string; bg: string; icon: typeof AlertTriangle }> = {
  critical: {
    color: "oklch(0.72 0.22 25)",
    bg: "linear-gradient(135deg, oklch(0.72 0.22 25 / 0.18), oklch(0.8 0.16 350 / 0.12))",
    icon: AlertTriangle,
  },
  warning: {
    color: "var(--gold-glow)",
    bg: "linear-gradient(135deg, oklch(0.85 0.16 85 / 0.18), oklch(0.85 0.16 210 / 0.12))",
    icon: Bell,
  },
  info: {
    color: "var(--cyan-glow)",
    bg: "linear-gradient(135deg, oklch(0.85 0.16 210 / 0.18), oklch(0.7 0.22 250 / 0.12))",
    icon: Info,
  },
};

export function AlertCenter() {
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [showDismissed, setShowDismissed] = useState(false);

  const visible = useMemo(
    () =>
      mockAlerts
        .filter((a) => !dismissed.has(a.id))
        .sort(
          (a, b) =>
            order.indexOf(a.priority) - order.indexOf(b.priority) ||
            b.updatedAt.getTime() - a.updatedAt.getTime(),
        ),
    [dismissed],
  );

  if (visible.length === 0 && dismissed.size === 0) return null;

  const highest = visible[0]?.priority ?? "info";
  const borderColor = styles[highest].color;

  if (visible.length === 0) {
    return (
      <div className="glass-panel p-4 text-center text-sm text-muted-foreground">
        All alerts dismissed for this shift.{" "}
        <button
          className="ml-2 text-cyan-glow underline-offset-2 hover:underline"
          style={{ color: "var(--cyan-glow)" }}
          onClick={() => setDismissed(new Set())}
        >
          View dismissed alerts
        </button>
      </div>
    );
  }

  return (
    <div
      className="relative rounded-[var(--radius)] p-[1.5px]"
      style={{
        background: `linear-gradient(110deg, ${borderColor}, var(--violet-glow), ${borderColor})`,
        backgroundSize: "200% 100%",
        animation: "border-flow 6s linear infinite",
      }}
    >
      <div className="glass-panel p-4 sm:p-5">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div
              className="grid h-9 w-9 place-items-center rounded-xl"
              style={{
                background: styles[highest].bg,
                boxShadow: `0 0 18px ${styles[highest].color}`,
              }}
            >
              <AlertTriangle className="h-4 w-4" style={{ color: styles[highest].color }} />
            </div>
            <div>
              <div className="text-sm font-semibold text-foreground">Alert Center</div>
              <div className="text-xs text-muted-foreground">
                {visible.length} active alert{visible.length === 1 ? "" : "s"}
              </div>
            </div>
          </div>
          {dismissed.size > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowDismissed((s) => !s)}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              View Dismissed ({dismissed.size})
            </Button>
          )}
        </div>

        <div className="grid gap-2">
          {visible.map((a) => (
            <AlertRow key={a.id} alert={a} onDismiss={() => setDismissed((s) => new Set(s).add(a.id))} />
          ))}
          {showDismissed &&
            mockAlerts
              .filter((a) => dismissed.has(a.id))
              .map((a) => (
                <div key={a.id} className="rounded-lg border border-border/40 p-3 text-xs opacity-60">
                  <div className="font-medium text-foreground">{a.title}</div>
                  <button
                    className="mt-1 text-cyan-glow underline-offset-2 hover:underline"
                    style={{ color: "var(--cyan-glow)" }}
                    onClick={() => {
                      const next = new Set(dismissed);
                      next.delete(a.id);
                      setDismissed(next);
                    }}
                  >
                    Restore
                  </button>
                </div>
              ))}
        </div>
      </div>
    </div>
  );
}

function AlertRow({ alert, onDismiss }: { alert: MockAlert; onDismiss: () => void }) {
  const s = styles[alert.priority];
  const Icon = s.icon;
  return (
    <div
      className="flex items-start gap-3 rounded-lg border p-3"
      style={{ background: s.bg, borderColor: `${s.color.replace(")", " / 0.3)")}` }}
    >
      <Icon className="mt-0.5 h-4 w-4 shrink-0" style={{ color: s.color }} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <div className="truncate text-sm font-medium text-foreground">{alert.title}</div>
          <div className="shrink-0 text-[10px] uppercase tracking-wider text-muted-foreground">
            Updated {formatCentralShort(alert.updatedAt)}
          </div>
        </div>
        <div className="mt-0.5 text-xs text-muted-foreground">{alert.detail}</div>
      </div>
      <button
        className="rounded-md p-1 text-muted-foreground hover:bg-white/5 hover:text-foreground"
        onClick={onDismiss}
        aria-label="Dismiss alert"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}