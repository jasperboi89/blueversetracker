import { Link } from "@tanstack/react-router";
import { AlertTriangle, Building2, FileText, StickyNote } from "lucide-react";
import { useTickets, STATUS_LABEL } from "@/lib/tickets-store";
import { accountsStore, useAccounts } from "@/lib/accounts-store";
import { useRecurringRows } from "@/lib/reports/recurring-issues";
import { formatCentralShort } from "@/lib/shift";

/**
 * Read-only account history at hand while working a ticket: recent Hub tickets
 * for the account, recurring-issue status, and the account's templates + notes.
 */
export function AccountMemoryPane({
  accountNumber,
  currentTicketId,
}: {
  accountNumber: string;
  currentTicketId: string;
}) {
  const { tickets } = useTickets();
  useAccounts();
  const rows = useRecurringRows();

  if (!accountNumber) {
    return (
      <div className="text-xs text-muted-foreground">
        No account linked yet. Link an account above to see its history.
      </div>
    );
  }

  const account = accountsStore.get(accountNumber);
  const recent = tickets
    .filter((t) => t.accountNumber === accountNumber && t.id !== currentTicketId)
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, 6);
  const templates = accountsStore.templatesFor(accountNumber);
  const notes = accountsStore.notesFor(accountNumber).slice(0, 4);
  const recurring = rows.find((r) => r.accountNumber === accountNumber);

  return (
    <div className="space-y-3 text-xs">
      <div className="flex items-center gap-1.5">
        <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
        <Link
          to="/accounts/$accountNumber"
          params={{ accountNumber }}
          className="font-medium text-foreground hover:underline"
        >
          {accountNumber}
        </Link>
        <span className="text-muted-foreground">— {account?.name ?? "Unlinked"}</span>
      </div>

      {recurring?.triggered && (
        <div
          className="flex items-start gap-2 rounded-md border p-2"
          style={{
            borderColor: "oklch(0.85 0.16 85 / 0.4)",
            background: "linear-gradient(120deg, oklch(0.85 0.16 85 / 0.12), transparent)",
          }}
        >
          <AlertTriangle
            className="mt-0.5 h-3.5 w-3.5 shrink-0"
            style={{ color: "oklch(0.85 0.16 85)" }}
          />
          <span className="text-foreground/90">
            Recurring issues: {recurring.rollingCount} in 30 days, {recurring.sixMonthCount} total.
            {recurring.active ? " Flagged for review." : ""}
          </span>
        </div>
      )}

      <div>
        <div className="mb-1 text-[10px] uppercase tracking-wider text-muted-foreground">
          Recent Tickets ({recent.length})
        </div>
        <div className="space-y-1">
          {recent.length === 0 && (
            <div className="text-muted-foreground">No other Hub tickets for this account.</div>
          )}
          {recent.map((t) => (
            <Link
              key={t.id}
              to="/freshdesk-tickets/$ticketId/work"
              params={{ ticketId: t.id }}
              className="flex items-center justify-between gap-2 rounded px-1 py-0.5 hover:bg-white/5"
            >
              <span className="truncate text-foreground/90">
                <span className="font-mono text-muted-foreground">#{t.number}</span>{" "}
                {t.details.subject || "Untitled"}
              </span>
              <span className="shrink-0 text-[10px] text-muted-foreground">
                {STATUS_LABEL[t.status]}
              </span>
            </Link>
          ))}
        </div>
      </div>

      {templates.length > 0 && (
        <div>
          <div className="mb-1 flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground">
            <FileText className="h-3 w-3" /> Templates ({templates.length})
          </div>
          <div className="space-y-1">
            {templates.map((tpl) => (
              <div key={tpl.id} className="rounded border border-border/30 bg-white/[0.02] p-1.5">
                <div className="font-medium text-foreground/90">{tpl.name}</div>
                {tpl.expectedFlow && (
                  <div className="truncate text-muted-foreground">{tpl.expectedFlow}</div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {notes.length > 0 && (
        <div>
          <div className="mb-1 flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground">
            <StickyNote className="h-3 w-3" /> Account Notes
          </div>
          <div className="space-y-1">
            {notes.map((n) => (
              <div key={n.id} className="rounded border border-border/30 bg-white/[0.02] p-1.5">
                <div className="mb-0.5 flex items-center justify-between text-[10px] uppercase tracking-wider text-muted-foreground">
                  <span>{n.initials}</span>
                  <span>{formatCentralShort(new Date(n.createdAt))}</span>
                </div>
                <div className="text-foreground/90">{n.text}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
