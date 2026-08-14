import { beforeEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { setTheme, themeStore, THEME_NAMES, type ThemeName } from "./theme-store";

const CSS = readFileSync(resolve(process.cwd(), "src/styles.css"), "utf8");
const HQ = 'html[data-theme="holoquiet"]';

describe("theme registration", () => {
  beforeEach(() => {
    localStorage.clear();
    themeStore.set({ theme: "blueverse", qbFirstEntryCompleted: false });
  });

  it("registers exactly the three production themes", () => {
    expect(THEME_NAMES).toEqual(["blueverse", "quantum-bloom", "holoquiet"]);
  });

  it("selects and persists each theme the same way", () => {
    for (const name of THEME_NAMES) {
      setTheme(name);
      expect(themeStore.get().theme).toBe(name);
      const raw = localStorage.getItem("aih:settings:theme:v1");
      expect(raw && (JSON.parse(raw) as { theme: ThemeName }).theme).toBe(name);
    }
  });

  it("keeps unrelated theme state intact when switching", () => {
    themeStore.set({ theme: "quantum-bloom", qbFirstEntryCompleted: true });
    setTheme("holoquiet");
    expect(themeStore.get().qbFirstEntryCompleted).toBe(true);
  });
});

describe("holoquiet stylesheet", () => {
  it("scopes every rule to the holoquiet attribute so other themes are untouched", () => {
    const block = CSS.slice(CSS.indexOf("/* HOLOQUIET"));
    const selectors = block
      .split("\n")
      .filter((l) => l.trim().endsWith("{") && !l.trim().startsWith("@") && !l.includes("("))
      .map((l) => l.trim());
    for (const sel of selectors) {
      expect(
        sel.includes('[data-theme="holoquiet"]') || sel.startsWith(".hq-"),
        `unscoped selector: ${sel}`,
      ).toBe(true);
    }
  });

  it("defines the semantic material and rim token system", () => {
    for (const token of [
      "--hq-bg-architecture",
      "--hq-workglass",
      "--hq-workglass-elevated",
      "--hq-data-glass",
      "--hq-spectral-glass",
      "--hq-rim-active",
      "--hq-rim-ai",
      "--hq-rim-warning",
      "--hq-rim-blocked",
      "--hq-rim-success",
      "--hq-shadow-low",
      "--hq-shadow-elevated",
      "--hq-telemetry",
    ]) {
      expect(CSS).toContain(token);
    }
  });

  it("styles CURRENT / NEXT / WATCH / BLOCKED semantic states", () => {
    for (const cls of [
      ".focus-current",
      ".focus-next",
      ".focus-watch--info",
      ".focus-watch--warning",
      ".focus-watch--critical",
      ".focus-blocked",
    ]) {
      expect(CSS).toContain(`${HQ} ${cls}`);
    }
  });

  it("gives the active Focus Field a holoquiet-specific treatment", () => {
    expect(CSS).toContain(`${HQ} [data-focus-field="active"]`);
    expect(CSS).toContain(`${HQ} .focus-active-surface[data-focus-active="true"]`);
  });

  it("gives Copilot Spectral Glass and the executor state grammar", () => {
    expect(CSS).toContain(`${HQ} [data-surface="copilot"]`);
    for (const s of ["executing", "success", "failed", "uncertain"]) {
      expect(CSS).toContain(`${HQ} [data-action-state="${s}"]`);
    }
  });

  it("keeps a visible keyboard focus ring", () => {
    expect(CSS).toContain(":focus-visible");
    expect(CSS).toContain("--hq-ion-cyan");
  });

  it("has a reduced-motion branch that disables spectral motion", () => {
    const rm = CSS.slice(
      CSS.indexOf('html[data-theme="holoquiet"] [data-surface="copilot"][data-busy="true"]::before'),
    );
    expect(rm).toContain('[data-surface="copilot"][data-busy="true"]::before');
    expect(rm).toContain("animation: none");
  });

  it("stops decorative motion for the reduced-motion setting too", () => {
    expect(CSS).toContain('html[data-motion="reduced"] [class*="qb-"]');
  });

  it("defines the Ambient / Working / Command surface hierarchy", () => {
    for (const cls of [".hq-ambient", ".hq-working", ".hq-command"]) {
      expect(CSS).toContain(`${HQ} ${cls}`);
    }
  });

  it("gives Liam Command Core its own command-plane treatment and states", () => {
    expect(CSS).toContain(`${HQ} [data-surface="command-core"]`);
    for (const s of ["working", "attention", "ready"]) {
      expect(CSS).toContain(`[data-core-state="${s}"]`);
    }
  });

  it("adds architectural depth planes and ultrawide workspace width", () => {
    expect(CSS).toContain(".hq-architecture::before");
    expect(CSS).toContain(".hq-workspace :is(.max-w-7xl, .max-w-6xl)");
  });

  it("stops the new decorative motion under reduced motion", () => {
    const rm = CSS.slice(CSS.indexOf("@media (prefers-reduced-motion: reduce)"));
    expect(rm).toContain('[data-surface="command-core"]::after');
    expect(rm).toContain(`${HQ} .hq-working:hover`);
  });

  it("does not restyle BlueVerse or Quantum Bloom surfaces globally", () => {
    const block = CSS.slice(CSS.indexOf("/* HOLOQUIET"));
    expect(block).not.toContain('[data-theme="quantum-bloom"]');
    expect(block.match(/^\.glass-panel/m)).toBeNull();
  });
});

describe("holoquiet optics pass", () => {
  it("makes Workglass translucent with internal illumination", () => {
    const optics = CSS.slice(CSS.indexOf("HOLOQUIET OPTICS"));
    expect(optics).toContain("--hq-glass-tint");
    expect(optics).toContain("--hq-glass-tint-deep");
    expect(optics).toContain(`${HQ} .hq-working`);
  });

  it("adds an edge-refraction film that migrates spectrally on approach", () => {
    const optics = CSS.slice(CSS.indexOf("HOLOQUIET OPTICS"));
    expect(optics).toContain("--hq-refract-cool");
    expect(optics).toContain("--hq-refract-warm");
    expect(optics).toContain("mask-composite: exclude");
  });

  it("couples environmental light to the active workflow zone", () => {
    const optics = CSS.slice(CSS.indexOf("HOLOQUIET OPTICS"));
    for (const zone of ["dispatch", "knowledge", "tickets", "additional", "completed"]) {
      expect(optics).toContain(`.hq-workspace[data-workflow="${zone}"]`);
    }
  });

  it("treats status cards as integrated instruments with semantic tones", () => {
    const optics = CSS.slice(CSS.indexOf("HOLOQUIET OPTICS"));
    expect(optics).toContain(`${HQ} .hq-instrument`);
    for (const tone of ["active", "waiting", "ai", "success", "attention"]) {
      expect(optics).toContain(`.hq-instrument[data-hq-tone="${tone}"]`);
    }
  });

  it("keeps the optics pass scoped and reduced-motion aware", () => {
    const optics = CSS.slice(CSS.indexOf("HOLOQUIET OPTICS"));
    expect(optics).not.toContain('[data-theme="quantum-bloom"]');
    expect(optics).not.toContain('[data-theme="blueverse"]');
    expect(optics).toContain('html[data-motion="reduced"][data-theme="holoquiet"] .hq-instrument');
  });
});

describe("holoquiet radical spatial redesign", () => {
  const REDESIGN = CSS.slice(CSS.indexOf("HOLOQUIET RADICAL SPATIAL REDESIGN"));

  it("replaces enclosing card frames with partial-frame planes", () => {
    expect(REDESIGN).toContain(`${HQ} .glass-panel`);
    expect(REDESIGN).toContain("--hq-plane-tint");
    expect(REDESIGN).toContain("--hq-anchor");
  });

  it("gives the command plane its own clipped geometry", () => {
    expect(REDESIGN).toContain(`${HQ} [data-surface="command-core"]`);
    expect(REDESIGN).toContain("clip-path: polygon(");
  });

  it("redesigns the navigation rail and launcher deck", () => {
    expect(REDESIGN).toContain(`${HQ} [data-slot="sidebar-menu-button"][data-active="true"]`);
    expect(REDESIGN).toContain(`${HQ} .hq-deck-key`);
  });

  it("adds a spatial page transition that reduced motion disables", () => {
    expect(REDESIGN).toContain("hq-plane-in-a");
    expect(REDESIGN).toContain('html[data-motion="reduced"][data-theme="holoquiet"] .hq-workspace[data-nav-tick="a"] > *');
  });

  it("stays scoped away from the other two themes", () => {
    expect(REDESIGN).not.toContain('[data-theme="quantum-bloom"]');
    expect(REDESIGN).not.toContain('[data-theme="blueverse"]');
  });
});
