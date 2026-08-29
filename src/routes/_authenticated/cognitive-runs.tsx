import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Brain } from "lucide-react";
import { AgentRunInspector } from "@/components/cognitive/AgentRunInspector";
import { RunBadge, fmtDuration, fmtWhen, guardianTone, statusTone } from "@/components/cognitive/run-ui";
import {
  filterRuns,
  runStatusLabel,
  summarizeRun,
  useCognitiveRuns,
  visibleRuns,
  type CognitiveRunSummary,
  type RunFilters,
} from "@/lib/cognitive/run-store";
import { useHubIdentity, useIsAdmin } from "@/lib/auth/role-context";

export const Route = createFileRoute("/_authenticated/cognitive-runs")({
  head: () => ({
    meta: [
      { title: "Cognitive Runs — Account Intel Hub" },
      {
        name: "description",
        content:
          "Inspect how the portal routed, critiqued and governed an orchestrated cognitive run: waves, workers, claims, Guardian decision and stop reason.",
      },
      { property: "og:title", content: "Cognitive Runs — Account Intel Hub" },
      {
        property: "og:description",
        content: "Operator-facing observability for orchestrated cognitive runs: routing, workers, Critic, Guardian, budgets and stop reasons.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CognitiveRunsPage,
});

/** Bounded page size — the list never hydrates worker contributions. */
const PAGE_SIZE = 20;

function CognitiveRunsPage() {
  const identity = useHubIdentity();
  const isAdmin = useIsAdmin();
  const all = useCognitiveRuns();

  const scoped = useMemo(() => visibleRuns(all, identity.userId, isAdmin), [all, identity.userId, isAdmin]);
  const summaries = useMemo(() => scoped.map(summarizeRun), [scoped]);

  const [filters, setFilters] = useState<RunFilters>({});
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [selected, setSelected] = useState<string | null>(null);

  const filtered = useMemo(() => filterRuns(summaries, filters), [summaries, filters]);
  const page = filtered.slice(0, limit);
  const run = selected ? scoped.find((r) => r.correlationId === selected) : undefined;

  const options = useMemo(
    () => ({
      status: unique(summaries.map((s) => s.state)),
      worker: unique(summaries.flatMap((s) => s.workers)),
      intentClass: unique(summaries.map((s) => s.intentClass)),
      guardianDecision: unique(summaries.map((s) => s.guardianDecision).filter(Boolean) as string[]),
      accountId: unique(summaries.map((s) => s.accountId).filter(Boolean) as string[]),
      stopReason: unique(summaries.map((s) => s.stopReason)),
      tier: unique(summaries.map((s) => s.cognitionTier)),
    }),
    [summaries],
  );

  return (
    <div className="space-y-4 p-4">
      <header className="glass-panel flex items-center gap-4 p-5">
        <div
          className="grid h-12 w-12 place-items-center rounded-2xl"
          style={{
            background: "linear-gradient(135deg, oklch(0.78 0.18 220 / 0.35), oklch(0.7 0.22 295 / 0.35))",
          }}
        >
          <Brain className="h-5 w-5 text-white" aria-hidden />
        </div>
        <div>
          <h1 className="text-xl font-semibold text-foreground">Cognitive Runs</h1>
          <p className="text-sm text-muted-foreground">
            How cognition routed and was governed — routing, waves, workers, Critic, Guardian, budgets and stop reason.
            Private reasoning is never recorded here.
          </p>
        </div>
      </header>

      <ActionCenter operatorRef={identity.userId} role={identity.role} />

      <Filters options={options} filters={filters} onChange={setFilters} />


      <div className="grid gap-4 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
        <section aria-label="Cognitive run list" className="space-y-2">
          {summaries.length === 0 ? (
            <p className="rounded-lg border border-border/40 bg-white/[0.02] p-4 text-sm text-muted-foreground">
              No cognitive runs have been recorded yet.
            </p>
          ) : page.length === 0 ? (
            <p className="rounded-lg border border-border/40 bg-white/[0.02] p-4 text-sm text-muted-foreground">
              No runs match these filters.
            </p>
          ) : (
            <ul className="space-y-2">
              {page.map((s) => (
                <li key={s.correlationId}>
                  <RunRow summary={s} selected={s.correlationId === selected} onSelect={setSelected} />
                </li>
              ))}
            </ul>
          )}
          {filtered.length > limit && (
            <button
              type="button"
              onClick={() => setLimit((n) => n + PAGE_SIZE)}
              className="w-full rounded border border-border/40 px-2 py-1 text-xs text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
            >
              Load {Math.min(PAGE_SIZE, filtered.length - limit)} more
            </button>
          )}
        </section>

        <section aria-label="Run inspector">
          {run ? (
            <AgentRunInspector run={run} />
          ) : (
            <p className="rounded-lg border border-border/40 bg-white/[0.02] p-4 text-sm text-muted-foreground">
              Select a run to inspect its route, workers, critique, governance decision and stop reason.
            </p>
          )}
        </section>
      </div>
    </div>
  );
}

function RunRow({
  summary: s,
  selected,
  onSelect,
}: {
  summary: CognitiveRunSummary;
  selected: boolean;
  onSelect: (id: string) => void;
}) {
  return (
    <button
      type="button"
      aria-current={selected ? "true" : undefined}
      onClick={() => onSelect(s.correlationId)}
      className={`w-full rounded-lg border p-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 ${
        selected ? "border-sky-500/50 bg-sky-500/5" : "border-border/40 bg-white/[0.02] hover:border-border"
      }`}
    >
      <div className="flex flex-wrap items-center gap-1.5">
        <RunBadge tone={statusTone(s.state)}>{runStatusLabel(s.state)}</RunBadge>
        <RunBadge>{s.intentClass.toUpperCase()}</RunBadge>
        <RunBadge tone="info">{s.cognitionTier.toUpperCase()}</RunBadge>
        {s.guardianDecision && <RunBadge tone={guardianTone(s.guardianDecision)}>{s.guardianDecision}</RunBadge>}
      </div>
      <p className="mt-1 truncate text-xs text-foreground/90">{s.route}</p>
      <p className="mt-0.5 text-[10px] text-muted-foreground">
        {fmtWhen(s.startedAt)} · {fmtDuration(s.durationMs)} · stop {s.stopReason.replace(/_/g, " ")}
        {s.accountId ? ` · account ${s.accountId}` : ""}
      </p>
      <p className="truncate font-mono text-[10px] text-muted-foreground">{s.correlationId}</p>
    </button>
  );
}

function Filters({
  options,
  filters,
  onChange,
}: {
  options: Record<string, string[]>;
  filters: RunFilters;
  onChange: (f: RunFilters) => void;
}) {
  const set = (key: keyof RunFilters, value: string) =>
    onChange({ ...filters, [key]: value || undefined });

  return (
    <div className="flex flex-wrap items-end gap-2 rounded-lg border border-border/40 bg-white/[0.02] p-3">
      <label className="flex flex-col gap-1 text-[10px] uppercase tracking-wide text-muted-foreground">
        Search
        <input
          type="search"
          value={filters.query ?? ""}
          onChange={(e) => set("query", e.target.value)}
          placeholder="correlation id, account, worker"
          className="w-56 rounded border border-border/50 bg-black/20 px-2 py-1 text-xs text-foreground"
        />
      </label>
      {(
        [
          ["status", "Status"],
          ["worker", "Worker"],
          ["intentClass", "Intent"],
          ["guardianDecision", "Guardian"],
          ["accountId", "Account"],
          ["stopReason", "Stop reason"],
          ["tier", "Tier"],
        ] as Array<[keyof RunFilters, string]>
      ).map(([key, label]) => (
        <label key={key} className="flex flex-col gap-1 text-[10px] uppercase tracking-wide text-muted-foreground">
          {label}
          <select
            value={(filters[key] as string) ?? ""}
            onChange={(e) => set(key, e.target.value)}
            className="rounded border border-border/50 bg-black/20 px-2 py-1 text-xs text-foreground"
          >
            <option value="">Any</option>
            {(options[key] ?? []).map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </label>
      ))}
      <label className="flex flex-col gap-1 text-[10px] uppercase tracking-wide text-muted-foreground">
        Time range
        <select
          value={filters.sinceMs ? String(filters.sinceMs) : ""}
          onChange={(e) => onChange({ ...filters, sinceMs: e.target.value ? Number(e.target.value) : undefined })}
          className="rounded border border-border/50 bg-black/20 px-2 py-1 text-xs text-foreground"
        >
          <option value="">All retained</option>
          <option value={3_600_000}>Last hour</option>
          <option value={86_400_000}>Last 24 hours</option>
        </select>
      </label>
    </div>
  );
}

function unique(list: string[]): string[] {
  return Array.from(new Set(list)).sort();
}
