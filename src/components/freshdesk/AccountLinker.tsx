import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { AlertTriangle, Pencil, RefreshCw, X, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { accountsStore } from "@/lib/accounts-store";
import { ticketsStore, type Ticket } from "@/lib/tickets-store";
import { toast } from "sonner";

export function AccountLinker({ ticket }: { ticket: Ticket }) {
  const [editing, setEditing] = useState(false);
  const [num, setNum] = useState(ticket.accountNumber || "");
  // Pre-fill the new-account name from whatever company context the ticket
  // carries (e.g. the "Dr. Movassaghi's" half of the Freshdesk company field),
  // so the create option is ready to confirm rather than blank.
  const prefillName =
    !ticket.accountNumber && ticket.accountName && ticket.accountName !== "Unlinked Account"
      ? ticket.accountName
      : "";
  const [name, setName] = useState(prefillName);
  const [busy, setBusy] = useState(false);
  const [confirmReplace, setConfirmReplace] = useState(false);

  const linked = !!ticket.accountNumber;
  const existing = num.trim() ? accountsStore.get(num.trim()) : undefined;
  const isValid = /^\d{3,8}$/.test(num.trim());
  const willCreate = isValid && !existing;

  const save = () => {
    setBusy(true);
    const res = ticketsStore.setAccountNumber(ticket.id, num.trim(), name.trim() || undefined);
    setBusy(false);
    if (!res.ok) {
      toast.error(res.error ?? "Could not link account.");
      return;
    }
    toast.success(
      res.created
        ? `Account ${num.trim()} created and linked.`
        : `Linked to account ${num.trim()}.`,
    );
    setEditing(false);
    setConfirmReplace(false);
    setName("");
  };

  const refresh = async () => {
    setBusy(true);
    const res = await ticketsStore.refreshAccountFromFreshdesk(ticket.id);
    setBusy(false);
    if (!res.ok) {
      toast.error(res.error ?? "Refresh failed.");
      return;
    }
    if (!res.found) {
      toast.message("Freshdesk has no account number for this ticket.");
      return;
    }
    toast.success("Account refreshed from Freshdesk.");
  };

  if (linked && !editing) {
    return (
      <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
        <span>Account</span>
        <Link
          to="/accounts/$accountNumber"
          params={{ accountNumber: ticket.accountNumber }}
          className="font-medium tabular-nums text-foreground underline-offset-2 hover:underline"
        >
          {ticket.accountNumber}
        </Link>
        <span>— {ticket.accountName}</span>
        {ticket.accountSource === "manual" && (
          <span className="rounded-full border border-border/40 px-1.5 py-0.5 text-[9px] uppercase tracking-wider">
            Manual
          </span>
        )}
        <Button
          size="sm"
          variant="ghost"
          className="h-6 px-1.5"
          onClick={() => {
            setNum(ticket.accountNumber);
            setEditing(true);
          }}
        >
          <Pencil className="h-3 w-3" />
        </Button>
        <Button size="sm" variant="ghost" className="h-6 px-1.5" onClick={refresh} disabled={busy}>
          <RefreshCw className="mr-1 h-3 w-3" /> Refresh from Freshdesk
        </Button>
      </div>
    );
  }

  // No account linked → warning panel + editor; or editing existing
  return (
    <div
      className="mt-1 rounded-md border p-2.5 text-xs"
      style={{
        borderColor: linked ? "oklch(0.78 0.18 220 / 0.4)" : "oklch(0.85 0.16 85 / 0.4)",
        background: linked
          ? "linear-gradient(120deg, oklch(0.78 0.18 220 / 0.08), oklch(0.7 0.22 295 / 0.06))"
          : "linear-gradient(120deg, oklch(0.85 0.16 85 / 0.14), oklch(0.85 0.16 210 / 0.08))",
      }}
    >
      {!linked && (
        <div className="mb-2 flex items-start gap-2 text-foreground/90">
          <AlertTriangle
            className="mt-0.5 h-3.5 w-3.5 shrink-0"
            style={{ color: "oklch(0.85 0.16 85)" }}
          />
          <span>
            No account number found from Freshdesk. Enter one manually to link this ticket to an
            account.
          </span>
        </div>
      )}
      {linked && ticket.accountSource === "manual" && !confirmReplace && (
        <div className="mb-2 text-foreground/80">
          This ticket has a manually entered account number. Replacing it will lose the current
          link.
          <div className="mt-1.5 flex gap-1.5">
            <Button
              size="sm"
              variant="ghost"
              className="h-7"
              onClick={() => setConfirmReplace(true)}
            >
              Replace Account Number
            </Button>
            <Button size="sm" variant="ghost" className="h-7" onClick={() => setEditing(false)}>
              Cancel
            </Button>
          </div>
        </div>
      )}
      {(!linked || ticket.accountSource !== "manual" || confirmReplace) && (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <Input
              value={num}
              onChange={(e) => setNum(e.target.value.replace(/[^0-9]/g, "").slice(0, 8))}
              inputMode="numeric"
              placeholder="Account number"
              className="h-8 w-36 text-xs"
              autoFocus
            />
            {willCreate && (
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Account name (new)"
                className="h-8 w-56 text-xs"
              />
            )}
            <Button size="sm" className="h-8" onClick={save} disabled={!isValid || busy}>
              <Check className="mr-1 h-3 w-3" />
              {willCreate ? "Create & Link" : "Link Account"}
            </Button>
            {editing && (
              <Button
                size="sm"
                variant="ghost"
                className="h-8"
                onClick={() => {
                  setEditing(false);
                  setConfirmReplace(false);
                }}
              >
                <X className="h-3 w-3" />
              </Button>
            )}
          </div>
          {num.trim() && !isValid && (
            <div className="text-[11px]" style={{ color: "oklch(0.85 0.16 50)" }}>
              Account number must be 3–8 digits.
            </div>
          )}
          {isValid && existing && (
            <div className="text-[11px] text-muted-foreground">
              Will link to existing account:{" "}
              <span className="text-foreground">{existing.name}</span>
            </div>
          )}
          {willCreate && (
            <div className="text-[11px] text-muted-foreground">
              No matching account found. A new account profile will be created.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
