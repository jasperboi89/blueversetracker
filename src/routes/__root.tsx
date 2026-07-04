import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { GalaxyBackground } from "@/components/layout/GalaxyBackground";
import { Toaster } from "@/components/ui/sonner";
import { useApplyDisplayPrefs } from "@/lib/settings/display-prefs-store";
import { usePointerGlow } from "@/hooks/use-pointer-glow";
import { supabase } from "@/integrations/supabase/client";
import { purgeLocalAppData } from "@/lib/purge-local-data";
import { useApplyTheme, useTheme } from "@/lib/settings/theme-store";
import { QuantumBloomDriver } from "@/components/quantum-bloom/QuantumBloomDriver";
import { NebulaCanvas } from "@/components/quantum-bloom/NebulaCanvas";
import { EntryOverlay } from "@/components/quantum-bloom/EntryOverlay";
import { CelebrationLayer } from "@/components/quantum-bloom/CelebrationLayer";
import { DiscoveryToast } from "@/components/quantum-bloom/DiscoveryToast";
import { CosmicWeatherLayer } from "@/components/quantum-bloom/CosmicWeatherLayer";
import { SanctuaryShell } from "@/components/quantum-bloom/SanctuaryShell";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          This page didn't load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. You can try refreshing or head back home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Account Intel Hub" },
      { name: "description", content: "AnSer Ops — HIPAA-Safeguarded internal operations portal." },
      { name: "author", content: "AnSer Ops" },
      { property: "og:title", content: "Account Intel Hub" },
      { property: "og:description", content: "AnSer Ops — HIPAA-Safeguarded internal operations portal." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "twitter:title", content: "Account Intel Hub" },
      { name: "twitter:description", content: "AnSer Ops — HIPAA-Safeguarded internal operations portal." },
      { property: "og:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/187a321c-deb4-4c2f-992d-26d46a5f6e6a/id-preview-d569e755--cc586992-4bbf-4c2f-b7d5-316f472a3f0f.lovable.app-1781258568669.png" },
      { name: "twitter:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/187a321c-deb4-4c2f-992d-26d46a5f6e6a/id-preview-d569e755--cc586992-4bbf-4c2f-b7d5-316f472a3f0f.lovable.app-1781258568669.png" },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
      { rel: "icon", type: "image/png", href: "/favicon.png" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const router = useRouter();
  useApplyDisplayPrefs();
  useApplyTheme();
  usePointerGlow();
  const theme = useTheme();

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event !== "SIGNED_IN" && event !== "SIGNED_OUT" && event !== "USER_UPDATED") return;
      if (event === "SIGNED_OUT") purgeLocalAppData();
      router.invalidate();
      if (event !== "SIGNED_OUT") queryClient.invalidateQueries();
    });
    return () => { sub.subscription.unsubscribe(); };
  }, [router, queryClient]);

  return (
    <QueryClientProvider client={queryClient}>
      {theme === "quantum-bloom" ? <NebulaCanvas /> : <GalaxyBackground />}
      {theme === "quantum-bloom" && <QuantumBloomDriver />}
      {theme === "quantum-bloom" && <EntryOverlay />}
      {theme === "quantum-bloom" && <CelebrationLayer />}
      {theme === "quantum-bloom" && <DiscoveryToast />}
      {theme === "quantum-bloom" && <CosmicWeatherLayer />}
      {theme === "quantum-bloom" && <SanctuaryShell />}
      <Outlet />
      <Toaster />
    </QueryClientProvider>
  );
}
