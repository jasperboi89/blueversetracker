import { Palette, Sparkles, Check, BookOpen } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { setTheme, useTheme } from "@/lib/settings/theme-store";
import { DiscoveryLogDrawer } from "@/components/quantum-bloom/DiscoveryLogDrawer";

const QB_TOGGLES: { label: string; description: string }[] = [
  { label: "Quantum Bloom Core",       description: "Adaptive intelligence — learns preferences and active hours." },
  { label: "Adaptive Learning",         description: "Lets the Core remember your favorite phases and workspaces." },
  { label: "Cosmic Weather",            description: "Random atmospheric events (showers, auroras, lightning)." },
  { label: "Ambient Atmosphere",        description: "Subtle ambient soundscape during shift hours." },
  { label: "Daytime Sleep Mode",        description: "Dim the nebula outside shift hours." },
];

export function ThemesSection() {
  const theme = useTheme();
  const [logOpen, setLogOpen] = useState(false);
  const qbActive = theme === "quantum-bloom";

  return (
    <section id="themes" className="glass-panel p-4 sm:p-5">
      <header className="mb-3 flex items-center gap-2">
        <Palette className="h-4 w-4 text-muted-foreground" />
        <h2 className="text-sm font-semibold uppercase tracking-wider text-foreground">
          Themes
        </h2>
      </header>
      <p className="mb-4 text-xs text-muted-foreground">
        BlueVerse is the default. Quantum Bloom is an immersive optional theme that surrounds the
        portal with a living nebula and shifts color phases with the night shift.
      </p>

      <div className="grid gap-3 sm:grid-cols-2">
        <ThemeCard
          name="blueverse"
          title="BlueVerse"
          subtitle="The classic command-deck galaxy"
          gradient="linear-gradient(135deg, oklch(0.32 0.16 220 / 0.7), oklch(0.28 0.14 280 / 0.7))"
          active={theme === "blueverse"}
        />
        <ThemeCard
          name="quantum-bloom"
          title="Quantum Bloom"
          subtitle="Living nebula · Aurora color phases · Crystal glass"
          gradient="linear-gradient(135deg, oklch(0.45 0.22 290 / 0.8), oklch(0.7 0.22 250 / 0.6), oklch(0.85 0.16 210 / 0.5))"
          active={theme === "quantum-bloom"}
        />
      </div>

      {/* Quantum Bloom controls — most are placeholders for later phases */}
      <div className="mt-5 rounded-lg border border-border/40 p-3">
        <div className="mb-2 flex items-center gap-2">
          <Sparkles className="h-3.5 w-3.5 text-muted-foreground" />
          <h3 className="text-xs font-medium uppercase tracking-wider text-foreground">
            Quantum Bloom Settings
          </h3>
        </div>

        <div className="flex items-center justify-between rounded-md bg-white/[0.02] px-3 py-2 text-xs">
          <div>
            <div className="font-medium text-foreground">Night Shift Synchronization</div>
            <div className="text-muted-foreground">
              Color phases follow 10 PM → 6 AM Central. Active in Phase 1.
            </div>
          </div>
          <Switch checked disabled />
        </div>

        <div className="mt-2 flex items-center justify-between rounded-md bg-white/[0.02] px-3 py-2 text-xs">
          <div>
            <div className="font-medium text-foreground">Achievement Celebrations</div>
            <div className="text-muted-foreground">
              Bloom pulses on ticket, dispatch, night plan, and shift completion.
            </div>
          </div>
          <Switch checked disabled />
        </div>

        <div className="mt-2 flex items-center justify-between rounded-md bg-white/[0.02] px-3 py-2 text-xs">
          <div>
            <div className="flex items-center gap-2 font-medium text-foreground">
              <BookOpen className="h-3.5 w-3.5" />
              Discovery Log
            </div>
            <div className="text-muted-foreground">
              {qbActive
                ? "Browse the moments Quantum Bloom has recorded for you."
                : "Enable Quantum Bloom to record discoveries."}
            </div>
          </div>
          <Button
            size="sm"
            variant="secondary"
            disabled={!qbActive}
            onClick={() => setLogOpen(true)}
          >
            Open
          </Button>
        </div>

        <div className="mt-2 space-y-1">
          {QB_TOGGLES.map((t) => (
            <div
              key={t.label}
              className="flex items-center justify-between rounded-md px-3 py-2 text-xs opacity-60"
            >
              <div>
                <div className="flex items-center gap-2 font-medium text-foreground">
                  {t.label}
                  <span className="rounded-full border border-border/40 px-1.5 py-px text-[9px] uppercase tracking-wider text-muted-foreground">
                    Coming soon
                  </span>
                </div>
                <div className="text-muted-foreground">{t.description}</div>
              </div>
              <Switch checked={false} disabled />
            </div>
          ))}
        </div>
      </div>

      <DiscoveryLogDrawer open={logOpen} onOpenChange={setLogOpen} />
    </section>
  );
}

function ThemeCard({
  name,
  title,
  subtitle,
  gradient,
  active,
}: {
  name: "blueverse" | "quantum-bloom";
  title: string;
  subtitle: string;
  gradient: string;
  active: boolean;
}) {
  return (
    <div
      className={`relative overflow-hidden rounded-lg border p-4 transition ${
        active ? "border-primary/60" : "border-border/40 hover:border-border/70"
      }`}
      style={{ background: gradient }}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-foreground">{title}</div>
          <div className="text-xs text-foreground/80">{subtitle}</div>
        </div>
        {active && (
          <span className="inline-flex items-center gap-1 rounded-full bg-background/60 px-2 py-0.5 text-[10px] uppercase tracking-wider text-foreground">
            <Check className="h-3 w-3" /> Active
          </span>
        )}
      </div>
      <div className="mt-4">
        <Button
          size="sm"
          variant={active ? "secondary" : "default"}
          onClick={() => setTheme(name)}
          disabled={active}
        >
          {active ? "In use" : "Use this theme"}
        </Button>
      </div>
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-10 -right-10 h-32 w-32 rounded-full"
        style={{
          background: "radial-gradient(circle, oklch(1 0 0 / 0.18), transparent 60%)",
          filter: "blur(20px)",
        }}
      />
    </div>
  );
}