/**
 * Activation 7 — Script Twin workspace (InfinityShell).
 *
 * Wires the verified pure simulation engine (`twin-simulation.ts`) into a live,
 * bounded, sandbox-only experience: Classic Infinity rendering, an optional
 * Enhanced intelligence layer, entering test values, progressive reveal, and
 * navigation between defined screens. Nothing here writes to Amtelco, deploys,
 * executes SQL/expressions, or decodes binary IIF — the engine has no such
 * capability, and simulation state is local component state, isolated from the
 * live portal.
 */

import { useMemo, useState } from "react";
import { Boxes, RotateCcw, ShieldOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { screenEvidenceStates, type TwinScriptModel } from "@/lib/script/twin/twin-model";
import { weakestEvidence } from "@/lib/script/twin/evidence-state";
import {
  applyValue,
  createSimState,
  navigate,
  pendingReveals,
  resetSim,
  summarizeSim,
  visibleElements,
  type TwinSimState,
} from "@/lib/script/twin/twin-simulation";
import { manualDemoTwin } from "./twin-samples";
import { InfinityScreen } from "./InfinityScreen";
import { EvidenceBadge, ProvenanceBadge } from "./twin-components";

export function ScriptTwinWorkspace({ model: modelProp }: { model?: TwinScriptModel }) {
  const model = useMemo(() => modelProp ?? manualDemoTwin(), [modelProp]);
  const [enhanced, setEnhanced] = useState(false);
  const [sim, setSim] = useState<TwinSimState>(() => createSimState(model));

  const screen = model.screens.find((s) => s.id === sim.currentScreenId) ?? model.screens[0];
  const visible = visibleElements(model, sim);
  const pending = pendingReveals(model, sim);
  const summary = summarizeSim(model, sim);
  const screenEvidence = weakestEvidence(screen ? screenEvidenceStates(screen) : ["unknown"]);

  if (!screen) {
    return (
      <div className="rounded-2xl border border-dashed border-white/15 bg-white/[0.02] p-8 text-center text-sm text-muted-foreground">
        No twin screens are available. Import a recognised script or supply a manual twin
        definition.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-cyan-300/20 bg-gradient-to-b from-slate-900/60 to-slate-950/60 shadow-[0_30px_80px_-50px_rgba(0,0,0,0.9)]">
      {/* header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 bg-slate-900/70 px-4 py-3">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1.5 text-foreground">
            <Boxes className="h-3.5 w-3.5 text-cyan-300" />
            <b className="font-semibold">{model.title}</b>
          </span>
          <span>
            Screen <b className="font-semibold text-foreground">{screen.title}</b>
          </span>
          <span className="inline-flex items-center gap-1.5">
            Screen evidence <EvidenceBadge state={screenEvidence} />
          </span>
          <span className="inline-flex items-center gap-1 text-amber-300/90">
            <ShieldOff className="h-3 w-3" /> validatedAgainstRealExport: false
          </span>
        </div>
        <div
          className="flex rounded-lg border border-white/10 bg-slate-950/60 p-0.5"
          role="tablist"
          aria-label="Twin view mode"
        >
          <button
            role="tab"
            aria-selected={!enhanced}
            onClick={() => setEnhanced(false)}
            className={cn(
              "rounded-md px-3 py-1.5 font-mono text-[11px] uppercase tracking-wider transition",
              !enhanced
                ? "bg-cyan-300/15 text-cyan-200"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            Classic
          </button>
          <button
            role="tab"
            aria-selected={enhanced}
            onClick={() => setEnhanced(true)}
            className={cn(
              "rounded-md px-3 py-1.5 font-mono text-[11px] uppercase tracking-wider transition",
              enhanced
                ? "bg-cyan-300/15 text-cyan-200"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            Enhanced
          </button>
        </div>
      </div>

      {/* body */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px]">
        <div className="bg-slate-950/40 p-5">
          <InfinityScreen
            screen={screen}
            visible={visible}
            enhanced={enhanced}
            values={sim.values as Record<string, string>}
            onValue={(id, v) => setSim((s) => applyValue(model, s, id, v))}
            onNavigate={(navId) => setSim((s) => navigate(model, s, navId))}
          />
          {pending.length > 0 ? (
            <p className="mx-auto mt-3 max-w-[560px] font-mono text-[11px] text-cyan-300/85">
              {pending.length} more control{pending.length > 1 ? "s" : ""} will appear as you fill
              this screen (progressive reveal).
            </p>
          ) : null}
        </div>

        {/* intelligence side rail */}
        <aside className="flex flex-col gap-4 border-t border-white/10 bg-slate-900/50 p-4 lg:border-l lg:border-t-0">
          <section>
            <h4 className="mb-2 font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
              Simulation trace · sandbox
            </h4>
            <div className="flex flex-wrap items-center gap-1.5 font-mono text-[11px]">
              {model.screens.map((s) => (
                <span
                  key={s.id}
                  className={cn(
                    "rounded-md border px-2 py-0.5",
                    s.id === sim.currentScreenId
                      ? "border-cyan-300/40 text-cyan-200"
                      : "border-white/10 text-muted-foreground/70",
                  )}
                >
                  {s.title}
                </span>
              ))}
            </div>
            <p className="mt-2 font-mono text-[10.5px] text-muted-foreground/70">
              {summary.filledCount} field(s) filled · {summary.visitedScreens} screen(s) visited.
              Test values never write to Amtelco.
            </p>
            <button
              onClick={() => setSim(resetSim(model))}
              className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-white/10 px-2 py-1 font-mono text-[10.5px] text-muted-foreground transition hover:border-cyan-300/30 hover:text-foreground"
            >
              <RotateCcw className="h-3 w-3" /> Reset simulation
            </button>
          </section>

          <section>
            <h4 className="mb-2 font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
              Provenance · current screen
            </h4>
            <div className="space-y-1.5">
              {visible.map((el) => (
                <div
                  key={el.id}
                  className="flex items-center justify-between gap-2 border-t border-white/5 py-1 first:border-t-0"
                >
                  <span className="truncate text-xs text-muted-foreground">{el.label}</span>
                  <ProvenanceBadge provenance={el.provenance} />
                </div>
              ))}
            </div>
          </section>

          <p className="mt-auto font-mono text-[10px] text-muted-foreground/60">
            Digital twin only · no live execution · no Amtelco writes · no script deployment.
          </p>
        </aside>
      </div>
    </div>
  );
}
