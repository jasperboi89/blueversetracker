import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  AlertTriangle,
  GitBranch,
  History,
  Layers,
  Route as RouteIcon,
  ScanSearch,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { listIsScriptEntries } from "@/lib/is-scripts/is-scripts.functions";
import {
  listScriptVersions,
  recordScriptVersion,
} from "@/lib/script/script-versions.functions";
import { ingestScript } from "@/lib/script/script-ingest";
import { diffStructures } from "@/lib/script/script-diff";
import { analyzeChangeImpact } from "@/lib/script/change-impact";
import { buildRegressionSuite } from "@/lib/script/test-intelligence";
import { analyzeHistory } from "@/lib/script/script-history";
import { enumerateStaticPaths } from "@/lib/script/script-simulation";
import { MIN_TRUSTED_COVERAGE } from "@/lib/script/script-contract";
import { aiScriptReasoning } from "@/lib/ai/ai.functions";
import { eventSpine } from "@/lib/core/event-spine";

/**
 * Dependency Cortex — the operator surface for Phase 4 Script Intelligence.
 *
 * Everything shown here is OBSERVE / EXPLAIN / RECOMMEND / PREPARE. There is no
 * control on this pane that edits or deploys a script, and every panel that
 * relies on incomplete extraction says so rather than presenting a confident
 * answer over a partly-understood script.
 */
