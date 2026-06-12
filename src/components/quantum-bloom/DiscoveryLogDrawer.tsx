import { useMemo, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Ticket, Phone, Moon, Sunrise, Sparkles, RotateCcw } from "lucide-react";
import { useDiscoveries, type Discovery } from "@/hooks/use-discoveries";

const KIND_META: Record<Discovery["kind"], { label: string; icon: typeof Ticket; color: string }> = {
  ticket: { label: "Ticket", icon: Ticket, color: "var(--cyan-glow)" },
  dispatch: { label: "Dispatch", icon: Phone, color: "var(--electric)" },
  night_plan: { label: "Night Plan", icon: Moon, color: "var(--violet-glow)" },
  shift: { label: "Shift", icon: Sunrise, color: "var(--gold-glow)" },
};

export function DiscoveryLogDrawer({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { rows, loading, clearAll } = useDiscoveries(open);
  const [confirming, setConfirming] = useState(false);

  const grouped = useMemo(() => {
    const map = new Map<string, Discovery[]>();
    rows.forEach((r) => {
      const day = new Date(r.createdAt).toLocaleDateString(undefined, {
        weekday: "short",
        month: "short",
        day: "numeric",
      });
      const list = map.get(day) ?? [];
      list.push(r);
      map.set(day, list);
    });
    return Array.from(map.entries());
  }, [rows]);

  const counts = useMemo(() => {
    const c: Record<Discovery["kind"], number> = { ticket: 0, dispatch: 0, night_plan: 0, shift: 0 };
    rows.forEach((r) => { c[r.kind] += 1; });
    return c;
  }, [rows]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4" style={{ color: "var(--qb-phase-accent, var(--cyan-glow))" }} />
            Discovery Log
          </SheetTitle>
          <SheetDescription>
            Moments the Quantum Bloom has recorded for you.
          </SheetDescription>
        </SheetHeader>

        <div className="mt-4 grid grid-cols-4 gap-2">
          {(Object.keys(KIND_META) as Discovery["kind"][]).map((k) => {
            const m = KIND_META[k];
            const Icon = m.icon;
            return (
              <div
                key={k}
                className="rounded-md border border-border/40 p-2 text-center text-xs"
              >
                <Icon className="mx-auto h-4 w-4" style={{ color: m.color }} />
                <div className="mt-1 font-semibold text-foreground">{counts[k]}</div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  {m.label}
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-5 space-y-4">
          {loading && rows.length === 0 ? (
            <p className="text-xs text-muted-foreground">Loading discoveries…</p>
          ) : rows.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              No discoveries yet. Complete a ticket, dispatch test, night plan, or shift while Quantum Bloom is active to record one.
            </p>
          ) : (
            grouped.map(([day, items]) => (
              <div key={day}>
                <div className="mb-1 text-[10px] uppercase tracking-wider text-muted-foreground">
                  {day}
                </div>
                <ul className="space-y-1">
                  {items.map((r) => {
                    const m = KIND_META[r.kind];
                    const Icon = m.icon;
                    return (
                      <li
                        key={r.id}
                        className="flex items-center gap-2 rounded-md bg-white/[0.02] px-2 py-1.5 text-xs"
                      >
                        <Icon className="h-3.5 w-3.5 shrink-0" style={{ color: m.color }} />
                        <span className="flex-1 truncate text-foreground">{r.label}</span>
                        <span className="text-[10px] text-muted-foreground">
                          {new Date(r.createdAt).toLocaleTimeString(undefined, {
                            hour: "numeric",
                            minute: "2-digit",
                          })}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))
          )}
        </div>

        {rows.length > 0 && (
          <div className="mt-6 border-t border-border/40 pt-4">
            {!confirming ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setConfirming(true)}
                className="text-muted-foreground"
              >
                <RotateCcw className="mr-2 h-3.5 w-3.5" />
                Reset Discoveries
              </Button>
            ) : (
              <div className="space-y-2">
                <p className="text-xs text-foreground">
                  Clear all {rows.length} discoveries? This can't be undone.
                </p>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={async () => {
                      await clearAll();
                      setConfirming(false);
                    }}
                  >
                    Clear all
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>
                    Cancel
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
