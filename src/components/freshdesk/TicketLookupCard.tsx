import { useMemo, useState } from "react";
import { Search, Ticket as TicketIcon, Plus, Download } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { ticketsStore, useTickets, type Ticket } from "@/lib/tickets-store";
import { toast } from "sonner";

export function TicketLookupCard({
  onOpenPreview,
}: {
  onOpenPreview: (id: string) => void;
}) {
  const { tickets } = useTickets();
  const [q, setQ] = useState("");
  const [includeCompleted, setIncludeCompleted] = useState(false);

  const results = useMemo(() => {
    if (!q.trim()) return [];
    return tickets
      .filter((t) => (includeCompleted ? true : t.status !== "completed"))
      .filter((t) => t.number.includes(q.trim()))
      .slice(0, 6);
  }, [q, includeCompleted, tickets]);

  const noMatch = q.trim().length > 0 && results.length === 0;
  const recent = ticketsStore.getRecent();

  const openPreview = (t: Ticket) => {
    ticketsStore.touchRecent(t.id);
    onOpenPreview(t.id);
  };

  return (
    <div className="glass-panel shimmer p-5">
      <div className="flex items-center gap-3">
        <div
          className="grid h-10 w-10 place-items-center rounded-xl"
          style={{
            background:
              "linear-gradient(135deg, oklch(0.7 0.22 295 / 0.4), oklch(0.78 0.18 220 / 0.35))",
            boxShadow: "var(--shadow-glow-violet)",
          }}
        >
          <TicketIcon className="h-4 w-4 text-white" />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-foreground">Freshdesk Ticket Lookup</h3>
          <p className="text-xs text-muted-foreground">Numbers only — searches saved Hub tickets</p>
        </div>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-[1fr_auto]">
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value.replace(/[^0-9]/g, ""))}
            inputMode="numeric"
            placeholder="Enter ticket number"
            className="pl-8"
          />
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Switch checked={includeCompleted} onCheckedChange={setIncludeCompleted} />
          Include Completed Tickets
        </div>
      </div>

      {results.length > 0 && (
        <div className="mt-3 space-y-1.5">
          {results.map((t) => (
            <button
              key={t.id}
              onClick={() => openPreview(t)}
              className="flex w-full items-center justify-between rounded-md border border-border/30 bg-white/[0.02] px-3 py-2 text-left text-sm hover:border-border/60 hover:bg-white/[0.05]"
            >
              <span>
                <span className="tabular-nums text-muted-foreground">#{t.number}</span>{" "}
                <span className="text-foreground">Account {t.accountNumber} — {t.accountName}</span>
              </span>
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                {t.status === "working" ? "Working" : t.status === "waiting-cs" ? "Waiting CS" : t.status === "waiting-prog" ? "Waiting Prog" : "Completed"}
              </span>
            </button>
          ))}
        </div>
      )}

      {noMatch && (
        <div className="mt-3 space-y-2 rounded-lg border border-border/40 p-3">
          <p className="text-xs text-muted-foreground">No saved ticket found for #{q.trim()}.</p>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                const num = q.trim();
                toast.loading("Pulling ticket from Freshdesk…", { id: "fd-pull" });
                ticketsStore.pullFromFreshdesk(num).then((t) => {
                  toast.dismiss("fd-pull");
                  if (!t) {
                    toast.error("Ticket not found in Freshdesk. Check the number or connect Freshdesk in Settings.");
                    return;
                  }
                  toast.success(`Pulled ticket #${t.number} from Freshdesk`);
                  setQ("");
                  openPreview(t);
                });
              }}
            >
              <Download className="mr-1.5 h-3.5 w-3.5" /> Pull Ticket from Freshdesk
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                const t = ticketsStore.createManual(q.trim());
                toast.success(`Created manual ticket #${t.number}`);
                setQ("");
                openPreview(t);
              }}
            >
              <Plus className="mr-1.5 h-3.5 w-3.5" /> Create Ticket Work Manually
            </Button>
          </div>
        </div>
      )}

      {recent.length > 0 && (
        <div className="mt-4">
          <div className="mb-1 text-[10px] uppercase tracking-wider text-muted-foreground">Recently this shift</div>
          <div className="flex flex-wrap gap-1.5">
            {recent.map((t) => (
              <button
                key={t.id}
                onClick={() => openPreview(t)}
                className="rounded-full border border-border/40 bg-white/[0.03] px-2.5 py-1 text-xs text-foreground hover:border-border/70"
              >
                #{t.number}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}