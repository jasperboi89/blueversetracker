import { createFileRoute, Link } from "@tanstack/react-router";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useDiscoveries } from "@/hooks/use-discoveries";
import { ConstellationField } from "@/components/quantum-bloom/ConstellationField";
import { ArchiveTimeline } from "@/components/quantum-bloom/ArchiveTimeline";
import { CoreCard } from "@/components/quantum-bloom/CoreCard";
import { useTheme } from "@/lib/settings/theme-store";

export const Route = createFileRoute("/_authenticated/constellations")({
  head: () => ({
    meta: [
      { title: "Constellations — Quantum Bloom" },
      { name: "description", content: "Your Discovery sky and Quantum Bloom Core readouts." },
    ],
  }),
  component: ConstellationsPage,
});

function ConstellationsPage() {
  const theme = useTheme();
  const { rows, loading, clearAll } = useDiscoveries(true);

  if (theme !== "quantum-bloom") {
    return (
      <div className="mx-auto max-w-2xl">
        <div className="glass-panel p-6 text-center text-sm text-muted-foreground">
          Constellations are only available while the Quantum Bloom theme is active.
          <div className="mt-3">
            <Link to="/settings" className="text-primary underline">
              Open Settings → Themes
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-5">
      <header>
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          Constellations
        </h1>
        <p className="text-sm text-muted-foreground">
          Every discovery you've unlocked, mapped to the sky.
          {loading && rows.length === 0 ? " Loading…" : ""}
        </p>
      </header>

      <CoreCard rows={rows} onReset={clearAll} />

      <Tabs defaultValue="constellations" className="w-full">
        <TabsList>
          <TabsTrigger value="constellations">Constellations</TabsTrigger>
          <TabsTrigger value="timeline">Timeline</TabsTrigger>
        </TabsList>
        <TabsContent value="constellations" className="mt-4">
          <ConstellationField rows={rows} />
        </TabsContent>
        <TabsContent value="timeline" className="mt-4">
          <ArchiveTimeline rows={rows} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
