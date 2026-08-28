import type { ReactNode } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { GreetingPanel } from "@/components/home/GreetingPanel";
import { ShiftCard } from "@/components/home/ShiftCard";
import { AlertCenter } from "@/components/home/AlertCenter";
import { NextBestActionStrip } from "@/components/home/NextBestActionStrip";
import { NightPlan } from "@/components/home/NightPlan";
import { LookupCards } from "@/components/home/LookupCards";
import { OverviewCards } from "@/components/home/OverviewCards";
import { ShiftLedger } from "@/components/home/ShiftLedger";
import { QuickStart } from "@/components/home/QuickStart";
import { ShiftSummaryButton } from "@/components/home/ShiftSummaryButton";
import { BriefingPanel } from "@/components/home/BriefingPanel";
import { NightForecast } from "@/components/quantum-bloom/NightForecast";
import { useTheme } from "@/lib/settings/theme-store";
import { PaneCanvas, useIsNarrow } from "@/components/workspace/PaneCanvas";
import { FloatingPane } from "@/components/workspace/FloatingPane";
import {
  resolveFloating,
  usePaneLayout,
  type PaneDefault,
} from "@/lib/workspace/pane-layout-store";

/**
 * Command Center — the operator's home surface.
 *
 * The default (composed) layout is organised by hierarchy rather than a flat
 * pile of equal-weight panels: orientation at the top, priority intelligence
 * next, then live work intelligence, then the operational reference area. The
 * optional floating Power Workspace (PaneCanvas) is preserved for power users
 * and on wide screens; narrow/mobile always falls back to the stable stack.
 *
 * Shift Handoff and Coverage Watch panes were removed in Phase 1.
 */
const HOME_PANES: Array<{
  id: string;
  title: string;
  chip?: string;
  def: PaneDefault;
  body: () => ReactNode;
}> = [
  {
    id: "home:greeting",
    title: "Greeting",
    def: { xPct: 0, yPct: 0, wPct: 62, hPct: 34 },
    body: () => <GreetingPanel />,
  },
  {
    id: "home:shift",
    title: "Shift",
    def: { xPct: 63, yPct: 0, wPct: 37, hPct: 34 },
    body: () => <ShiftCard />,
  },
  {
    id: "home:nba",
    title: "Next Best Action",
    def: { xPct: 0, yPct: 35, wPct: 100, hPct: 14 },
    body: () => <NextBestActionStrip />,
  },
  {
    id: "home:briefing",
    title: "AI Briefings",
    def: { xPct: 0, yPct: 49, wPct: 100, hPct: 22 },
    body: () => <BriefingPanel />,
  },
  {
    id: "home:alerts",
    title: "Alert Center",
    def: { xPct: 0, yPct: 50, wPct: 50, hPct: 24 },
    body: () => <AlertCenter />,
  },
  {
    id: "home:plan",
    title: "Night Plan",
    def: { xPct: 51, yPct: 50, wPct: 49, hPct: 34 },
    body: () => <NightPlan />,
  },
  {
    id: "home:lookup",
    title: "Lookup",
    def: { xPct: 0, yPct: 75, wPct: 50, hPct: 25 },
    body: () => <LookupCards />,
  },
  {
    id: "home:overview",
    title: "Overview",
    def: { xPct: 51, yPct: 85, wPct: 49, hPct: 15 },
    body: () => <OverviewCards />,
  },
  {
    id: "home:quickstart",
    title: "Quick Start",
    def: { xPct: 0, yPct: 100, wPct: 100, hPct: 12 },
    body: () => <QuickStart />,
  },
  {
    id: "home:ledger",
    title: "Shift Ledger",
    def: { xPct: 0, yPct: 113, wPct: 100, hPct: 25 },
    body: () => <ShiftLedger />,
  },
];

export const Route = createFileRoute("/_authenticated/")({
  head: () => ({
    meta: [
      { title: "Command Center — Account Intel Hub" },
      { name: "description", content: "BlueVerse command center for AnSer Ops night shift." },
      { property: "og:title", content: "Account Intel Hub" },
      {
        property: "og:description",
        content: "BlueVerse command center for AnSer Ops night shift.",
      },
    ],
  }),
  component: Home,
});

/** Section band with an operational eyebrow — the backbone of the new hierarchy. */
function Band({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <h2 className="text-[11px] font-medium uppercase tracking-[0.22em] text-muted-foreground">
          {label}
        </h2>
        <span
          aria-hidden
          className="h-px flex-1"
          style={{
            background:
              "linear-gradient(90deg, color-mix(in oklab, var(--cyan-glow) 30%, transparent), transparent)",
          }}
        />
      </div>
      {children}
    </section>
  );
}

function Home() {
  const theme = useTheme();
  const paneLayout = usePaneLayout();
  const isNarrow = useIsNarrow();
  const floating = resolveFloating(paneLayout.mode, isNarrow);
  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6">
      {theme === "quantum-bloom" && <NightForecast />}
      {floating ? (
        <PaneCanvas paneIds={HOME_PANES.map((p) => p.id)}>
          {HOME_PANES.map((p) => (
            <FloatingPane key={p.id} id={p.id} title={p.title} chip={p.chip} def={p.def}>
              <p.body />
            </FloatingPane>
          ))}
        </PaneCanvas>
      ) : (
        <>
          {/* Orientation — who, when, and the state of the shift. */}
          <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
            <GreetingPanel />
            <ShiftCard />
          </div>

          {/* Priority intelligence — what to do next and the AI read on it. */}
          <Band label="Priority">
            <NextBestActionStrip />
            <BriefingPanel />
          </Band>

          {/* Work intelligence — what needs attention, what's upcoming. */}
          <Band label="Work Intelligence">
            <div className="grid gap-4 lg:grid-cols-2">
              <NightPlan />
              <AlertCenter />
            </div>
          </Band>

          {/* Operations — reference surfaces, lookups, and shift history. */}
          <Band label="Operations">
            <QuickStart />
            <div className="grid gap-4 lg:grid-cols-2">
              <LookupCards />
              <OverviewCards />
            </div>
            <ShiftLedger />
          </Band>
        </>
      )}
      <ShiftSummaryButton />
    </div>
  );
}
