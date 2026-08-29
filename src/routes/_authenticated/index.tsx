import type { ReactNode } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { GreetingPanel } from "@/components/home/GreetingPanel";
import { CommandHeader } from "@/components/home/CommandHeader";
import { Zone } from "@/components/home/Zone";
import { ScriptTwinTile } from "@/components/home/ScriptTwinTile";
import { GovernedActionsBand } from "@/components/home/GovernedActionsBand";
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
import { IntelligenceLegend } from "@/components/home/IntelligenceLegend";
import { RadarBand } from "@/components/intelligence/RadarBand";
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
      { title: "Command Center — Account Command Center" },
      { name: "description", content: "BlueVerse command center for AnSer Ops night shift." },
      { property: "og:title", content: "Account Command Center" },
      {
        property: "og:description",
        content: "BlueVerse command center for AnSer Ops night shift.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Home,
});

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
          {/* Command header — live operator presence, clock and system state. */}
          <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
            <CommandHeader />
            <ShiftCard />
          </div>

          {/* NOW — what matters this minute. */}
          <Zone tone="now" label="Now" hint="what needs you this minute">
            <NextBestActionStrip />
            <div className="grid gap-4 lg:grid-cols-2">
              <NightPlan />
              <AlertCenter />
            </div>
          </Zone>

          {/* OUTLOOK — what may matter next, honestly labelled. */}
          <Zone tone="outlook" label="Outlook" hint="what may matter next">
            <BriefingPanel />
          </Zone>

          {/* OPERATIONAL RADAR — what changed and what to inspect next. */}
          <Zone tone="radar" label="Operational Radar" hint="what changed · why it matters">
            <IntelligenceLegend />
            <RadarBand />
          </Zone>

          {/* GOVERNED ACTIONS — the lifecycle, never implying completion. */}
          <Zone tone="governed" label="Governed Actions" hint="proposed → confirmed → executed → verified">
            <GovernedActionsBand />
          </Zone>

          {/* CAPABILITIES — Script Intelligence as a first-class surface. */}
          <Zone tone="radar" label="Capabilities">
            <ScriptTwinTile />
          </Zone>

          {/* OPERATIONS — reference surfaces, lookups, and shift history. */}
          <Zone tone="ops" label="Operations">
            <QuickStart />
            <div className="grid gap-4 lg:grid-cols-2">
              <LookupCards />
              <OverviewCards />
            </div>
            <ShiftLedger />
          </Zone>
        </>
      )}
      <ShiftSummaryButton />
    </div>
  );
}
