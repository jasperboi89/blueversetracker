import { createFileRoute, Outlet } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/AppShell";
import { AuthorizationGuard } from "@/components/auth/AuthorizationGuard";
import { InactivityWatcher } from "@/components/auth/InactivityWatcher";
import { CommandPalette } from "@/components/command/CommandPalette";
import { ActiveWorkDock } from "@/components/workspace/ActiveWorkDock";
import { GlobalSnipPaste } from "@/components/workspace/GlobalSnipPaste";
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
  return (
    <>
      <AppShell>
        <Outlet />
      </AppShell>
      <InactivityWatcher />
      <CommandPalette />
      <ActiveWorkDock />
      <GlobalSnipPaste />
    </>
  );
}
