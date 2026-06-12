import { createFileRoute, Outlet, useRouterState } from "@tanstack/react-router";
import { PhoneOutgoing } from "lucide-react";
import { StartTestingPane } from "@/components/dispatch/StartTestingPane";
import { MiniDashboard } from "@/components/dispatch/MiniDashboard";
import { ActiveSessionsList } from "@/components/dispatch/ActiveSessionsList";

export const Route = createFileRoute("/contact-dispatch")({
  head: () => ({
    meta: [
      { title: "Contact Dispatch Testing — Account Intel Hub" },
      { name: "description", content: "Prepare accounts for Contact Dispatch activation." },
    ],
  }),
  component: ContactDispatchRoute,
});

function ContactDispatchRoute() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  if (pathname !== "/contact-dispatch") return <Outlet />;
  return <ContactDispatchIndex />;
}

function ContactDispatchIndex() {
  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-5">
      <header className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <div
            className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl"
            style={{
              background: "linear-gradient(135deg, oklch(0.78 0.18 220 / 0.4), oklch(0.7 0.22 295 / 0.4))",
              boxShadow: "0 0 22px var(--cyan-glow), inset 0 1px 0 oklch(1 0 0 / 0.2)",
            }}
          >
            <PhoneOutgoing className="h-5 w-5 text-white" />
          </div>
          <div className="min-w-0">
            <h1 className="truncate text-xl font-semibold text-foreground">Contact Dispatch Testing</h1>
            <p className="text-xs text-muted-foreground">Prepare accounts for Contact Dispatch activation.</p>
          </div>
        </div>
      </header>
      <StartTestingPane />
      <MiniDashboard />
      <ActiveSessionsList />
    </div>
  );
}