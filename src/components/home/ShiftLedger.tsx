import { Link } from "@tanstack/react-router";
import { ClipboardList, History, PhoneOutgoing, Ticket } from "lucide-react";
import { formatCentralShort } from "@/lib/shift";
import { alphaMix } from "@/lib/visual-style";
import { formatDuration, useShiftLedger, type LedgerEntry, type LedgerKind } from "@/lib/core/shift-ledger";

const kindMeta: Record<LedgerKind, { label: string; icon: typeof Ticket; color: string }> = {
  freshdesk: { label: "Freshdesk", icon: Ticket, color: "var(--cyan-glow)" },
  dispatch: { label: "Contact Dispatch", icon: PhoneOutgoing, color: "var(--violet-glow)" },
  additional: { label: "Additional Work", icon: ClipboardList, color: "var(--gold-glow)" },
};

/**
 * Unified Shift Ledger — one chronological answer to "what did I actually get
 * done this shift?", derived from the existing authoritative work records.
 */
export function ShiftLedger({ limit = 8 }: { limit?: number }) {
  const { shift, totalMs } = useShiftLedger();
  const rows = shift.slice(0, limit);
  const logged = formatDuration(totalMs);

  return (
    <section className="glass-panel hq-working p-5" data-surface="ledger" aria-label="Shift ledger">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <History className="h-4 w-4" style={{ color: "var(--green-glow)" }} />
          <h2 className="text-sm font-semibold text-foreground">Shift Ledger</h2>
          <span className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
            this shift
          </span>
        </div>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span>
            {shift.length} item{shift.length === 1 ? "" : "s"}
            {logged ? ` · ${logged} logged` : ""}
          </span>
          <Link to="/completed-work" className="underline-offset-2 hover:underline">
            All completed work
          </Link>
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="mt-4 text-xs text-muted-foreground">
          Nothing recorded yet this shift. Completed tickets, dispatch tests and additional work
          land here automatically.
        </p>
      ) : (
        <ol className="mt-3 divide-y divide-border/30">
          {rows.map((e) => (
            <LedgerRow key={e.id} entry={e} />
          ))}
        </ol>
      )}
    </section>
  );
}

function LedgerRow({ entry }: { entry: LedgerEntry }) {
  const m = kindMeta[entry.kind];
  const Icon = m.icon;
  const dur = formatDuration(entry.durationMs);
  const ref = [
    entry.ticketNumber ? `#${entry.ticketNumber}` : null,
    entry.accountNumber ? `Account ${entry.accountNumber}` : null,
    entry.accountName || null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <li className="flex items-center gap-3 py-2.5">
      <span
        className="grid h-8 w-8 shrink-0 place-items-center rounded-lg"
        style={{
          background: `linear-gradient(135deg, ${alphaMix(m.color, 26)}, transparent)`,
          boxShadow: `inset 0 0 0 1px ${alphaMix(m.color, 30)}`,
        }}
      >
        <Icon className="h-3.5 w-3.5" style={{ color: m.color }} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2 text-[11px] text-muted-foreground">
          <span className="font-mono">{formatCentralShort(new Date(entry.at))}</span>
          <span>· {m.label}</span>
          {ref && <span className="truncate">· {ref}</span>}
        </div>
        <div className="truncate text-sm text-foreground">{entry.title}</div>
        <div className="text-[11px] text-muted-foreground">
          {entry.result}
          {dur ? ` · ${dur}` : ""}
        </div>
      </div>
      <Link
        to={entry.to}
        params={entry.params}
        className="shrink-0 rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
      >
        Open
      </Link>
    </li>
  );
}
