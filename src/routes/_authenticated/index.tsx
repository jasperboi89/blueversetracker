import type { ReactNode } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { GreetingPanel } from "@/components/home/GreetingPanel";
import { ShiftCard } from "@/components/home/ShiftCard";
import { AlertCenter } from "@/components/home/AlertCenter";
import { NextBestActionStrip } from "@/components/home/NextBestActionStrip";
import { NightPlan } from "@/components/home/NightPlan";
import { LookupCards } from "@/components/home/LookupCards";
import { OverviewCards } from "@/components/home/OverviewCards";
import { RecentlyCompleted } from "@/components/home/RecentlyCompleted";
import { ShiftSummaryButton } from "@/components/home/ShiftSummaryButton";
import { BriefingPanel } from "@/components/home/BriefingPanel";
import { NightForecast } from "@/components/quantum-bloom/NightForecast";
import { useTheme } from "@/lib/settings/theme-store";
import { PaneCanvas, useIsNarrow } from "@/components/workspace/PaneCanvas";
import { FloatingPane } from "@/components/workspace/FloatingPane";
import { resolveFloating, usePaneLayout, type PaneDefault } from "@/lib/workspace/pane-layout-store";

const HOME_PANES: Array<{
  id: string;
  title: string;
  chip?: string;
  def: PaneDefault;
  body: () => ReactNode;
}> = [
  { id: "home:greeting", title: "Greeting", def: { xPct: 0, yPct: 0, wPct: 62, hPct: 34 }, body: () => <GreetingPanel /> },
  { id: "home:shift", title: "Shift", def: { xPct: 63, yPct: 0, wPct: 37, hPct: 34 }, body: () => <ShiftCard /> },
  { id: "home:nba", title: "Next Best Action", def: { xPct: 0, yPct: 35, wPct: 100, hPct: 14 }, body: () => <NextBestActionStrip /> },
  { id: "home:briefing", title: "AI Briefings", def: { xPct: 0, yPct: 49, wPct: 100, hPct: 22 }, body: () => <BriefingPanel /> },
  { id: "home:alerts", title: "Alert Center", def: { xPct: 0, yPct: 50, wPct: 50, hPct: 24 }, body: () => <AlertCenter /> },
  { id: "home:plan", title: "Night Plan", def: { xPct: 51, yPct: 50, wPct: 49, hPct: 34 }, body: () => <NightPlan /> },
  { id: "home:lookup", title: "Lookup", def: { xPct: 0, yPct: 75, wPct: 50, hPct: 25 }, body: () => <LookupCards /> },
  { id: "home:overview", title: "Overview", def: { xPct: 51, yPct: 85, wPct: 49, hPct: 15 }, body: () => <OverviewCards /> },
  { id: "home:recent", title: "Recently Completed", def: { xPct: 0, yPct: 100, wPct: 100, hPct: 25 }, body: () => <RecentlyCompleted /> },
];

export const Route = createFileRoute("/_authenticated/")({
  head: () => ({
    meta: [
      { title: "Home — Account Intel Hub" },
      { name: "description", content: "BlueVerse command deck for AnSer Ops night shift." },
      { property: "og:title", content: "Account Intel Hub" },
      { property: "og:description", content: "BlueVerse command deck for AnSer Ops night shift." },
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
    <div className="mx-auto flex max-w-7xl flex-col gap-5">
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
          <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
            <GreetingPanel />
            <ShiftCard />
          </div>
          <NextBestActionStrip />
          <BriefingPanel />
          <AlertCenter />
          <NightPlan />
          <LookupCards />
          <OverviewCards />
          <RecentlyCompleted />
        </>
      )}
      <ShiftSummaryButton />
    </div>
  );
}
