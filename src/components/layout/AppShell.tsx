import type { ReactNode } from "react";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "./AppSidebar";
import { HipaaPill } from "@/components/auth/HipaaPill";
import { SanctuaryButton } from "@/components/quantum-bloom/SanctuaryButton";
import { InsightToaster } from "@/components/workspace/InsightToaster";
import { AssignedInboxPoller } from "@/components/assigned-inbox/AssignedInboxPoller";
import { UnlockToast } from "@/components/achievements/UnlockToast";
import { AchievementsWatcher } from "@/components/achievements/AchievementsWatcher";
import { RetrievalSyncWatcher } from "@/components/retrieval/RetrievalSyncWatcher";
import { FocusStrip } from "@/components/focus/FocusStrip";
import { useEffect, useState } from "react";
import { useRouterState } from "@tanstack/react-router";

/** Purely visual: which workflow the environment should tint toward. */
function workflowZone(pathname: string): string | undefined {
  if (pathname.startsWith("/contact-dispatch")) return "dispatch";
  if (pathname.startsWith("/knowledge-vault")) return "knowledge";
  if (pathname.startsWith("/freshdesk") || pathname.startsWith("/assigned-to-me")) return "tickets";
  if (pathname.startsWith("/additional-work")) return "additional";
  if (pathname.startsWith("/completed-work")) return "completed";
  return undefined;
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const zone = workflowZone(pathname);
  // Purely visual: alternating tick so the HoloQuiet plane-in transition
  // re-runs on every navigation without remounting route content.
  const [tick, setTick] = useState<"a" | "b">("a");
  useEffect(() => {
    setTick((t) => (t === "a" ? "b" : "a"));
  }, [pathname]);
  return (
    <SidebarProvider defaultOpen>
      <div className="flex min-h-screen w-full">
        <AppSidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-30 flex h-12 w-full min-w-0 items-center gap-2.5 overflow-hidden border-b border-border/40 bg-background/35 px-3 backdrop-blur-xl">
            <SidebarTrigger className="text-muted-foreground hover:text-foreground" />

            {/* Live status dot */}
            <span
              aria-hidden
              className="relative h-1.5 w-1.5 shrink-0 rounded-full"
              style={{
                background: "var(--cyan-glow)",
                boxShadow:
                  "0 0 8px var(--cyan-glow), 0 0 16px color-mix(in oklab, var(--cyan-glow) 40%, transparent)",
              }}
            />

            <div className="flex min-w-0 items-baseline gap-2 leading-none">
              <span className="truncate font-display text-sm font-semibold tracking-wide text-foreground">
                Account Intel Hub
              </span>
              <span className="hidden text-[10px] uppercase tracking-[0.22em] text-muted-foreground sm:inline">
                2036 Night Ops
              </span>
            </div>

            {/* Cyan → violet hairline accent */}
            <span
              aria-hidden
              className="hidden h-3 w-px shrink-0 sm:block"
              style={{
                background: "linear-gradient(180deg, var(--cyan-glow), var(--violet-glow))",
                opacity: 0.6,
              }}
            />

            <div className="ml-auto flex items-center gap-2">
              <FocusStrip />
              <span className="hidden items-center gap-1 rounded-md border border-border/40 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground md:inline-flex">
                ⌘K / Ctrl+K
              </span>
              <SanctuaryButton />
              <HipaaPill />
            </div>
          </header>
          <main
            className="hq-workspace flex-1 px-4 py-6 sm:px-6 lg:px-8"
            data-workflow={zone}
            data-nav-tick={tick}
          >
            {children}
          </main>
        </div>
        <InsightToaster />
        <AssignedInboxPoller />
        <UnlockToast />
        <AchievementsWatcher />
        <RetrievalSyncWatcher />
      </div>
    </SidebarProvider>
  );
}
