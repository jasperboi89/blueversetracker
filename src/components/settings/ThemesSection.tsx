import { Palette, Sparkles, Check, BookOpen, Stars } from "lucide-react";
import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { setTheme, useTheme } from "@/lib/settings/theme-store";
import { DiscoveryLogDrawer } from "@/components/quantum-bloom/DiscoveryLogDrawer";
import {
  setQbTuning,
  useQbTuning,
  type EventFrequency,
  type ParticleDensity,
} from "@/lib/settings/qb-tuning-store";
import { useDropdownGroup } from "@/lib/settings/dropdowns-store";

const INTENSITY_LABEL = ["", "Whisper", "Gentle", "Balanced", "Vivid", "Radiant"];

export function ThemesSection() {
  const theme = useTheme();
  const [logOpen, setLogOpen] = useState(false);
  const qbActive = theme === "quantum-bloom";
  const tuning = useQbTuning();
  const frequencyOptions = useDropdownGroup("qbEventFrequency");
  const densityOptions = useDropdownGroup("qbParticleDensity");

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
          <Switch
            checked={tuning.nightShiftSync}
            onCheckedChange={(v) => setQbTuning({ nightShiftSync: v })}
          />
        </div>

        <div className="mt-2 flex items-center justify-between rounded-md bg-white/[0.02] px-3 py-2 text-xs">
          <div>
            <div className="font-medium text-foreground">Achievement Celebrations</div>
            <div className="text-muted-foreground">
              Bloom pulses on ticket, dispatch, night plan, and shift completion.
            </div>
          </div>
          <Switch
            checked={tuning.celebrations}
            onCheckedChange={(v) => setQbTuning({ celebrations: v })}
          />
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

        <div className="mt-2 flex items-center justify-between rounded-md bg-white/[0.02] px-3 py-2 text-xs">
          <div>
            <div className="flex items-center gap-2 font-medium text-foreground">
              <Stars className="h-3.5 w-3.5" />
              Constellation View
            </div>
            <div className="text-muted-foreground">
              Your discovery sky, timeline, and Quantum Bloom Core readouts.
            </div>
          </div>
          {qbActive ? (
            <Button asChild size="sm" variant="secondary">
              <Link to="/constellations">Open</Link>
            </Button>
          ) : (
            <Button size="sm" variant="secondary" disabled>Open</Button>
          )}
        </div>

        {/* Live tuning controls */}
        <div className={`mt-3 space-y-3 rounded-md border border-border/30 p-3 ${qbActive ? "" : "opacity-60 pointer-events-none"}`}>
          <div>
            <div className="flex items-baseline justify-between text-xs">
              <span className="font-medium text-foreground">Visual Intensity</span>
              <span className="text-muted-foreground">{INTENSITY_LABEL[tuning.visualIntensity]}</span>
            </div>
            <Slider
              className="mt-2"
              min={1}
              max={5}
              step={1}
              value={[tuning.visualIntensity]}
              onValueChange={(v) => setQbTuning({ visualIntensity: v[0] })}
            />
          </div>

          <div className="flex items-center justify-between gap-3 text-xs">
            <div>
              <div className="font-medium text-foreground">Event Frequency</div>
              <div className="text-muted-foreground">Pace of cosmic weather events.</div>
            </div>
            <Select
              value={tuning.eventFrequency}
              onValueChange={(v) => setQbTuning({ eventFrequency: v as EventFrequency })}
            >
              <SelectTrigger className="h-8 w-32 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {frequencyOptions.map((o) => <SelectItem key={o.id} value={o.id}>{o.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center justify-between gap-3 text-xs">
            <div>
              <div className="font-medium text-foreground">Particle Density</div>
              <div className="text-muted-foreground">Sparkle and burst count.</div>
            </div>
            <Select
              value={tuning.particleDensity}
              onValueChange={(v) => setQbTuning({ particleDensity: v as ParticleDensity })}
            >
              <SelectTrigger className="h-8 w-32 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {densityOptions.map((o) => <SelectItem key={o.id} value={o.id}>{o.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center justify-between gap-3 text-xs">
            <div>
              <div className="font-medium text-foreground">Daytime Sleep Mode</div>
              <div className="text-muted-foreground">Dim the nebula outside the shift window.</div>
            </div>
            <Switch
              checked={tuning.sleepMode}
              onCheckedChange={(v) => setQbTuning({ sleepMode: v })}
            />
          </div>

          <div className="flex items-center justify-between rounded-md px-1 py-1 text-xs opacity-60">
            <div>
              <div className="flex items-center gap-2 font-medium text-foreground">
                Ambient Atmosphere
                <span className="rounded-full border border-border/40 px-1.5 py-px text-[9px] uppercase tracking-wider text-muted-foreground">
                  Coming soon
                </span>
              </div>
              <div className="text-muted-foreground">Subtle ambient soundscape during shift hours.</div>
            </div>
            <Switch checked={false} disabled />
          </div>
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