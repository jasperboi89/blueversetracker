import { describe, expect, it, beforeEach } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";
import fs from "node:fs";
import path from "node:path";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "./dialog";

function mount(node: React.ReactNode) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() => root.render(node));
  return root;
}

const zOf = (el: Element | null) => {
  const cls = el?.className ?? "";
  const m = /z-\[(\d+)\]/.exec(String(cls));
  return m ? Number(m[1]) : /z-50/.test(String(cls)) ? 50 : 0;
};

describe("shared dialog overlay layer contract", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("emits stable data-slot hooks and keeps content above its overlay", () => {
    mount(
      <Dialog open>
        <DialogContent>
          <DialogTitle>Layer test</DialogTitle>
          <DialogDescription>Visible above the overlay.</DialogDescription>
        </DialogContent>
      </Dialog>,
    );
    const overlay = document.querySelector('[data-slot="dialog-overlay"]');
    const content = document.querySelector('[data-slot="dialog-content"]');
    expect(overlay).toBeTruthy();
    expect(content).toBeTruthy();
    expect(zOf(content)).toBeGreaterThan(zOf(overlay));
    expect(document.body.textContent).toContain("Layer test");
    // content keeps ownership of its centering transform
    expect(String(content?.className)).toContain("translate-x-[-50%]");
    expect(String(content?.className)).toContain("translate-y-[-50%]");
    // portaled outside the local React host
    expect(content?.closest("body")).toBe(document.body);
  });

  it("theme CSS never applies a positional transform to .glass-panel", () => {
    const css = fs.readFileSync(path.resolve("src/styles.css"), "utf8");
    const offenders = css
      .split("}")
      .filter((block) => /\.glass-panel:(hover|focus-within)[^{]*\{/.test(block + "}") && /transform:/.test(block));
    expect(offenders).toEqual([]);
  });

  it("modal surfaces opt out of ambient decoration layers", () => {
    const css = fs.readFileSync(path.resolve("src/styles.css"), "utf8");
    // the authoritative contract exists and kills theme pseudo-layers on modals
    expect(css).toMatch(
      /\[data-slot="dialog-content"\]::before,[\s\S]*?content: none !important;/,
    );
    // modals get an explicit opaque background so text always has ground
    expect(css).toMatch(
      /\[data-slot="dialog-content"\],[\s\S]*?background-color: var\(--popover\);/,
    );
    // no theme rule may transform a modal surface
    const offenders = css
      .split("}")
      .filter(
        (block) =>
          /\[data-slot="(dialog|alert-dialog|sheet)-content"\][^{]*\{/.test(block + "}") &&
          /(^|[^-])transform:/.test(block),
      );
    expect(offenders).toEqual([]);
  });

  it("keeps dialog content fixed and centered above the page", () => {
    const css = fs.readFileSync(path.resolve("src/styles.css"), "utf8");
    expect(css).toMatch(
      /\[data-slot="dialog-content"\],[\s\S]*?position: fixed;[\s\S]*?left: 50%;[\s\S]*?top: 50%;[\s\S]*?transform: translate\(-50%, -50%\);/,
    );
    expect(css).toMatch(
      /\.glass-panel:not\(\[data-slot="dialog-content"\]\):not\(\[data-slot="alert-dialog-content"\]\):not\(\[data-slot="sheet-content"\]\)/,
    );
  });
});
