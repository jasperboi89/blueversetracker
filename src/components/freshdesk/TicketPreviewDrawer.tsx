import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  ChevronDown,
  ChevronRight,
  ExternalLink,
  FileText,
  ImagePlus,
  MessageSquarePlus,
  Play,
  RefreshCw,
  Building2,
  Trash2,
} from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { ticketsStore, STATUS_LABEL, type Ticket } from "@/lib/tickets-store";
import { formatCentralShort } from "@/lib/shift";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import { AddNoteModal } from "./AddNoteModal";
import { AddSnipModal } from "./AddSnipModal";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { toast } from "sonner";

export function TicketPreviewDrawer({
  ticket,
  open,
  onOpenChange,
}: {
  ticket: Ticket | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const [noteOpen, setNoteOpen] = useState(false);
  const [snipOpen, setSnipOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [syncMsg, setSyncMsg] = useState<null | { ok: boolean; text: string }>(null);
  const [syncing, setSyncing] = useState(false);

  if (!ticket) return null;

  const sync = async () => {
    setSyncing(true);
    const { ok } = await ticketsStore.sync(ticket.id);
    setSyncing(false);
    setSyncMsg(ok ? { ok: true, text: "Synced." } : { ok: false, text: "Sync failed. Try again or open Freshdesk." });
    setTimeout(() => setSyncMsg(null), 3500);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side={isMobile ? "bottom" : "right"}
        className={cn(
          "glass-panel flex flex-col overflow-y-auto border-0 p-0",
          isMobile ? "h-[88vh]" : "w-[520px] sm:max-w-[520px]",
        )}
      >
        <SheetHeader className="border-b border-border/30 p-5 pb-3">
          <SheetTitle className="flex items-center gap-2">
            <span className="tabular-nums">Ticket #{ticket.number}</span>
          </SheetTitle>
          <div className="text-xs text-muted-foreground">
            Account {ticket.accountNumber} — {ticket.accountName}
          </div>
          <div className="mt-1 grid gap-0.5 text-[11px] text-muted-foreground">
            <div>Status: <span className="text-foreground">{STATUS_LABEL[ticket.status]}</span></div>
            {ticket.dueAt && <div>Due: <span className="text-foreground">{formatCentralShort(new Date(ticket.dueAt))}</span></div>}
            {ticket.syncedAt && <div>Synced: <span className="text-foreground">{formatCentralShort(new Date(ticket.syncedAt))}</span></div>}
          </div>
          <div className="mt-3">
            <Button
              className="w-full text-foreground"
              onClick={() => {
                onOpenChange(false);
                navigate({ to: "/freshdesk-tickets/$ticketId/work", params: { ticketId: ticket.id } });
              }}
              style={{
                background: "linear-gradient(110deg, oklch(0.4 0.16 240 / 0.7), oklch(0.4 0.18 290 / 0.55))",
                border: "1px solid oklch(0.78 0.18 220 / 0.5)",
                boxShadow: "0 0 18px oklch(0.78 0.18 220 / 0.4)",
              }}
            >
              <Play className="mr-1.5 h-4 w-4" /> Continue Ticket Work
            </Button>
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <Button size="sm" variant="ghost" onClick={() => setNoteOpen(true)}><MessageSquarePlus className="mr-1 h-3.5 w-3.5" /> Add Note</Button>
            <Button size="sm" variant="ghost" onClick={() => setSnipOpen(true)}><ImagePlus className="mr-1 h-3.5 w-3.5" /> Add Snip</Button>
            <Button size="sm" variant="ghost" onClick={sync} disabled={syncing}>
              <RefreshCw className={cn("mr-1 h-3.5 w-3.5", syncing && "animate-spin")} /> Sync Freshdesk
            </Button>
            <Button size="sm" variant="ghost" disabled><Building2 className="mr-1 h-3.5 w-3.5" /> Open Account Profile</Button>
            <Button size="sm" variant="ghost" onClick={() => window.open(ticket.details.freshdeskUrl, "_blank")}>
              <ExternalLink className="mr-1 h-3.5 w-3.5" /> Open Freshdesk
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setConfirmDelete(true)}
              style={{ color: "oklch(0.82 0.18 25)" }}
            >
              <Trash2 className="mr-1 h-3.5 w-3.5" /> Delete Ticket
            </Button>
          </div>
          {syncMsg && (
            <div
              className="mt-2 rounded-md px-2 py-1 text-[11px]"
              style={{
                background: syncMsg.ok
                  ? "linear-gradient(120deg, oklch(0.82 0.18 155 / 0.18), oklch(0.85 0.16 210 / 0.18))"
                  : "linear-gradient(120deg, oklch(0.85 0.16 85 / 0.22), oklch(0.72 0.22 25 / 0.22))",
                color: syncMsg.ok ? "var(--green-glow)" : "oklch(0.92 0.1 35)",
                border: `1px solid ${syncMsg.ok ? "oklch(0.82 0.18 155 / 0.5)" : "oklch(0.72 0.22 25 / 0.5)"}`,
              }}
            >
              {syncMsg.text}
            </div>
          )}
        </SheetHeader>

        <div className="space-y-5 p-5">
          <Section title="Ticket Summary">
            <Summary ticket={ticket} />
          </Section>
          <Section title="Latest Freshdesk Notes">
            <ExpandableList
              items={[...ticket.freshdeskNotes].sort((a, b) => b.createdAt - a.createdAt)}
              render={(n) => (
                <div className="rounded-md border border-border/30 bg-white/[0.02] p-3 text-sm">
                  <div className="mb-1 flex items-center justify-between text-[10px] uppercase tracking-wider text-muted-foreground">
                    <span>{n.author}</span>
                    <span>{formatCentralShort(new Date(n.createdAt))}</span>
                  </div>
                  <div className="text-foreground/90">{n.body}</div>
                </div>
              )}
              empty="No Freshdesk notes."
            />
          </Section>
          <Section title="Account Intel Hub History">
            <ExpandableList
              items={[...ticket.hubHistory].sort((a, b) => b.createdAt - a.createdAt)}
              render={(h) => (
                <div className="rounded-md border border-border/30 bg-white/[0.02] p-3 text-sm">
                  <div className="mb-1 flex items-center justify-between text-[10px] uppercase tracking-wider text-muted-foreground">
                    <span>{h.initials} · {h.kind}</span>
                    <span>{formatCentralShort(new Date(h.createdAt))}</span>
                  </div>
                  <div className="text-foreground/90">{h.body}</div>
                </div>
              )}
              empty="No Hub history yet."
            />
          </Section>
          <Section title="Freshdesk Attachments">
            <ExpandableList
              items={[...ticket.freshdeskAttachments].sort((a, b) => b.createdAt - a.createdAt)}
              render={(a) => (
                <div className="flex items-center justify-between rounded-md border border-border/30 bg-white/[0.02] p-3 text-sm">
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4" style={{ color: "var(--cyan-glow)" }} />
                    <span className="text-foreground">{a.name}</span>
                    {a.size && <span className="text-[10px] text-muted-foreground">{a.size}</span>}
                  </div>
                  <span className="text-[10px] text-muted-foreground">{formatCentralShort(new Date(a.createdAt))}</span>
                </div>
              )}
              empty="No Freshdesk attachments."
            />
          </Section>
          <Section title="Hub Saved Snips / Attachments">
            <ExpandableList
              items={[...ticket.hubSnips].sort((a, b) => b.createdAt - a.createdAt)}
              render={(s) => (
                <div className="rounded-md border border-border/30 bg-white/[0.02] p-3 text-sm">
                  <div className="mb-1 flex items-center justify-between text-[10px] uppercase tracking-wider text-muted-foreground">
                    <span>{s.category}{s.label ? ` · ${s.label}` : ""}</span>
                    <span>{formatCentralShort(new Date(s.createdAt))}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    {s.dataUrl && s.isImage && <img src={s.dataUrl} alt={s.name} className="h-12 w-12 rounded object-cover" />}
                    <div className="text-foreground">{s.name}</div>
                  </div>
                </div>
              )}
              empty="No Hub snips."
            />
          </Section>
          <DetailsAccordion ticket={ticket} />
        </div>

        <AddNoteModal ticketId={ticket.id} open={noteOpen} onOpenChange={setNoteOpen} />
        <AddSnipModal ticketId={ticket.id} open={snipOpen} onOpenChange={setSnipOpen} />
        <ConfirmModal
          open={confirmDelete}
          onOpenChange={setConfirmDelete}
          title={`Delete ticket #${ticket.number}?`}
          description="This permanently removes the ticket, its notes, snips, attachments, and hub history. This cannot be undone."
          confirmLabel="Delete"
          tone="danger"
          onConfirm={() => {
            const num = ticket.number;
            const { ok } = ticketsStore.deleteTicket(ticket.id);
            setConfirmDelete(false);
            if (ok) {
              toast.success(`Ticket #${num} deleted.`);
              onOpenChange(false);
            }
          }}
        />
      </SheetContent>
    </Sheet>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="mb-2 text-xs uppercase tracking-[0.18em] text-muted-foreground">{title}</h3>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

function Summary({ ticket }: { ticket: Ticket }) {
  return (
    <div className="rounded-md border border-border/30 bg-white/[0.02] p-3 text-sm">
      <div className="grid gap-1 text-[11px] text-muted-foreground">
        <div>Hub ID: <span className="text-foreground">{ticket.id}</span></div>
        <div>Ticket #: <span className="text-foreground">{ticket.number}</span></div>
        <div>Account: <span className="text-foreground">{ticket.accountNumber} — {ticket.accountName}</span></div>
        <div>Status: <span className="text-foreground">{STATUS_LABEL[ticket.status]}</span></div>
        {ticket.priority && <div>Priority: <span className="text-foreground">{ticket.priority}</span></div>}
        <div>Updated: <span className="text-foreground">{formatCentralShort(new Date(ticket.updatedAt))}</span></div>
      </div>
    </div>
  );
}

function ExpandableList<T extends { id: string }>({
  items,
  render,
  empty,
}: {
  items: T[];
  render: (x: T) => React.ReactNode;
  empty: string;
}) {
  const [expanded, setExpanded] = useState(false);
  if (items.length === 0)
    return <div className="rounded-md border border-dashed border-border/30 p-3 text-xs text-muted-foreground">{empty}</div>;
  const visible = expanded ? items : items.slice(0, 3);
  return (
    <>
      {visible.map((x) => <div key={x.id}>{render(x)}</div>)}
      {items.length > 3 && (
        <Button size="sm" variant="ghost" className="text-xs" style={{ color: "var(--cyan-glow)" }} onClick={() => setExpanded((s) => !s)}>
          {expanded ? "Show Less" : `View All (${items.length})`}
        </Button>
      )}
    </>
  );
}

function DetailsAccordion({ ticket }: { ticket: Ticket }) {
  const [open, setOpen] = useState(false);
  const d = ticket.details;
  return (
    <section className="rounded-lg border border-border/30">
      <button onClick={() => setOpen((s) => !s)} className="flex w-full items-center justify-between p-3 text-sm text-foreground">
        <span>Ticket Details</span>
        {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
      </button>
      {open && (
        <div className="grid gap-1 border-t border-border/30 p-3 text-xs">
          {[
            ["Subject", d.subject],
            ["Region", d.region],
            ["Company", d.company],
            ["Topic", d.topic],
            ["Type", d.type],
            ["Priority", d.priority],
            ["Group", d.group],
            ["Agent", d.agent],
          ].map(([k, v]) => (
            <div key={k} className="flex justify-between gap-3">
              <span className="text-muted-foreground">{k}</span>
              <span className="text-right text-foreground/90">{v || "—"}</span>
            </div>
          ))}
          <div className="mt-2">
            <a href={d.freshdeskUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs underline-offset-2 hover:underline" style={{ color: "var(--cyan-glow)" }}>
              Freshdesk Link <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        </div>
      )}
    </section>
  );
}