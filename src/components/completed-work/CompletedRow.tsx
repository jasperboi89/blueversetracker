import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { ClipboardList, PhoneOutgoing, RotateCcw, Ticket as TicketIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { toast } from "sonner";
import { formatCentralShort } from "@/lib/shift";
import { ticketsStore } from "@/lib/tickets-store";
import { dispatchStore } from "@/lib/dispatch-store";
import { additionalWorkStore } from "@/lib/additional-work-store";
import { alphaMix } from "@/lib/visual-style";
import type { CompletedRecord } from "./types";

const META = {
  freshdesk: { label: "Freshdesk", icon: TicketIcon, color: "var(--cyan-glow)" },
  dispatch: { label: "Dispatch", icon: PhoneOutgoing, color: "var(--violet-glow)" },
  additional: { label: "Additional", icon: ClipboardList, color: "var(--gold-glow)" },
} as const;

export function CompletedRow({ item }: { item: CompletedRecord }) {
  const m = META[item.kind];
  const Icon = m.icon;
  const [confirming, setConfirming] = useState(false);

  const openButton =
    item.kind === "freshdesk" ? (
      <Link to="/freshdesk-tickets/$ticketId/work" params={{ ticketId: item.sourceId }}>
        Open
      </Link>
    ) : item.kind === "dispatch" ? (
      <Link to="/contact-dispatch/$sessionId/work" params={{ sessionId: item.sourceId }}>
        Open
      </Link>
    ) : (
      <Link to="/additional-work/$workId/work" params={{ workId: item.sourceId }}>
        Open
      </Link>
    );

  const reopen = () => {
    if (item.kind === "freshdesk") ticketsStore.reopen(item.sourceId);
    else if (item.kind === "dispatch") dispatchStore.reopen(item.sourceId);
    else additionalWorkStore.reopen(item.sourceId);
    toast.success("Reopened — moved back to Working");
    setConfirming(false);
  };

  return (
    <div className="flex items-center gap-3 py-3">
      <div
        className="grid h-9 w-9 shrink-0 place-items-center rounded-lg"
        style={{
          background: `linear-gradient(135deg, ${alphaMix(m.color, 30)}, oklch(0.7 0.22 295 / 0.2))`,
          boxShadow: `0 0 12px ${m.color}`,
        }}
      >
        <Icon className="h-4 w-4 text-white" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm text-foreground">{item.title}</div>
        <div className="truncate text-xs text-muted-foreground">
          {m.label}
          {item.ticketNumber ? ` · Ticket #${item.ticketNumber}` : ""}
          {item.accountNumber ? ` · Account ${item.accountNumber}` : ""}
          {item.accountName ? ` · ${item.accountName}` : ""}
          {" · "}
          {formatCentralShort(new Date(item.completedAt))}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <Button asChild variant="ghost" size="sm" className="text-xs">
          {openButton}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="text-xs"
          onClick={() => setConfirming(true)}
        >
          <RotateCcw className="mr-1 h-3.5 w-3.5" /> Reopen
        </Button>
      </div>

      <ConfirmModal
        open={confirming}
        onOpenChange={setConfirming}
        title="Reopen this work?"
        description="It will move back to Working / Not Ready so you can edit it again."
        confirmLabel="Reopen"
        onConfirm={reopen}
      />
    </div>
  );
}