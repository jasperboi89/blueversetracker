import { useState } from "react";
import { Building2, ExternalLink, Eye, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ticketsStore, isOverdue, STATUS_LABEL, type Ticket } from "@/lib/tickets-store";
import { formatCentralShort } from "@/lib/shift";
import { cn } from "@/lib/utils";

export function TicketCard({
  ticket,
  showDue,
  showPriority,
  onOpenPreview,
}: {
  ticket: Ticket;
  showDue: boolean;
  showPriority: boolean;
  onOpenPreview: (id: string) => void;
}) {
  const overdue = isOverdue(ticket);
  const [syncing, setSyncing] = useState(false);
  const [msg, setMsg] = useState<null | { ok: boolean; text: string }>(null);

  const onSync = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setSyncing(true);
    const { ok } = await ticketsStore.sync(ticket.id);
    setSyncing(false);
    setMsg(ok ? { ok: true, text: "Synced" } : { ok: false, text: "Sync failed. Open Preview for details." });
    setTimeout(() => setMsg(null), ok ? 2000 : 4000);
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => {
        ticketsStore.touchRecent(ticket.id);
        onOpenPreview(ticket.id);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpenPreview(ticket.id);
        }
      }}
      className={cn(
        "glass-panel shimmer group relative cursor-pointer p-4 transition hover:translate-y-[-1px]",
      )}
      style={
        overdue
          ? {
              borderColor: "oklch(0.72 0.22 25 / 0.55)",
              boxShadow: "0 0 22px oklch(0.72 0.22 25 / 0.35), 0 0 50px oklch(0.85 0.16 85 / 0.15)",
            }
          : undefined
      }
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold tabular-nums text-foreground">Ticket #{ticket.number}</span>
            {overdue && (
              <span
                className="rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider"
                style={{
                  background: "linear-gradient(135deg, oklch(0.72 0.22 25 / 0.3), oklch(0.85 0.16 85 / 0.25))",
                  color: "oklch(0.92 0.1 35)",
                  border: "1px solid oklch(0.72 0.22 25 / 0.5)",
                  boxShadow: "0 0 10px oklch(0.72 0.22 25 / 0.4)",
                }}
              >
                Overdue
              </span>
            )}
          </div>
          <div className="mt-0.5 truncate text-xs text-muted-foreground">
            Account {ticket.accountNumber} — <span className="text-foreground/85">{ticket.accountName}</span>
          </div>
          <div className="mt-1.5 grid gap-0.5 text-[11px] text-muted-foreground">
            <div>
              <span className="text-muted-foreground/70">Status:</span>{" "}
              <span className="text-foreground">{STATUS_LABEL[ticket.status]}</span>
            </div>
            <div>
              <span className="text-muted-foreground/70">Updated:</span>{" "}
              <span className="text-foreground">{formatCentralShort(new Date(ticket.updatedAt))}</span>
            </div>
            {showDue && ticket.dueAt && (
              <div>
                <span className="text-muted-foreground/70">Due:</span>{" "}
                <span className={overdue ? "text-[oklch(0.92_0.1_35)]" : "text-foreground"}>
                  {formatCentralShort(new Date(ticket.dueAt))}
                </span>
              </div>
            )}
            {showPriority && ticket.priority && (
              <div>
                <span className="text-muted-foreground/70">Priority:</span>{" "}
                <span className="text-foreground">{ticket.priority}</span>
              </div>
            )}
            {ticket.syncedAt && (
              <div>
                <span className="text-muted-foreground/70">Synced:</span>{" "}
                <span className="text-foreground">{formatCentralShort(new Date(ticket.syncedAt))}</span>
              </div>
            )}
          </div>
        </div>
        <button
          onClick={onSync}
          aria-label="Sync ticket"
          className="rounded-md p-1.5 text-muted-foreground hover:bg-white/5 hover:text-foreground"
        >
          <RefreshCw className={cn("h-4 w-4", syncing && "animate-spin")}
            style={syncing ? { color: "var(--cyan-glow)" } : undefined} />
        </button>
      </div>

      {msg && (
        <div
          className="mt-2 rounded-md px-2 py-1 text-[11px]"
          style={{
            background: msg.ok
              ? "linear-gradient(120deg, oklch(0.82 0.18 155 / 0.18), oklch(0.85 0.16 210 / 0.18))"
              : "linear-gradient(120deg, oklch(0.85 0.16 85 / 0.22), oklch(0.72 0.22 25 / 0.22))",
            color: msg.ok ? "var(--green-glow)" : "oklch(0.92 0.1 35)",
            border: `1px solid ${msg.ok ? "oklch(0.82 0.18 155 / 0.5)" : "oklch(0.72 0.22 25 / 0.5)"}`,
          }}
        >
          {msg.text}
        </div>
      )}

      <div className="mt-3 flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
        <Button
          size="sm"
          variant="ghost"
          className="text-foreground"
          style={{
            background: "linear-gradient(110deg, oklch(0.4 0.16 240 / 0.55), oklch(0.4 0.18 290 / 0.4))",
            border: "1px solid oklch(0.78 0.18 220 / 0.4)",
          }}
          onClick={(e) => {
            e.stopPropagation();
            ticketsStore.touchRecent(ticket.id);
            onOpenPreview(ticket.id);
          }}
        >
          <Eye className="mr-1.5 h-3.5 w-3.5" /> Open Preview
        </Button>
        <Button size="sm" variant="ghost" className="text-muted-foreground" disabled>
          <Building2 className="mr-1.5 h-3.5 w-3.5" /> Open Account
        </Button>
      </div>
    </div>
  );
}