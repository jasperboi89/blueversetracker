import { useMemo, useState } from "react";
import { Building2, Search, Ticket } from "lucide-react";
import { Link, useNavigate } from "@tanstack/react-router";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { mockAccounts } from "@/lib/mock/accounts";
import { mockTickets } from "@/lib/mock/tickets";
import { accountsStore } from "@/lib/accounts-store";

export function LookupCards() {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <AccountLookup />
      <TicketLookup />
    </div>
  );
}

function AccountLookup() {
  const nav = useNavigate();
  const [q, setQ] = useState("");
  const [includeArchived, setIncludeArchived] = useState(false);

  const results = useMemo(() => {
    if (!q.trim()) return [];
    const term = q.toLowerCase();
    return mockAccounts
      .filter((a) => (includeArchived ? true : a.status === "active"))
      .filter((a) => a.number.includes(term) || a.name.toLowerCase().includes(term))
      .sort((a, b) => {
        const aExact = a.number === q.trim() ? 0 : 1;
        const bExact = b.number === q.trim() ? 0 : 1;
        return aExact - bExact;
      })
      .slice(0, 6);
  }, [q, includeArchived]);

  return (
    <div className="glass-panel shimmer p-5" style={{ animation: "float-y 6s ease-in-out infinite" }}>
      <div className="flex items-center gap-3">
        <div
          className="grid h-10 w-10 place-items-center rounded-xl"
          style={{
            background: "linear-gradient(135deg, oklch(0.78 0.18 220 / 0.4), oklch(0.7 0.22 250 / 0.35))",
            boxShadow: "var(--shadow-glow-cyan)",
          }}
        >
          <Building2 className="h-4 w-4 text-white" />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-foreground">Account Lookup</h3>
          <p className="text-xs text-muted-foreground">Search by account # or company name</p>
        </div>
      </div>
      <div className="mt-4 flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="e.g. 4821 or Cedar"
            className="pl-8"
          />
        </div>
      </div>
      <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
        <Switch checked={includeArchived} onCheckedChange={setIncludeArchived} />
        Include Archived / Off Service
      </div>
      {results.length > 0 && (
        <div className="mt-3 space-y-1.5">
          {results.map((a) => (
            <button
              key={a.number}
              onClick={() => { accountsStore.touchRecent(a.number); nav({ to: "/accounts/$accountNumber", params: { accountNumber: a.number } }); }}
              className="flex w-full items-center justify-between rounded-md border border-border/30 bg-white/[0.02] px-3 py-2 text-left text-sm hover:border-border/60 hover:bg-white/[0.05]"
            >
              <span className="truncate">
                <span className="tabular-nums text-muted-foreground">{a.number}</span>{" "}
                <span className="text-foreground">{a.name}</span>
              </span>
              {a.status !== "active" && (
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{a.status}</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function TicketLookup() {
  const [q, setQ] = useState("");
  const [includeCompleted, setIncludeCompleted] = useState(false);

  const results = useMemo(() => {
    if (!q.trim()) return [];
    return mockTickets
      .filter((t) => (includeCompleted ? true : t.status !== "completed"))
      .filter((t) => t.number.includes(q.trim()))
      .slice(0, 6);
  }, [q, includeCompleted]);

  const noMatch = q.trim().length > 0 && results.length === 0;

  return (
    <div className="glass-panel shimmer p-5" style={{ animation: "float-y 7s ease-in-out infinite" }}>
      <div className="flex items-center gap-3">
        <div
          className="grid h-10 w-10 place-items-center rounded-xl"
          style={{
            background: "linear-gradient(135deg, oklch(0.7 0.22 295 / 0.4), oklch(0.78 0.18 220 / 0.35))",
            boxShadow: "var(--shadow-glow-violet)",
          }}
        >
          <Ticket className="h-4 w-4 text-white" />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-foreground">Freshdesk Ticket Lookup</h3>
          <p className="text-xs text-muted-foreground">Numbers only — saved Hub tickets</p>
        </div>
      </div>
      <div className="mt-4">
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value.replace(/[^0-9]/g, ""))}
          inputMode="numeric"
          placeholder="Ticket number"
        />
      </div>
      <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
        <Switch checked={includeCompleted} onCheckedChange={setIncludeCompleted} />
        Include Completed Tickets
      </div>
      {results.length > 0 && (
        <div className="mt-3 space-y-1.5">
          {results.map((t) => (
            <button
              key={t.number}
              className="flex w-full items-center justify-between rounded-md border border-border/30 bg-white/[0.02] px-3 py-2 text-left text-sm hover:border-border/60 hover:bg-white/[0.05]"
            >
              <span>
                <span className="tabular-nums text-muted-foreground">#{t.number}</span>{" "}
                <span className="text-foreground">{t.subject}</span>
              </span>
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{t.status.replace("-", " ")}</span>
            </button>
          ))}
        </div>
      )}
      {noMatch && (
        <div className="mt-3 space-y-2 rounded-lg border border-border/40 p-3">
          <p className="text-xs text-muted-foreground">No saved ticket found.</p>
          <div className="flex flex-wrap gap-2">
            <Button variant="ghost" size="sm" disabled>Pull Ticket from Freshdesk</Button>
            <Button variant="ghost" size="sm" disabled>Create Ticket Work Manually</Button>
          </div>
        </div>
      )}
    </div>
  );
}