import { useMemo, useState } from "react";
import { CalendarClock, CheckCircle2, Plus, ShieldAlert, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAccounts } from "@/lib/accounts-store";
import {
  COVERAGE_LOOKAHEAD_DAYS, coverageActions, useCoverage, useCoverageGaps,
} from "@/lib/coverage/coverage-store";
import { formatHolidayDate, upcomingHolidays } from "@/lib/coverage/holidays";

const SEV_COLOR = {
  critical: "oklch(0.72 0.22 25)",
  warning: "var(--gold-glow)",
} as const;

/** Holiday & on-call coverage: what still needs confirming before the day arrives. */
export function CoveragePanel() {
  const { accounts: watched, confirmations } = useCoverage();
  const gaps = useCoverageGaps();
  const { accounts: allAccounts } = useAccounts();
  const [adding, setAdding] = useState(false);
  const [num, setNum] = useState("");
  const [name, setName] = useState("");

  const holidays = useMemo(() => upcomingHolidays(COVERAGE_LOOKAHEAD_DAYS), []);

  const add = () => {
    const trimmed = num.trim();
    if (!trimmed) return;
    const match = allAccounts.find((a) => a.number === trimmed);
    coverageActions.watch(trimmed, name.trim() || match?.name || "");
    setNum("");
    setName("");
    setAdding(false);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <CalendarClock className="h-4 w-4" style={{ color: "var(--gold-glow)" }} />
          <h3 className="text-sm font-semibold text-foreground">Coverage watch</h3>
          {gaps.length > 0 && (
            <span
              className="rounded-full border px-1.5 py-0.5 text-[10px] uppercase tracking-wider"
              style={{
                color: SEV_COLOR[gaps[0].severity],
                borderColor: `color-mix(in oklab, ${SEV_COLOR[gaps[0].severity]} 45%, transparent)`,
              }}
            >
              {gaps.length} to confirm
            </span>
          )}
        </div>
        <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setAdding((v) => !v)}>
          <Plus className="mr-1 h-3.5 w-3.5" /> Watch account
        </Button>
      </div>

      {adding && (
        <div className="grid gap-2 rounded-md border border-border/40 bg-white/[0.02] p-3 sm:grid-cols-[140px_1fr_auto]">
          <div>
            <Label className="text-xs">Account #</Label>
            <Input value={num} onChange={(e) => setNum(e.target.value)} placeholder="7431" />
          </div>
          <div>
            <Label className="text-xs">Name (optional)</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Client name" />
          </div>
          <div className="flex items-end">
            <Button size="sm" onClick={add}>Add</Button>
          </div>
        </div>
      )}

      {watched.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          Add the accounts with holiday hours or an on-call rotation. You'll get a heads-up here
          before each holiday and when a rotation is about to run out.
        </p>
      ) : (
        <>
          {gaps.length === 0 ? (
            <p className="inline-flex items-center gap-1.5 text-xs" style={{ color: "var(--green-glow)" }}>
              <CheckCircle2 className="h-3.5 w-3.5" /> All watched accounts are covered for the next{" "}
              {COVERAGE_LOOKAHEAD_DAYS} days.
            </p>
          ) : (
            <div className="space-y-1.5">
              {gaps.slice(0, 8).map((g) => (
                <div
                  key={g.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border/30 bg-white/[0.02] px-3 py-2"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2 text-sm text-foreground">
                      <ShieldAlert className="h-3.5 w-3.5" style={{ color: SEV_COLOR[g.severity] }} />
                      <span className="font-medium">{g.label}</span>
                      <span className="text-xs text-muted-foreground">
                        Account {g.accountNumber}
                        {g.accountName ? ` · ${g.accountName}` : ""}
                      </span>
                    </div>
                    <div className="mt-0.5 text-[11px] text-muted-foreground">
                      {formatHolidayDate(g.date)} ·{" "}
                      {g.daysAway < 0
                        ? `${Math.abs(g.daysAway)} day${Math.abs(g.daysAway) === 1 ? "" : "s"} overdue`
                        : g.daysAway === 0
                          ? "today"
                          : `in ${g.daysAway} day${g.daysAway === 1 ? "" : "s"}`}
                    </div>
                  </div>
                  {g.kind === "holiday" && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 text-xs"
                      onClick={() => coverageActions.confirmHoliday(g.accountNumber, g.date)}
                    >
                      <CheckCircle2 className="mr-1 h-3.5 w-3.5" /> Confirmed
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}

          <div className="space-y-2 pt-1">
            {watched.map((a) => {
              const confirmedCount = holidays.filter((h) =>
                confirmations.some((c) => c.id === `${a.number}:${h.date}`),
              ).length;
              return (
                <div
                  key={a.number}
                  className="flex flex-wrap items-center gap-2 rounded-md border border-border/25 px-3 py-2"
                >
                  <span className="text-xs font-medium text-foreground">
                    {a.number}
                    {a.name ? ` · ${a.name}` : ""}
                  </span>
                  <span className="text-[11px] text-muted-foreground">
                    {confirmedCount}/{holidays.length} upcoming holidays confirmed
                  </span>
                  <div className="ml-auto flex items-center gap-2">
                    <Label className="text-[11px] text-muted-foreground">On-call good through</Label>
                    <Input
                      type="date"
                      className="h-7 w-[150px] text-xs"
                      value={a.onCallThrough ?? ""}
                      onChange={(e) =>
                        coverageActions.setOnCall(a.number, { onCallThrough: e.target.value })
                      }
                    />
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7"
                      onClick={() => coverageActions.unwatch(a.number)}
                      aria-label={`Stop watching account ${a.number}`}
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}