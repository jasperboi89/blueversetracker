import { useState } from "react";
import { ExternalLink, Download, X, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { assignedInboxStore } from "@/lib/assigned-inbox-store";
import type { AssignedTicketRow } from "@/lib/api/freshdesk-assigned.functions";
import { ticketsStore } from "@/lib/tickets-store";

function statusChip(label: string) {
  const map: Record<string, string> = {
    Open: "border-cyan-400/50 bg-cyan-500/10 text-cyan-200",
    Pending: "border-amber-400/50 bg-amber-500/10 text-amber-200",
    "Waiting on Customer": "border-violet-400/50 bg-violet-500/10 text-violet-200",
    "Waiting on Third Party": "border-rose-400/50 bg-rose-500/10 text-rose-200",
  };
  return map[label] ?? "border-white/10 bg-white/5 text-muted-foreground";
}

export function AssignedInboxRow({
  row,
  isNew,
}: {
  row: AssignedTicketRow;
  isNew: boolean;
}) {
  const [tracking, setTracking] = useState(false);
  const alreadyTracked = !!ticketsStore.getByNumber(row.number);

  const track = async () => {
    setTracking(true);
    try {
      const res = await ticketsStore.pullFromFreshdesk(row.number);
      if (res.ticket) {
        toast.success(`Tracking FD #${row.number}`);
        assignedInboxStore.dismiss(row.number);
      } else if (res.notConnected) {
        toast.error("Freshdesk isn't connected. Add credentials in Settings.");
      } else {
        toast.error(res.error ?? "Could not pull ticket from Freshdesk.");
      }
    } finally {
      setTracking(false);
    }
  };

  return (
    <article
      className={`glass-panel space-y-2 p-4 ${isNew ? "ring-1 ring-cyan-400/40" : ""}`}
      style={isNew ? { boxShadow: "0 0 22px color-mix(in oklab, var(--cyan-glow) 25%, transparent)" } : undefined}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="font-mono">#{row.number}</span>
            {row.accountNumber && <span>· acct {row.accountNumber}</span>}
            {row.companyName && <span className="truncate">· {row.companyName}</span>}
          </div>
          <h3 className="mt-0.5 truncate text-sm font-semibold text-foreground">{row.subject}</h3>
        </div>
        <div className="flex flex-wrap items-center gap-1.5 text-[10px] uppercase tracking-[0.16em]">
          <span className={`rounded-full border px-2 py-0.5 ${statusChip(row.statusLabel)}`}>
            {row.statusLabel}
          </span>
          {row.priority && (
            <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-muted-foreground">
              {row.priority}
            </span>
          )}
          <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-muted-foreground">
            upd {new Date(row.updatedAt).toLocaleDateString()}
          </span>
        </div>
      </div>
      <footer className="flex flex-wrap gap-2 pt-1">
        <Button size="sm" onClick={track} disabled={tracking || alreadyTracked}>
          {tracking ? (
            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
          ) : (
            <Download className="mr-1.5 h-3.5 w-3.5" />
          )}
          {alreadyTracked ? "Already Tracked" : "Track"}
        </Button>
        <Button
          size="sm"
          variant="secondary"
          onClick={() => window.open(row.freshdeskUrl, "_blank", "noopener")}
        >
          <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
          Open in Freshdesk
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => assignedInboxStore.dismiss(row.number)}
          className="text-muted-foreground"
        >
          <X className="mr-1.5 h-3.5 w-3.5" />
          Dismiss
        </Button>
      </footer>
    </article>
  );
}