import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Archive, ArrowRight, Building2, RotateCcw, Ticket as TicketIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { dispatchStore, useDispatch } from "@/lib/dispatch-store";
import { formatCentralShort } from "@/lib/shift";
import { toast } from "sonner";

export function DispatchArchiveList() {
  const { sessions } = useDispatch();
  const archived = sessions
    .filter((s) => s.status === "activated")
    .sort((a, b) => (b.activatedAt ?? 0) - (a.activatedAt ?? 0));

  const [confirmId, setConfirmId] = useState<string | null>(null);
  const target = archived.find((s) => s.id === confirmId);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-foreground">Archived (Activated) Sessions</h2>
        <div className="text-xs text-muted-foreground">{archived.length} archived</div>
      </div>
      {archived.length === 0 ? (
        <div className="glass-panel flex flex-col items-center gap-2 p-8 text-center text-xs text-muted-foreground">
          <Archive className="h-5 w-5 opacity-60" />
          No activated sessions yet. Mark a Ready session as Activated to move it here.
        </div>
      ) : (
        <div className="grid gap-2">
          {archived.map((s) => (
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
                  Activated {s.activatedAt ? formatCentralShort(new Date(s.activatedAt)) : "—"} · LTP
                </div>
              </div>
              <div className="flex gap-1.5">
                <Button size="sm" variant="ghost" asChild>
                  <Link to="/accounts/$accountNumber" params={{ accountNumber: s.accountNumber }}>
                    <Building2 className="mr-1 h-3.5 w-3.5" /> Account
                  </Link>
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setConfirmId(s.id)}>
                  <RotateCcw className="mr-1 h-3.5 w-3.5" /> Reopen
                </Button>
                <Button size="sm" asChild
                  style={{ background: "linear-gradient(110deg, oklch(0.4 0.16 240 / 0.7), oklch(0.4 0.18 290 / 0.55))", border: "1px solid oklch(0.78 0.18 220 / 0.45)" }}
                >
                  <Link to="/contact-dispatch/$sessionId/work" params={{ sessionId: s.id }}>
                    Open <ArrowRight className="ml-1 h-3.5 w-3.5" />
                  </Link>
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <ConfirmModal
        open={!!confirmId}
        onOpenChange={(v) => !v && setConfirmId(null)}
        title="Reopen this archived session?"
        description={
          target
            ? `${target.accountName} will move back to Ready for Activation and reappear in the Active list.`
            : ""
        }
        confirmLabel="Reopen"
        onConfirm={() => {
          if (confirmId) {
            dispatchStore.reopenFromArchive(confirmId);
            toast.success("Moved back to Ready for Activation.");
          }
          setConfirmId(null);
        }}
      />
    </div>
  );
}