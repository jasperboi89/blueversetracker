import { createFileRoute, Outlet } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/AppShell";
import { AuthorizationGuard } from "@/components/auth/AuthorizationGuard";
import { InactivityWatcher } from "@/components/auth/InactivityWatcher";
import { CommandPalette } from "@/components/command/CommandPalette";
import { useThemeSync } from "@/hooks/use-theme-sync";
import { useTuningSync } from "@/hooks/use-tuning-sync";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  useThemeSync();
  useTuningSync();
  return (
    <AuthorizationGuard>
      <AppShell>
        <Outlet />
      </AppShell>
      <InactivityWatcher />
      <CommandPalette />
    </AuthorizationGuard>
  );
}