export function DependencyCortexPane() {
  const [scriptId, setScriptId] = useState<string>("");
  const queryClient = useQueryClient();

  const listEntries = useServerFn(listIsScriptEntries);
  const listVersions = useServerFn(listScriptVersions);
  const recordVersion = useServerFn(recordScriptVersion);

  const entriesQuery = useQuery({
    queryKey: ["is-script-entries"],
    queryFn: () => listEntries(),
  });

  const entries = useMemo(
    () =>
      (entriesQuery.data?.entries ?? []).filter(
        (e) => !e.isArchived && e.scriptBody.trim().length > 0,
      ),
    [entriesQuery.data],
  );

  const selected = entries.find((e) => e.id === scriptId);

  const versionsQuery = useQuery({
    queryKey: ["script-versions", scriptId],
    queryFn: () => listVersions({ data: { scriptId, limit: 20 } }),
    enabled: Boolean(scriptId),
  });

  const record = useMutation({
    mutationFn: () =>
      recordVersion({
        data: {
          scriptId,
          kind: selected?.kind ?? "is_script",
          title: selected?.title ?? "",
          source: selected?.scriptBody ?? "",
        },
      }),
    onSuccess: (result) => {
      if (result.created) {
        // Structural reference only — the ledger never receives script source.
        eventSpine.emit({
          type: "script.version_recorded",
          source: "script",
          metadata: {
            entityType: "script",
            entityId: scriptId,
            scriptVersion: result.version.versionNumber,
            structureFingerprint: result.version.structureFingerprint,
            complexityBand: result.version.complexity.band,
            count: result.version.complexity.componentCount,
          },
        });
      }
      toast.success(
        result.created
          ? `Recorded version ${result.version.versionNumber}`
          : "No change since the last recorded version",
      );
      void queryClient.invalidateQueries({ queryKey: ["script-versions", scriptId] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  // Live analysis of the current body — this is what the operator is looking at
  // right now, whether or not it has been recorded yet.
  const analysis = useMemo(
    () => (selected ? ingestScript(selected.scriptBody) : null),
    [selected],
  );

  const versions = versionsQuery.data ?? [];
  const previous = versions[0];

  const derived = useMemo(() => {
    if (!analysis) return null;
    const diff = previous
      ? diffStructures(previous.structure, analysis.structure)
      : diffStructures(
          { components: [], dependencies: [], unknowns: [], lineCount: 0, recognizedLines: 0 },
          analysis.structure,
        );
    const impact = analyzeChangeImpact(analysis.structure, diff);
    return {
      diff,
      impact,
      suite: buildRegressionSuite(analysis.structure, diff, impact),
      paths: enumerateStaticPaths(analysis.structure),
      history: analyzeHistory(versions),
    };
  }, [analysis, previous, versions]);

  /**
   * Structural facts only — component names, edge kinds and diff/impact counts
   * that already passed through redaction. Script source never leaves here.
   */
  const facts = useMemo(() => {
    if (!analysis || !derived) return "";
    const s = analysis.structure;
    return [
      `components=${analysis.complexity.componentCount} branches=${analysis.complexity.branchCount} dependencies=${analysis.complexity.dependencyCount} maxDepth=${analysis.complexity.maxDepth} loops=${analysis.complexity.cycleCount} band=${analysis.complexity.band}`,
      `drivers: ${analysis.complexity.drivers.join("; ") || "none"}`,
      "COMPONENTS:",
      ...s.components.slice(0, 120).map((c) => `- ${c.kind}: ${c.name}`),
      "DEPENDENCIES:",
      ...s.dependencies
        .slice(0, 160)
        .map((d) => `- ${d.fromId} --${d.kind}--> ${d.toKey} (${d.resolution})`),
      `DIFF: added=${derived.diff.counts.componentsAdded} removed=${derived.diff.counts.componentsRemoved} modified=${derived.diff.counts.componentsModified} identical=${derived.diff.structurallyIdentical}`,
      `IMPACT: ${derived.impact.impacted.slice(0, 20).map((h) => `${h.name} (${h.relation})`).join("; ") || "none"}`,
      `CAVEATS: ${derived.impact.caveats.join("; ") || "none"}`,
      `UNKNOWN LINES: ${s.unknowns.length}`,
    ].join("\n");
  }, [analysis, derived]);

  const reason = useMutation({
    mutationFn: () =>
      aiScriptReasoning({
        data: {
          title: selected?.title ?? "",
          kind: selected?.kind ?? "script",
          coverage: analysis?.complexity.coverage ?? 0,
          facts,
        },
      }),
    onError: (error: Error) => toast.error(error.message),
  });
  const reasoning = reason.data?.ok ? reason.data.reasoning : null;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Select value={scriptId} onValueChange={setScriptId}>
          <SelectTrigger className="h-9 w-[280px] text-xs">
            <SelectValue placeholder="Choose a script entry to analyse" />
          </SelectTrigger>
          <SelectContent>
            {entries.map((entry) => (
              <SelectItem key={entry.id} value={entry.id}>
                {entry.title || "Untitled script"}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button
          size="sm"
          variant="outline"
          disabled={!selected || record.isPending}
          onClick={() => record.mutate()}
        >
          <ScanSearch className="mr-2 h-3.5 w-3.5" />
          {record.isPending ? "Recording…" : "Record structural snapshot"}
        </Button>
      </div>

      {!selected ? (
        <EmptyState
          text={
            entries.length === 0
              ? "No script entries with a script body yet. Add one under Entries first."
              : "Select a script entry to see its components, dependencies, and change impact."
          }
        />
      ) : !analysis || !derived ? null : (
        <div className="grid gap-3 lg:grid-cols-2">
          <Panel icon={Layers} title="Structure">
            <div className="flex flex-wrap gap-1.5">
              <Stat label="components" value={analysis.complexity.componentCount} />
              <Stat label="branches" value={analysis.complexity.branchCount} />
              <Stat label="dependencies" value={analysis.complexity.dependencyCount} />
              <Stat label="max depth" value={analysis.complexity.maxDepth} />
              <Stat label="loops" value={analysis.complexity.cycleCount} />
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Complexity band:{" "}
              <span className="font-medium text-foreground">{analysis.complexity.band}</span> —{" "}
              {analysis.complexity.drivers.join(", ")}
            </p>
            <CoverageNote
              coverage={analysis.complexity.coverage}
              unknowns={analysis.complexity.unknownCount}
            />
            {Object.entries(analysis.redactions).some(([, n]) => n > 0) && (
              <p className="mt-2 flex items-start gap-1.5 text-[11px] text-emerald-300/80">
                <ShieldCheck className="mt-0.5 h-3 w-3 shrink-0" />
                Sensitive values were redacted before analysis; nothing sensitive is stored.
              </p>
            )}
          </Panel>

          <Panel icon={GitBranch} title="Change impact">
            {derived.diff.structurallyIdentical ? (
              <p className="text-xs text-muted-foreground">
                No structural change since the last recorded snapshot.
              </p>
            ) : (
              <>
                <p className="text-xs text-muted-foreground">
                  {derived.diff.counts.componentsAdded} added ·{" "}
                  {derived.diff.counts.componentsRemoved} removed ·{" "}
                  {derived.diff.counts.componentsModified} modified · touches{" "}
                  {derived.impact.impacted.length} component(s)
                </p>
                <ul className="mt-2 space-y-1">
                  {derived.impact.impacted.slice(0, 8).map((hit) => (
                    <li key={hit.id} className="text-xs">
                      <span className="text-foreground">{hit.name}</span>{" "}
                      <span className="text-muted-foreground">— {hit.relation}</span>
                    </li>
                  ))}
                </ul>
              </>
            )}
            <Caveats items={derived.impact.caveats} />
          </Panel>

          <Panel icon={ShieldCheck} title="Suggested regression checks">
            {derived.suite.cases.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                Nothing to re-test — no structural change detected.
              </p>
            ) : (
              <ul className="space-y-1.5">
                {derived.suite.cases.slice(0, 10).map((c) => (
                  <li key={c.id} className="text-xs">
                    <Badge
                      variant="outline"
                      className={cn(
                        "mr-2 h-4 px-1.5 text-[10px]",
                        c.priority === "required" && "border-amber-300/40 text-amber-200",
                      )}
                    >
                      {c.priority}
                    </Badge>
                    <span className="text-foreground">{c.title}</span>{" "}
                    <span className="text-muted-foreground">— {c.rationale}</span>
                  </li>
                ))}
              </ul>
            )}
            <Caveats items={derived.suite.gaps} />
          </Panel>

          <Panel icon={History} title="History">
            <p className="text-xs text-muted-foreground">
              {derived.history.versionCount} recorded version(s) ·{" "}
              {derived.history.structuralRevisions} structural ·{" "}
              {derived.history.cosmeticRevisions} wording-only · complexity{" "}
              {derived.history.complexityTrend}
            </p>
            {derived.history.hotspots.length > 0 && (
              <ul className="mt-2 space-y-1">
                {derived.history.hotspots.map((h) => (
                  <li key={h.id} className="text-xs text-muted-foreground">
                    <span className="text-foreground">{h.name}</span> — changed {h.changeCount}{" "}
                    times
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel icon={RouteIcon} title="Static paths" className="lg:col-span-2">
            <p className="text-xs text-muted-foreground">
              {derived.paths.paths.length} path(s) from {derived.paths.entryPoints.length} entry
              point(s)
              {derived.paths.unreachable.length > 0
                ? ` · ${derived.paths.unreachable.length} component(s) not on any path`
                : ""}
            </p>
            <ul className="mt-2 space-y-1">
              {derived.paths.paths.slice(0, 6).map((p, i) => (
                <li key={i} className="truncate text-xs text-muted-foreground">
                  {p.names.join(" → ")}
                  {p.loopedBack ? " ↩ loops back" : ""}
                  {p.truncated ? " …" : ""}
                </li>
              ))}
            </ul>
            <Caveats items={derived.paths.caveats} />
          </Panel>
        </div>
      )}
    </div>
  );
}

function Panel({
  icon: Icon,
  title,
  children,
  className,
}: {
  icon: typeof Layers;
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "rounded-2xl border border-white/10 bg-white/[0.02] p-3",
        className,
      )}
    >
      <h3 className="mb-2 flex items-center gap-2 text-xs font-medium text-foreground">
        <Icon className="h-3.5 w-3.5 text-cyan-300/80" />
        {title}
      </h3>
      {children}
    </section>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <span className="rounded-lg border border-white/10 bg-white/[0.03] px-2 py-1 text-[11px] text-muted-foreground">
      <span className="font-medium text-foreground">{value}</span> {label}
    </span>
  );
}

function CoverageNote({ coverage, unknowns }: { coverage: number; unknowns: number }) {
  if (coverage >= 1 && unknowns === 0) return null;
  const partial = coverage < MIN_TRUSTED_COVERAGE;
  return (
    <p
      className={cn(
        "mt-2 flex items-start gap-1.5 text-[11px]",
        partial ? "text-amber-200/90" : "text-muted-foreground",
      )}
    >
      <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
      {Math.round(coverage * 100)}% of this script was recognised
      {unknowns > 0 ? ` · ${unknowns} unclassified line(s)` : ""}.
      {partial ? " Treat everything on this pane as partial." : ""}
    </p>
  );
}

function Caveats({ items }: { items: string[] }) {
  if (items.length === 0) return null;
  return (
    <ul className="mt-2 space-y-0.5 border-t border-white/5 pt-2">
      {items.map((c) => (
        <li key={c} className="text-[11px] text-muted-foreground/80">
          {c}
        </li>
      ))}
    </ul>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-white/10 p-6 text-center text-xs text-muted-foreground">
      {text}
    </div>
  );
}
