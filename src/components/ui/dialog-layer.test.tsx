import { describe, expect, it, beforeEach } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";
import fs from "node:fs";
import path from "node:path";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "./dialog";
import { Sheet, SheetContent, SheetTitle } from "./sheet";

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
    // Important utilities keep production/theme CSS from moving the modal.
    expect(String(content?.className)).toContain("!fixed");
    expect(String(content?.className)).toContain("!left-1/2");
    expect(String(content?.className)).toContain("!top-1/2");
    expect(String(content?.className)).toContain("!-translate-x-1/2");
    expect(String(content?.className)).toContain("!-translate-y-1/2");
    // portaled outside the local React host
    expect(content?.closest("body")).toBe(document.body);
    expect((content as HTMLElement).style.position).toBe("fixed");
    expect((content as HTMLElement).style.transform).toBe("translate(-50%, -50%)");
    expect((content as HTMLElement).style.zIndex).toBe("70");
  });

  it("keeps sheet content fixed to the viewport above its overlay", () => {
    mount(
      <Sheet open>
        <SheetContent side="right">
          <SheetTitle>Night Plan</SheetTitle>
        </SheetContent>
      </Sheet>,
    );
    const overlay = document.querySelector('[data-slot="sheet-overlay"]');
    const content = document.querySelector('[data-slot="sheet-content"]') as HTMLElement | null;
    expect(overlay).toBeTruthy();
    expect(content).toBeTruthy();
    expect(zOf(content)).toBeGreaterThan(zOf(overlay));
    expect(String(content?.className)).toContain("!fixed");
    expect(String(content?.className)).toContain("!z-[70]");
    expect(content?.style.position).toBe("fixed");
    expect(content?.style.top).toBe("0px");
    expect(content?.style.right).toBe("0px");
    expect(content?.style.bottom).toBe("0px");
    expect(content?.style.zIndex).toBe("70");
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
    // no theme-scoped rule may transform a modal surface; the authoritative
    // modal contract below intentionally owns the centering transform
    const offenders = css
      .split("}")
      // exclusion selectors (":not([data-slot=...])") are not targets
      .map((block) => block.replace(/:not\(\[data-slot="[^"]+"\]\)/g, ""))
      .filter(
        (block) =>
          /html\[data-theme=/.test(block) &&
          /\[data-slot="(dialog|alert-dialog|sheet)-content"\][^{]*\{/.test(block + "}") &&
          /(^|[^-])transform:/.test(block),
      );
    expect(offenders).toEqual([]);
  });

  it("keeps ambient HoloQuiet material rules away from modal content", () => {
    const css = fs.readFileSync(path.resolve("src/styles.css"), "utf8");
    expect(css).toMatch(
      /\.glass-panel:not\(\[data-slot="dialog-content"\]\):not\(\[data-slot="alert-dialog-content"\]\):not\(\[data-slot="sheet-content"\]\)/,
    );
  });

  it("HoloQuiet hover float lifts panes but never overlay surfaces", () => {
    const css = fs.readFileSync(path.resolve("src/styles.css"), "utf8");
    // the float itself exists
    expect(css).toMatch(/transform:.*translateY\(var\(--hq-lift-float\)\).*scale\(var\(--hq-scale-float\)\)/);
    // every hover/active block that applies the float excludes overlay slots
    const floatBlocks = css
      .split("}")
      .filter((block) => /(--hq-lift-float|translateY\(0\) scale\(1\))/.test(block) && /:hover|:active/.test(block));
    expect(floatBlocks.length).toBeGreaterThan(0);
    for (const block of floatBlocks) {
      for (const slot of ["dialog-content", "alert-dialog-content", "sheet-content", "popover-content"]) {
        expect(block).toContain(`:not([data-slot="${slot}"])`);
      }
    }
  });
});
