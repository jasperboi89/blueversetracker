import { createFileRoute, Outlet } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/AppShell";
import { AuthorizationGuard } from "@/components/auth/AuthorizationGuard";
import { InactivityWatcher } from "@/components/auth/InactivityWatcher";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  return (
    <AuthorizationGuard>
      <AppShell>
        <Outlet />
      </AppShell>
      <InactivityWatcher />
    </AuthorizationGuard>
  );
}