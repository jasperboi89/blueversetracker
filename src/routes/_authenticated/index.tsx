import { createFileRoute } from "@tanstack/react-router";
import { GreetingPanel } from "@/components/home/GreetingPanel";
import { ShiftCard } from "@/components/home/ShiftCard";
import { AlertCenter } from "@/components/home/AlertCenter";
import { NightPlan } from "@/components/home/NightPlan";
import { LookupCards } from "@/components/home/LookupCards";
import { OverviewCards } from "@/components/home/OverviewCards";
import { RecentlyCompleted } from "@/components/home/RecentlyCompleted";
import { ShiftSummaryButton } from "@/components/home/ShiftSummaryButton";

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
  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-5">
      <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
        <GreetingPanel />
        <ShiftCard />
      </div>
      <AlertCenter />
      <NightPlan />
      <LookupCards />
      <OverviewCards />
      <RecentlyCompleted />
      <ShiftSummaryButton />
    </div>
  );
}
