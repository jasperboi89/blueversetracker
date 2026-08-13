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
    const rm = CSS.slice(CSS.lastIndexOf("@media (prefers-reduced-motion: reduce)"));
    expect(rm).toContain('[data-surface="copilot"][data-busy="true"]::before');
    expect(rm).toContain("animation: none");
  });

  it("does not restyle BlueVerse or Quantum Bloom surfaces globally", () => {
    const block = CSS.slice(CSS.indexOf("/* HOLOQUIET"));
    expect(block).not.toContain('[data-theme="quantum-bloom"]');
    expect(block.match(/^\.glass-panel/m)).toBeNull();
  });
});
