import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { GitCompareArrows, Plus, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatCentralShort } from "@/lib/shift";
import {
  CHANGE_STATUS_LABELS, CHANGE_TYPE_LABELS, CHECKLIST_PRESETS,
} from "@/lib/changes/change-types";
import {
  createChangeRecord, listChangeRecords, type AccountChangeRecord,
} from "@/lib/changes/changes.functions";
import { ChangeRecordDialog } from "./ChangeRecordDialog";

const RISK_COLOR: Record<string, string> = {
  low: "var(--green-glow)",
  medium: "var(--gold-glow)",
  high: "oklch(0.72 0.22 25)",
};

export function ChangeRecordsPanel({
  accountNumber,
  accountName,
  ticketNumber,
  compact,
}: {
  accountNumber?: string;
  accountName?: string;
  ticketNumber?: string;
  compact?: boolean;
}) {
  const [records, setRecords] = useState<AccountChangeRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<AccountChangeRecord | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await listChangeRecords({
        data: {
          ...(accountNumber ? { accountNumber } : {}),
          ...(!accountNumber && ticketNumber ? { ticketNumber } : {}),
        },
      });
      setRecords(result.records);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load change records.");
    } finally {
      setLoading(false);
    }
  }, [accountNumber, ticketNumber]);

  useEffect(() => {
    void load();
  }, [load]);

  const create = async () => {
    try {
      const record = await createChangeRecord({
        data: {
          accountNumber: accountNumber ?? "",
          accountName: accountName ?? "",
          ticketNumber: ticketNumber ?? "",
          checklist: CHECKLIST_PRESETS.other.map((label, i) => ({
            id: `other-${i}`,
            label,
            done: false,
          })),
        },
      });
      setRecords((cur) => [record, ...cur]);
      setEditing(record);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not create a change record.");
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <GitCompareArrows className="h-4 w-4" style={{ color: "var(--cyan-glow)" }} />
          <h3 className="text-sm font-semibold text-foreground">Change records</h3>
        </div>
        <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => void create()}>
          <Plus className="mr-1 h-3.5 w-3.5" /> Log a change
        </Button>
      </div>

      {loading ? (
        <p className="text-xs text-muted-foreground">Loading…</p>
      ) : error ? (
        <p className="text-xs text-destructive">{error}</p>
      ) : records.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          Nothing logged yet. Record what you changed, why, and how to undo it — it takes 30 seconds
          and saves the next person an hour.
        </p>
      ) : (
        <div className="space-y-2">
          {(compact ? records.slice(0, 5) : records).map((r) => {
            const done = r.checklist.filter((c) => c.done).length;
            return (
              <button
                key={r.id}
                type="button"
                onClick={() => setEditing(r)}
                className="w-full rounded-md border border-border/30 bg-white/[0.02] p-3 text-left transition-colors hover:border-border/60"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium text-foreground">{r.title}</span>
                  <span
                    className="rounded-full border px-1.5 py-0.5 text-[10px] uppercase tracking-wider"
                    style={{
                      color: RISK_COLOR[r.risk],
                      borderColor: `color-mix(in oklab, ${RISK_COLOR[r.risk]} 45%, transparent)`,
                    }}
                  >
                    {r.risk} risk
                  </span>
                  <span className="rounded-full border border-border/40 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">
                    {CHANGE_STATUS_LABELS[r.status]}
                  </span>
                </div>
                <div className="mt-0.5 text-xs text-muted-foreground">
                  {CHANGE_TYPE_LABELS[r.changeType]}
                  {r.accountNumber && !accountNumber ? ` · Account ${r.accountNumber}` : ""}
                  {r.ticketNumber ? ` · #${r.ticketNumber}` : ""}
                  {r.requester ? ` · from ${r.requester}` : ""}
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-[10px] text-muted-foreground">
                  <span>{formatCentralShort(new Date(r.createdAt))}</span>
                  {r.checklist.length > 0 && (
                    <span>
                      checks {done}/{r.checklist.length}
                    </span>
                  )}
                  {!r.rollbackNote && (
                    <span className="inline-flex items-center gap-1" style={{ color: "var(--gold-glow)" }}>
                      <ShieldAlert className="h-3 w-3" /> no rollback noted
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}

      <ChangeRecordDialog
        record={editing}
        open={Boolean(editing)}
        onOpenChange={(open) => !open && setEditing(null)}
        onSaved={(saved) =>
          setRecords((cur) => cur.map((r) => (r.id === saved.id ? saved : r)))
        }
        onDeleted={(id) => setRecords((cur) => cur.filter((r) => r.id !== id))}
      />
    </div>
  );
}