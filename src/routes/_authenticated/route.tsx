import { createFileRoute, Outlet, useRouterState } from "@tanstack/react-router";
import { useEffect } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { AuthorizationGuard } from "@/components/auth/AuthorizationGuard";
import { InactivityWatcher } from "@/components/auth/InactivityWatcher";
import { CommandPalette } from "@/components/command/CommandPalette";
import { ActiveWorkDock } from "@/components/workspace/ActiveWorkDock";
import { GlobalSnipPaste } from "@/components/workspace/GlobalSnipPaste";
import { CopilotSheet } from "@/components/workspace/CopilotSheet";
import { CopilotLauncher } from "@/components/workspace/CopilotLauncher";
import { MilestoneWatcher } from "@/components/workspace/MilestoneWatcher";
import { ShiftContextWatcher } from "@/components/workspace/ShiftContextWatcher";
import { recordActivity } from "@/lib/workspace/activity-store";
import { useThemeSync } from "@/hooks/use-theme-sync";
import { useTuningSync } from "@/hooks/use-tuning-sync";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  return (
    <AuthorizationGuard>
      <AuthorizedShell />
    </AuthorizationGuard>
  );
}

// Only mounts once AuthorizationGuard confirms a valid session, so the
// sync hooks never fire a server fn without a bearer token.
function AuthorizedShell() {
  useThemeSync();
  useTuningSync();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  useEffect(() => {
    recordActivity("nav", pathname);
  }, [pathname]);
  return (
    <>
      <AppShell>
        <Outlet />
      </AppShell>
      <InactivityWatcher />
      <CommandPalette />
      <ActiveWorkDock />
      <GlobalSnipPaste />
      <CopilotSheet />
      <CopilotLauncher />
      <MilestoneWatcher />
      <ShiftContextWatcher />
    </>
  );
}
