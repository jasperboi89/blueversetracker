import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ClipboardList, FlaskConical, GitCompare, Play, ShieldAlert, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { listIsScriptEntries } from "@/lib/is-scripts/is-scripts.functions";
import { ingestScript } from "@/lib/script/script-ingest";
import { makeScenario, scenarioBuilderFields } from "@/lib/simulation/scenario-model";
import { makeOverlay } from "@/lib/simulation/simulation-overlay";
import {
  compareSimulations,
  compareToExpectation,
  runSimulation,
} from "@/lib/simulation/simulation-engine";
import { prepareTestPlan } from "@/lib/simulation/simulation-test-plan";
import {
  SIMULATION_DISCLAIMER,
  SIMULATION_MATCH_LABEL,
  SIMULATION_STATUS_LABEL,
  SUPPORTED_CONSTRUCTS,
} from "@/lib/simulation/simulation-contract";

/**
 * Operational Simulator — the Phase 7 Digital Twin surface.
 *
 * Every number here is SIMULATED from the parsed structure plus the operator's
 * scenario. Nothing on this pane edits, deploys, or live-tests a script, and no
 * result is ever labelled pass or fail.
 */
export function SimulatorPane() {
  const [scriptId, setScriptId] = useState("");
  const [startKey, setStartKey] = useState("");
  const [expectedTerminal, setExpectedTerminal] = useState("");
  const [inputs, setInputs] = useState<Record<string, string>>({});
  const [overlayFrom, setOverlayFrom] = useState("");
  const [overlayCurrent, setOverlayCurrent] = useState("");
  const [overlayProposed, setOverlayProposed] = useState("");
  const [ran, setRan] = useState(false);

  const listEntries = useServerFn(listIsScriptEntries);
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

  const analysis = useMemo(
    () => (selected ? ingestScript(selected.scriptBody) : null),
    [selected],
  );
  const fields = useMemo(
    () => (analysis ? scenarioBuilderFields(analysis.structure) : []),
    [analysis],
  );

  const run = useMemo(() => {
    if (!analysis || !selected || !ran) return null;
    const scenario = makeScenario({
      name: `${selected.title} scenario`,
      category: "regression",
      scriptId: selected.id,
      structureFingerprint: analysis.structureFingerprint,
      ...(startKey ? { startingComponentKey: startKey } : {}),
      inputs: Object.entries(inputs)
        .filter(([, v]) => v)
        .map(([key, value]) => ({ key, label: key, value })),
      ...(expectedTerminal ? { expected: { terminalKey: expectedTerminal } } : {}),
    });

    const shared = {
      structure: analysis.structure,
      structureFingerprint: analysis.structureFingerprint,
    };
    const current = runSimulation({ scenario, ...shared });
    const expectation = compareToExpectation(current, scenario, analysis.structure);

    const hasOverlay = Boolean(overlayFrom && overlayCurrent && overlayProposed);
    const proposed = hasOverlay
      ? runSimulation({
          scenario,
          ...shared,
          overlay: makeOverlay({
            name: "Proposed change",
            scriptId: selected.id,
            baseStructureFingerprint: analysis.structureFingerprint,
            branchTargetOverrides: [
              {
                fromKey: overlayFrom,
                currentToKey: overlayCurrent,
                proposedToKey: overlayProposed,
              },
            ],
          }),
        })
      : null;

    const delta = proposed ? compareSimulations(current, proposed, analysis.structure) : null;
    return {
      current,
      expectation,
      proposed,
      delta,
      testPlan: prepareTestPlan({ current: proposed ?? current, delta, expectation }),
    };
  }, [
    analysis,
    selected,
    ran,
    startKey,
    inputs,
    expectedTerminal,
    overlayFrom,
    overlayCurrent,
    overlayProposed,
  ]);

  return (
    <div className="space-y-4">
      <div className="glass-panel rounded-2xl border border-white/10 p-4">
        <div className="flex flex-wrap items-center gap-3">
          <FlaskConical className="h-4 w-4 text-cyan-300" />
          <h3 className="text-sm font-semibold">Operational Simulator</h3>
          <Badge variant="outline" className="border-cyan-300/40 text-[10px] uppercase">
            Simulated — not a live test
          </Badge>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">{SIMULATION_DISCLAIMER}</p>

        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <Select value={scriptId} onValueChange={(v) => { setScriptId(v); setRan(false); setInputs({}); }}>
            <SelectTrigger>
              <SelectValue placeholder="Select a script" />
            </SelectTrigger>
            <SelectContent>
              {entries.map((e) => (
                <SelectItem key={e.id} value={e.id}>
                  {e.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={startKey} onValueChange={setStartKey} disabled={!analysis}>
            <SelectTrigger>
              <SelectValue placeholder="Starting component (optional)" />
            </SelectTrigger>
            <SelectContent>
              {(analysis?.structure.components ?? []).slice(0, 100).map((c) => (
                <SelectItem key={c.id} value={c.key}>
                  {c.name} · {c.kind}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {analysis && (
        <div className="glass-panel rounded-2xl border border-white/10 p-4">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Scenario inputs
          </h4>
          {fields.length === 0 ? (
            <p className="mt-2 text-xs text-muted-foreground">
              No branch or field components were recognised in this script, so there is nothing to
              parameterise.
            </p>
          ) : (
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              {fields.slice(0, 12).map((f) => (
                <label key={f.key} className="space-y-1 text-xs">
                  <span className="text-muted-foreground">
                    {f.label} <span className="opacity-60">· {f.kind}</span>
                  </span>
                  {f.options.length > 0 ? (
                    <Select
                      value={inputs[f.key] ?? ""}
                      onValueChange={(v) => setInputs((prev) => ({ ...prev, [f.key]: v }))}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Not supplied" />
                      </SelectTrigger>
                      <SelectContent>
                        {f.options.slice(0, 40).map((o) => (
                          <SelectItem key={o} value={o}>
                            {o}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Input
                      value={inputs[f.key] ?? ""}
                      onChange={(e) => setInputs((prev) => ({ ...prev, [f.key]: e.target.value }))}
                      placeholder="Value"
                    />
                  )}
                </label>
              ))}
            </div>
          )}

          <div className="mt-4 grid gap-3 md:grid-cols-4">
            <Input
              value={expectedTerminal}
              onChange={(e) => setExpectedTerminal(e.target.value)}
              placeholder="Expected terminal key (optional)"
            />
            <Input
              value={overlayFrom}
              onChange={(e) => setOverlayFrom(e.target.value)}
              placeholder="Proposed change: from key"
            />
            <Input
              value={overlayCurrent}
              onChange={(e) => setOverlayCurrent(e.target.value)}
              placeholder="current target"
            />
            <Input
              value={overlayProposed}
              onChange={(e) => setOverlayProposed(e.target.value)}
              placeholder="proposed target"
            />
          </div>

          <Button className="mt-4" size="sm" onClick={() => setRan(true)}>
            <Play className="mr-2 h-3.5 w-3.5" />
            Run simulation
          </Button>
        </div>
      )}

      {run && (
        <div className="space-y-4">
          <div className="glass-panel rounded-2xl border border-white/10 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="text-[10px]">
                {SIMULATION_STATUS_LABEL[run.current.status]}
              </Badge>
              <Badge variant="outline" className="text-[10px] uppercase">
                confidence: {run.current.confidence.replace(/_/g, " ")}
              </Badge>
              <Badge variant="outline" className="text-[10px] uppercase">
                structural coverage {(run.current.coverage.structuralCoverage * 100).toFixed(0)}%
              </Badge>
              <Badge variant="outline" className="text-[10px] uppercase">
                {SIMULATION_MATCH_LABEL[run.expectation.state]}
              </Badge>
              <Badge variant="outline" className="text-[10px] uppercase">
                live test not run
              </Badge>
            </div>

            <ol className="mt-3 space-y-1.5">
              {run.current.pathTrace.map((step) => (
                <li
                  key={step.index}
                  className={cn(
                    "rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2 text-xs",
                    step.knowledge === "assumed" && "border-amber-300/30",
                    step.knowledge === "unknown" && "border-rose-300/30",
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">
                      {step.index + 1}. {step.name}{" "}
                      <span className="text-muted-foreground">· {step.kind}</span>
                    </span>
                    <span className="uppercase text-[10px] text-muted-foreground">
                      {step.knowledge}
                    </span>
                  </div>
                  <p className="mt-1 text-muted-foreground">{step.detail}</p>
                  <p className="text-[10px] text-muted-foreground/70">Evidence: {step.evidence}</p>
                </li>
              ))}
            </ol>

            {run.current.alternatePaths.length > 0 && (
              <p className="mt-3 text-xs text-amber-200/80">
                {run.current.alternatePaths.length} alternative path(s) were possible — the scenario
                did not determine which one applies.
              </p>
            )}

            <ul className="mt-3 space-y-1 text-xs text-muted-foreground">
              {run.expectation.reasons.map((r) => (
                <li key={r}>· {r}</li>
              ))}
            </ul>
          </div>

          {run.current.warnings.length > 0 && (
            <div className="glass-panel rounded-2xl border border-amber-300/20 p-4">
              <div className="flex items-center gap-2 text-xs font-semibold">
                <TriangleAlert className="h-3.5 w-3.5 text-amber-300" />
                What the simulator could not determine
              </div>
              <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                {run.current.warnings.map((w, i) => (
                  <li key={`${w.code}-${i}`}>
                    <span className="uppercase text-[10px] text-amber-200/80">
                      {w.code.replace(/_/g, " ")}
                    </span>{" "}
                    — {w.detail}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {run.testPlan.items.length > 0 && (
            <div className="glass-panel rounded-2xl border border-white/10 p-4">
              <div className="flex items-center gap-2 text-xs font-semibold">
                <ClipboardList className="h-3.5 w-3.5 text-cyan-300" />
                Prepared live-test plan
                <Badge variant="outline" className="text-[10px] uppercase">
                  live test not run
                </Badge>
              </div>
              <ul className="mt-2 space-y-1.5 text-xs">
                {run.testPlan.items.map((item) => (
                  <li key={item.id} className="rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2">
                    <span className="font-medium">{item.title}</span>
                    <p className="text-muted-foreground">{item.evidence}</p>
                    <p className="text-[10px] uppercase text-muted-foreground/70">
                      {item.priority} · grounded in {item.ground.replace(/_/g, " ")}
                    </p>
                  </li>
                ))}
              </ul>
              {run.testPlan.notes.map((n) => (
                <p key={n} className="mt-2 text-[11px] text-muted-foreground">
                  {n}
                </p>
              ))}
            </div>
          )}

          {run.delta && (
            <div className="glass-panel rounded-2xl border border-white/10 p-4">
              <div className="flex items-center gap-2 text-xs font-semibold">
                <GitCompare className="h-3.5 w-3.5 text-cyan-300" />
                Current vs proposed change (simulated)
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                Current: {run.delta.currentPath.join(" → ") || "—"}
              </p>
              <p className="text-xs text-muted-foreground">
                Proposed: {run.delta.proposedPath.join(" → ") || "—"}
              </p>
              <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                {run.delta.notes.map((n) => (
                  <li key={n}>· {n}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      <div className="glass-panel rounded-2xl border border-white/10 p-4">
        <div className="flex items-center gap-2 text-xs font-semibold">
          <ShieldAlert className="h-3.5 w-3.5 text-cyan-300" />
          What this simulator can and cannot evaluate
        </div>
        <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
          {SUPPORTED_CONSTRUCTS.map((c) => (
            <li key={c.construct}>
              <span className="uppercase text-[10px] opacity-70">
                {c.support.replace(/_/g, " ")}
              </span>{" "}
              — <span className="text-foreground/80">{c.construct}</span>: {c.note}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
