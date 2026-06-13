import { useMemo, useState } from "react";
import { CheckCircle2, Download, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useTickets } from "@/lib/tickets-store";
import { useDispatch } from "@/lib/dispatch-store";
import { useAdditionalWork } from "@/lib/additional-work-store";
import { CompletedRow } from "./CompletedRow";
import { buildCompletedCsv, downloadCsv } from "./exportCsv";
import type { CompletedKind, CompletedRecord } from "./types";

type DateRange = "shift" | "7d" | "30d" | "all";

const RANGE_LABEL: Record<DateRange, string> = {
  shift: "This shift",
  "7d": "Last 7 days",
  "30d": "Last 30 days",
  all: "All time",
};

function shiftStartMs(now = Date.now()): number {
  // Treat "this shift" as last 16 hours — covers a typical overnight window
  return now - 16 * 60 * 60 * 1000;
}

function dayKey(ts: number): string {
  const d = new Date(ts);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const ymd = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diff = Math.round((today.getTime() - ymd) / (24 * 60 * 60 * 1000));
  if (diff === 0) return "Today";
  if (diff === 1) return "Yesterday";
  return d.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
}

export function CompletedWorkPage() {
  const { tickets } = useTickets();
  const { sessions } = useDispatch();
  const { items: workItems } = useAdditionalWork();

  const [tab, setTab] = useState<"all" | CompletedKind>("all");
  const [q, setQ] = useState("");
  const [range, setRange] = useState<DateRange>("30d");

  const all: CompletedRecord[] = useMemo(() => {
    const fd: CompletedRecord[] = tickets
      .filter((t) => t.status === "completed" && t.completedAt)
      .map((t) => ({
        id: `fd-${t.id}`,
        kind: "freshdesk",
        title: t.details.subject || `Ticket #${t.number}`,
        accountNumber: t.accountNumber,
        accountName: t.accountName,
        ticketNumber: t.number,
        completedAt: t.completedAt!,
        sourceId: t.id,
      }));
    const ds: CompletedRecord[] = sessions
      .filter((s) => s.status === "ready" && s.completedAt)
      .map((s) => ({
        id: `ds-${s.id}`,
        kind: "dispatch",
        title: s.accountName || "Dispatch Session",
        accountNumber: s.accountNumber,
        accountName: s.accountName,
        ticketNumber: s.ticketNumber,
        completedAt: s.completedAt!,
        sourceId: s.id,
      }));
    const aw: CompletedRecord[] = workItems
      .filter((w) => w.status === "completed" && w.completedAt)
      .map((w) => ({
        id: `aw-${w.id}`,
        kind: "additional",
        title: w.title,
        accountNumber: w.accountNumber,
        accountName: w.accountName,
        completedAt: w.completedAt!,
        sourceId: w.id,
      }));
    return [...fd, ...ds, ...aw];
  }, [tickets, sessions, workItems]);

  const counts = useMemo(
    () => ({
      all: all.length,
      freshdesk: all.filter((r) => r.kind === "freshdesk").length,
      dispatch: all.filter((r) => r.kind === "dispatch").length,
      additional: all.filter((r) => r.kind === "additional").length,
    }),
    [all],
  );

  const filtered = useMemo(() => {
    const now = Date.now();
    const cutoff =
      range === "shift"
        ? shiftStartMs(now)
        : range === "7d"
          ? now - 7 * 24 * 60 * 60 * 1000
          : range === "30d"
            ? now - 30 * 24 * 60 * 60 * 1000
            : 0;
    const term = q.trim().toLowerCase();
    return all
      .filter((r) => (tab === "all" ? true : r.kind === tab))
      .filter((r) => r.completedAt >= cutoff)
      .filter((r) => {
        if (!term) return true;
        return (
          r.title.toLowerCase().includes(term) ||
          (r.accountNumber ?? "").toLowerCase().includes(term) ||
          (r.accountName ?? "").toLowerCase().includes(term) ||
          (r.ticketNumber ?? "").toLowerCase().includes(term)
        );
      })
      .sort((a, b) => b.completedAt - a.completedAt);
  }, [all, tab, q, range]);

  const grouped = useMemo(() => {
    const groups = new Map<string, CompletedRecord[]>();
    for (const r of filtered) {
      const k = dayKey(r.completedAt);
      const arr = groups.get(k) ?? [];
      arr.push(r);
      groups.set(k, arr);
    }
    return Array.from(groups.entries());
  }, [filtered]);

  const onExport = () => {
    const csv = buildCompletedCsv(filtered);
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
    downloadCsv(`completed-work-${stamp}.csv`, csv);
  };

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-5">
      <header className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <div
            className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl"
            style={{
              background:
                "linear-gradient(135deg, oklch(0.78 0.18 220 / 0.4), oklch(0.7 0.22 295 / 0.4))",
              boxShadow: "0 0 22px var(--green-glow), inset 0 1px 0 oklch(1 0 0 / 0.2)",
            }}
          >
            <CheckCircle2 className="h-5 w-5 text-white" />
          </div>
          <div className="min-w-0">
            <h1 className="truncate text-xl font-semibold text-foreground">Completed Work</h1>
            <p className="text-xs text-muted-foreground">
              {filtered.length} {filtered.length === 1 ? "record" : "records"} · {RANGE_LABEL[range]}
            </p>
          </div>
        </div>
        <Button variant="ghost" size="sm" onClick={onExport} disabled={filtered.length === 0}>
          <Download className="mr-1.5 h-3.5 w-3.5" /> Export CSV
        </Button>
      </header>

      <div className="glass-panel p-4">
        <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
          <TabsList className="grid w-full grid-cols-4 bg-white/5">
            <TabsTrigger value="all">All ({counts.all})</TabsTrigger>
            <TabsTrigger value="freshdesk">Freshdesk ({counts.freshdesk})</TabsTrigger>
            <TabsTrigger value="dispatch">Dispatch ({counts.dispatch})</TabsTrigger>
            <TabsTrigger value="additional">Additional ({counts.additional})</TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="mt-4 grid gap-3 md:grid-cols-[1fr_180px]">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search ticket #, account, or title"
              className="pl-8"
            />
          </div>
          <Select value={range} onValueChange={(v) => setRange(v as DateRange)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="shift">This shift</SelectItem>
              <SelectItem value="7d">Last 7 days</SelectItem>
              <SelectItem value="30d">Last 30 days</SelectItem>
              <SelectItem value="all">All time</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="mt-4">
          {filtered.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">
              Nothing matches the current filters.
            </div>
          ) : (
            <div className="space-y-5">
              {grouped.map(([label, rows]) => (
                <section key={label}>
                  <div className="mb-1 text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                    {label}
                  </div>
                  <div className="divide-y divide-border/30">
                    {rows.map((r) => (
                      <CompletedRow key={r.id} item={r} />
                    ))}
                  </div>
                </section>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}