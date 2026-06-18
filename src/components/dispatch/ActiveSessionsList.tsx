import { Link } from "@tanstack/react-router";
import { ArrowRight, Building2, Ticket as TicketIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  computeReadiness, DISPATCH_STATUS_LABEL, useDispatch,
} from "@/lib/dispatch-store";
import { formatCentralShort } from "@/lib/shift";

export function ActiveSessionsList() {
  const { sessions } = useDispatch();
  const active = sessions.filter((s) => s.status !== "ready" && s.status !== "activated");

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-foreground">Active Testing Sessions</h2>
        <div className="text-xs text-muted-foreground">{active.length} open</div>
      </div>
      {active.length === 0 ? (
        <div className="glass-panel p-6 text-center text-xs text-muted-foreground">
          No active sessions. Start one above.
        </div>
      ) : (
        <div className="grid gap-2">
          {active.map((s) => {
            const r = computeReadiness(s);
            return (
              <div key={s.id} className="glass-panel flex flex-wrap items-center justify-between gap-3 p-4">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="text-sm font-semibold text-foreground">{s.accountName}</div>
                    <div className="text-[11px] text-muted-foreground">Account {s.accountNumber}</div>
                    {s.ticketNumber && (
                      <span className="inline-flex items-center gap-1 rounded-full border border-border/30 px-2 py-0.5 text-[10px] text-muted-foreground">
                        <TicketIcon className="h-3 w-3" /> #{s.ticketNumber}
                      </span>
                    )}
                  </div>
                  <div className="mt-1 text-[11px] text-muted-foreground">
                    {s.status ? DISPATCH_STATUS_LABEL[s.status] : "In progress"} · Readiness {r.percent}% · Updated {formatCentralShort(new Date(s.updatedAt))}
                  </div>
                  <div className="mt-2 h-1 overflow-hidden rounded-full" style={{ background: "oklch(0.7 0.12 235 / 0.12)" }}>
                    <div className="h-full rounded-full" style={{ width: `${r.percent}%`, background: "linear-gradient(90deg, var(--electric), var(--cyan-glow))", boxShadow: "0 0 8px var(--cyan-glow)" }} />
                  </div>
                </div>
                <div className="flex gap-1.5">
                  <Button size="sm" variant="ghost" asChild>
                    <Link to="/accounts/$accountNumber" params={{ accountNumber: s.accountNumber }}>
                      <Building2 className="mr-1 h-3.5 w-3.5" /> Open Account
                    </Link>
                  </Button>
                  <Button size="sm" asChild
                    style={{ background: "linear-gradient(110deg, oklch(0.4 0.16 240 / 0.7), oklch(0.4 0.18 290 / 0.55))", border: "1px solid oklch(0.78 0.18 220 / 0.45)" }}
                  >
                    <Link to="/contact-dispatch/$sessionId/work" params={{ sessionId: s.id }}>
                      Open Testing <ArrowRight className="ml-1 h-3.5 w-3.5" />
                    </Link>
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}