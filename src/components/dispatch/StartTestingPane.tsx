import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Search, Ticket as TicketIcon, ArrowRight } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { dispatchStore } from "@/lib/dispatch-store";
import { accountsStore } from "@/lib/accounts-store";
import { ticketsStore } from "@/lib/tickets-store";
import { toast } from "sonner";

export function StartTestingPane() {
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [ticket, setTicket] = useState("");
  const [picked, setPicked] = useState<{ number: string; name: string } | null>(null);

  const matches = q.trim() ? accountsStore.search(q, { includeArchived: true }) : [];

  const linkedTicket = ticket.trim() ? ticketsStore.getByNumber(ticket.trim()) : undefined;

  const start = () => {
    if (!picked) return;
    const s = dispatchStore.start({
      accountNumber: picked.number,
      accountName: picked.name,
      ticketNumber: ticket.trim() || undefined,
    });
    toast.success(`Started testing for ${picked.name}.`);
    navigate({ to: "/contact-dispatch/$sessionId/work", params: { sessionId: s.id } });
  };

  return (
    <div className="glass-panel p-5">
      <div className="mb-3 flex items-center gap-2">
        <div
          className="grid h-9 w-9 place-items-center rounded-xl"
          style={{
            background: "linear-gradient(135deg, oklch(0.78 0.18 220 / 0.4), oklch(0.7 0.22 295 / 0.35))",
            boxShadow: "0 0 16px var(--cyan-glow), inset 0 1px 0 oklch(1 0 0 / 0.18)",
          }}
        >
          <Search className="h-4 w-4 text-white" />
        </div>
        <div>
          <div className="text-sm font-semibold text-foreground">Start Contact Dispatch Testing</div>
          <div className="text-[11px] text-muted-foreground">Search an account, optionally link a Freshdesk ticket, then start the testing session.</div>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-[1fr_220px_auto]">
        <div>
          <label className="text-xs uppercase tracking-wider text-muted-foreground">Account Number or Name</label>
          <Input
            value={q}
            onChange={(e) => { setQ(e.target.value); setPicked(null); }}
            placeholder="e.g. 1042 or Riverbend"
            className="mt-1"
          />
        </div>
        <div>
          <label className="text-xs uppercase tracking-wider text-muted-foreground">Linked Ticket (optional)</label>
          <Input
            value={ticket}
            onChange={(e) => setTicket(e.target.value)}
            placeholder="Freshdesk #"
            inputMode="numeric"
            className="mt-1"
          />
        </div>
        <div className="flex items-end">
          <Button
            onClick={start}
            disabled={!picked}
            className="w-full"
            style={picked ? { background: "linear-gradient(110deg, oklch(0.4 0.16 240 / 0.7), oklch(0.4 0.18 290 / 0.55))", border: "1px solid oklch(0.78 0.18 220 / 0.45)" } : undefined}
          >
            Start Testing <ArrowRight className="ml-1 h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {q && (
        <div className="mt-3 space-y-1">
          {matches.length > 0 ? matches.map((a) => (
            <button
              key={a.number}
              onClick={() => { setPicked({ number: a.number, name: a.name }); setQ(`${a.number} — ${a.name}`); }}
              className="flex w-full items-center justify-between rounded-md border border-border/30 bg-white/[0.02] px-3 py-2 text-left text-sm hover:bg-white/[0.05]"
            >
              <div>
                <div className="text-foreground">{a.name}</div>
                <div className="text-[11px] text-muted-foreground">Account {a.number} · {a.status}</div>
              </div>
              {picked?.number === a.number && <span className="text-[10px] uppercase tracking-wider text-[color:var(--cyan-glow)]">Selected</span>}
            </button>
          )) : (
            <div className="rounded-md border border-dashed border-border/40 p-3 text-xs text-muted-foreground">
              No account matches “{q}”.
              <Button size="sm" variant="ghost" className="ml-2" onClick={() => toast.info("Full account creation will come in a later phase.")}>Create Account Later</Button>
            </div>
          )}
        </div>
      )}

      {linkedTicket && (
        <div className="mt-3 flex items-center gap-2 rounded-md border border-border/30 bg-white/[0.02] p-2 text-xs">
          <TicketIcon className="h-3.5 w-3.5" style={{ color: "var(--cyan-glow)" }} />
          <span className="text-foreground">#{linkedTicket.number}</span>
          <span className="text-muted-foreground">— {linkedTicket.details.subject || "ticket"}</span>
          <span className="text-muted-foreground">· {linkedTicket.accountName}</span>
        </div>
      )}
    </div>
  );
}