import { useEffect, useState } from "react";
import { Eye } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { isOverdue, STATUS_LABEL, type Ticket, type TicketStatus } from "@/lib/tickets-store";
import { TicketCard } from "./TicketCard";

const TOGGLE_KEY = "aih:fd:toggles:v1";
const sectionStatuses: TicketStatus[] = ["working", "waiting-cs", "waiting-prog"];

export function ActiveTicketSections({
  tickets,
  onOpenPreview,
}: {
  tickets: Ticket[];
  onOpenPreview: (id: string) => void;
}) {
  const [showDue, setShowDue] = useState(true);
  const [showPriority, setShowPriority] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(TOGGLE_KEY);
      if (raw) {
        const o = JSON.parse(raw);
        if (typeof o.showDue === "boolean") setShowDue(o.showDue);
        if (typeof o.showPriority === "boolean") setShowPriority(o.showPriority);
      }
    } catch {}
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem(TOGGLE_KEY, JSON.stringify({ showDue, showPriority }));
    } catch {}
  }, [showDue, showPriority]);

  const active = tickets.filter((t) => t.status !== "completed");
  const allEmpty = active.length === 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-foreground">Open / Active Ticket Work</h2>
        <div className="flex items-center gap-5 text-xs text-muted-foreground">
          <label className="flex items-center gap-2">
            <Switch checked={showDue} onCheckedChange={setShowDue} />
            Show Due Times
          </label>
          <label className="flex items-center gap-2">
            <Switch checked={showPriority} onCheckedChange={setShowPriority} />
            Show Priority
          </label>
        </div>
      </div>

      {allEmpty ? (
        <div className="glass-panel p-8 text-center text-sm text-muted-foreground">
          <Eye className="mx-auto mb-3 h-5 w-5" style={{ color: "var(--cyan-glow)" }} />
          No active Freshdesk ticket work right now.
          <div className="mt-1 text-xs text-muted-foreground/80">
            Use the lookup above to pull or create a ticket work session.
          </div>
        </div>
      ) : (
        sectionStatuses.map((s) => {
          const list = active.filter((t) => t.status === s);
          if (list.length === 0) return null;
          const sorted = [...list].sort((a, b) => {
            const ao = isOverdue(a), bo = isOverdue(b);
            if (ao && !bo) return -1;
            if (bo && !ao) return 1;
            if (ao && bo) return (a.dueAt ?? 0) - (b.dueAt ?? 0);
            return a.updatedAt - b.updatedAt;
          });
          return (
            <section key={s}>
              <div className="mb-2 flex items-center gap-2">
                <span
                  className="h-1.5 w-8 rounded-full"
                  style={{
                    background:
                      s === "working"
                        ? "linear-gradient(90deg, var(--electric), var(--cyan-glow))"
                        : s === "waiting-cs"
                          ? "linear-gradient(90deg, var(--gold-glow), var(--cyan-glow))"
                          : "linear-gradient(90deg, var(--violet-glow), var(--electric))",
                    boxShadow: "0 0 8px var(--cyan-glow)",
                  }}
                />
                <h3 className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                  {STATUS_LABEL[s]} <span className="text-foreground/70">({sorted.length})</span>
                </h3>
              </div>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {sorted.map((t) => (
                  <TicketCard
                    key={t.id}
                    ticket={t}
                    showDue={showDue}
                    showPriority={showPriority}
                    onOpenPreview={onOpenPreview}
                  />
                ))}
              </div>
            </section>
          );
        })
      )}
    </div>
  );
}