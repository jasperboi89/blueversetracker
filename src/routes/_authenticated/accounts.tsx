import { useMemo, useState } from "react";
import { Link, Outlet, createFileRoute, useNavigate, useRouterState } from "@tanstack/react-router";
import { Building2, Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { accountsStore, useAccounts } from "@/lib/accounts-store";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/accounts")({
  head: () => ({ meta: [{ title: "Accounts — Account Intel Hub" }] }),
  component: AccountsLayout,
});

function AccountsLayout() {
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  if (pathname !== "/accounts") return <Outlet />;
  return <AccountsLookup />;
}

function AccountsLookup() {
  useAccounts();
  const nav = useNavigate();
  const [q, setQ] = useState("");
  const [includeArchived, setIncludeArchived] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);

  const results = useMemo(() => accountsStore.search(q, { includeArchived }), [q, includeArchived]);
  const recent = accountsStore.getRecent();
  const noMatch = q.trim().length > 0 && results.length === 0;

  return (
    <>
      <div className="mx-auto max-w-3xl space-y-5">
        <div className="glass-panel shimmer p-5 sm:p-6">
          <div className="flex items-start gap-4">
            <div className="grid h-12 w-12 place-items-center rounded-2xl" style={{ background: "linear-gradient(135deg, oklch(0.78 0.18 220 / 0.45), oklch(0.7 0.22 295 / 0.4))", boxShadow: "var(--shadow-glow-cyan)" }}>
              <Building2 className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-semibold text-foreground">Account Lookup</h1>
              <p className="mt-1 text-sm text-muted-foreground">Search by account number or company name.</p>
            </div>
          </div>
          <div className="mt-4 relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="e.g. 1042 or Riverbend" className="pl-8" />
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
                  <span>
                    <span className="tabular-nums text-muted-foreground">{a.number}</span>{" "}
                    <span className="text-foreground">{a.name}</span>
                  </span>
                  {a.status !== "active" && (
                    <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Off Service · Archived</span>
                  )}
                </button>
              ))}
            </div>
          )}

          {noMatch && (
            <div className="mt-3 rounded-md border border-border/40 bg-white/[0.02] p-3 text-sm">
              <p className="text-xs text-muted-foreground">No account found for "{q}".</p>
              <Button size="sm" className="mt-2" onClick={() => setCreateOpen(true)}>
                <Plus className="mr-1 h-3 w-3" /> Create New Account
              </Button>
            </div>
          )}

          {q.trim() === "" && recent.length > 0 && (
            <div className="mt-4">
              <div className="mb-1 text-[10px] uppercase tracking-wider text-muted-foreground">Recent this shift</div>
              <div className="space-y-1.5">
                {recent.map((a) => (
                  <Link key={a.number} to="/accounts/$accountNumber" params={{ accountNumber: a.number }} className="block rounded-md border border-border/30 bg-white/[0.02] px-3 py-2 text-sm hover:border-border/60 hover:bg-white/[0.05]">
                    <span className="tabular-nums text-muted-foreground">{a.number}</span>{" "}
                    <span className="text-foreground">{a.name}</span>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>

        <CreateAccountModal open={createOpen} onOpenChange={setCreateOpen} prefillNumber={q} />
      </div>
    </>
  );
}

function CreateAccountModal({ open, onOpenChange, prefillNumber = "" }: { open: boolean; onOpenChange: (v: boolean) => void; prefillNumber?: string }) {
  const nav = useNavigate();
  const [num, setNum] = useState(prefillNumber);
  const [name, setName] = useState("");
  const [dup, setDup] = useState<string | null>(null);

  const save = () => {
    if (!num.trim() || !name.trim()) { toast.error("Number and name required."); return; }
    const existing = accountsStore.get(num.trim());
    if (existing) { setDup(existing.number); return; }
    try {
      const a = accountsStore.create({ number: num, name });
      toast.success("Account created.");
      onOpenChange(false);
      nav({ to: "/accounts/$accountNumber", params: { accountNumber: a.number } });
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to create account.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="glass-panel border-0 sm:max-w-md">
        <DialogHeader><DialogTitle>Create New Account</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <label className="text-xs uppercase tracking-wider text-muted-foreground">Account Number *</label>
            <Input className="mt-1" value={num} onChange={(e) => { setNum(e.target.value); setDup(null); }} />
          </div>
          <div>
            <label className="text-xs uppercase tracking-wider text-muted-foreground">Company Name *</label>
            <Input className="mt-1" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          {dup && (
            <div className="rounded-md border border-gold-glow/40 bg-white/[0.03] p-2 text-xs">
              Account already exists.
              <Button size="sm" variant="ghost" className="ml-2" onClick={() => { onOpenChange(false); nav({ to: "/accounts/$accountNumber", params: { accountNumber: dup } }); }}>
                Open Existing Account
              </Button>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save} style={{ background: "linear-gradient(110deg, oklch(0.4 0.16 240 / 0.7), oklch(0.4 0.18 290 / 0.55))", border: "1px solid oklch(0.78 0.18 220 / 0.45)" }}>
            Create Account
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}