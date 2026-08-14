import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Search, Ticket as TicketIcon, ArrowRight } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { dispatchStore } from "@/lib/dispatch-store";
import { Checkbox } from "@/components/ui/checkbox";
import { accountsStore } from "@/lib/accounts-store";
import { ticketsStore } from "@/lib/tickets-store";
import { toast } from "sonner";

export function StartTestingPane() {
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [ticket, setTicket] = useState("");
  const [picked, setPicked] = useState<{ number: string; name: string } | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [newNumber, setNewNumber] = useState("");
  const [newName, setNewName] = useState("");
  const [prefill, setPrefill] = useState(true);

  // Most recent finished test for the selected account — its reason cards are
  // almost always the same list the operator is about to retype.
  const lastSession = picked
    ? [...dispatchStore.getState().sessions]
        .filter((s) => s.accountNumber === picked.number && s.reasons.length > 0)
        .sort((a, b) => b.updatedAt - a.updatedAt)[0]
    : undefined;

  const matches = q.trim() ? accountsStore.search(q, { includeArchived: true }) : [];

  const linkedTicket = ticket.trim() ? ticketsStore.getByNumber(ticket.trim()) : undefined;

  const openCreate = () => {
    // Seed the modal with whatever the user typed so far.
    const trimmed = q.trim();
    const numMatch = trimmed.match(/^\d+/);
    if (numMatch) {
      setNewNumber(numMatch[0]);
      setNewName(trimmed.slice(numMatch[0].length).replace(/^[\s—-]+/, ""));
    } else {
      setNewNumber("");
      setNewName(trimmed);
    }
    setCreateOpen(true);
  };

  const submitCreate = () => {
    const num = newNumber.trim();
    const name = newName.trim();
    if (!num || !name) {
      toast.error("Account number and name are required.");
      return;
    }
    try {
      const a = accountsStore.create({ number: num, name });
      setPicked({ number: a.number, name: a.name });
      setQ(`${a.number} — ${a.name}`);
      setCreateOpen(false);
      toast.success(`Created account ${a.number}.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not create account.");
    }
  };

  const start = () => {
    if (!picked) return;
    const s = dispatchStore.start({
      accountNumber: picked.number,
      accountName: picked.name,
      ticketNumber: ticket.trim() || undefined,
    });
    if (prefill && lastSession) {
      lastSession.reasons.forEach((r) => {
        dispatchStore.addReason(s.id, r.source, {
          text: r.text,
          type: r.type,
          expectedFlow: r.expectedFlow,
        });
      });
    }
    toast.success(`Started testing for ${picked.name}.`);
    navigate({ to: "/contact-dispatch/$sessionId/work", params: { sessionId: s.id } });
  };

  return (
    <div className="glass-panel hq-working p-5">
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
              <Button size="sm" variant="ghost" className="ml-2" onClick={openCreate}>Create Account</Button>
            </div>
          )}
        </div>
      )}

      {lastSession && (
        <label className="mt-3 flex cursor-pointer items-center gap-2 rounded-md border border-border/30 bg-white/[0.02] p-2 text-xs">
          <Checkbox checked={prefill} onCheckedChange={(v) => setPrefill(v === true)} />
          <span className="text-foreground">
            Prefill {lastSession.reasons.length} reason card
            {lastSession.reasons.length === 1 ? "" : "s"} from the last test
          </span>
          <span className="text-muted-foreground">
            ({new Date(lastSession.updatedAt).toLocaleDateString()})
          </span>
        </label>
      )}
      {linkedTicket && (
        <div className="mt-3 flex items-center gap-2 rounded-md border border-border/30 bg-white/[0.02] p-2 text-xs">
          <TicketIcon className="h-3.5 w-3.5" style={{ color: "var(--cyan-glow)" }} />
          <span className="text-foreground">#{linkedTicket.number}</span>
          <span className="text-muted-foreground">— {linkedTicket.details.subject || "ticket"}</span>
          <span className="text-muted-foreground">· {linkedTicket.accountName}</span>
        </div>
      )}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="glass-panel border-0 sm:max-w-md">
          <DialogHeader><DialogTitle>Create Account</DialogTitle></DialogHeader>
          <div className="space-y-3 text-sm">
            <label className="block">
              <span className="text-xs uppercase tracking-wider text-muted-foreground">Account Number</span>
              <Input value={newNumber} onChange={(e) => setNewNumber(e.target.value)} className="mt-1" placeholder="e.g. 1042" inputMode="numeric" autoFocus />
            </label>
            <label className="block">
              <span className="text-xs uppercase tracking-wider text-muted-foreground">Account Name</span>
              <Input value={newName} onChange={(e) => setNewName(e.target.value)} className="mt-1" placeholder="e.g. Riverbend Clinic" />
            </label>
            <p className="text-[11px] text-muted-foreground">
              You can add region, notes, and reason templates later from the Accounts page.
            </p>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={submitCreate}>Create &amp; Select</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}