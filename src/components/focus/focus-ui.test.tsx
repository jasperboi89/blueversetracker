import { describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { FocusPanel } from "./FocusPanel";
import { buildFocusWorkspace, type FocusSnapshot } from "@/lib/core/focus-workspace";

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => vi.fn(),
  // FocusPanel now hosts the Phase 14 work-state section, which reads the
  // Portal Context Envelope through the router location.
  useRouterState: (opts?: { select?: (s: unknown) => unknown }) => {
    const state = { location: { pathname: "/" } };
    return opts?.select ? opts.select(state) : state;
  },
}));
vi.mock("@/lib/core/use-account-context", () => ({ useAccountContext: () => ({ pack: null }) }));

const EMPTY: FocusSnapshot = {
  now: Date.parse("2026-08-13T04:00:00Z"),
  shiftKey: "2026-08-12",
  shiftStatus: "active",
  shiftProgress: 0.2,
  activeWork: null,
  context: { blockers: [] },
  nightPlan: [],
  awareness: [],
  tickets: [],
};

describe("focus panel UI", () => {
  it("renders calm empty states with screen-reader section names", () => {
    const html = renderToStaticMarkup(
      <FocusPanel focus={buildFocusWorkspace(EMPTY)} onClose={() => {}} />,
    );
    for (const name of ["Current work", "Next work", "Items to watch", "Blocked work"]) {
      expect(html).toContain(`aria-label="${name}"`);
    }
    expect(html).toContain("No tracked work active");
    expect(html).toContain("Nothing needs attention");
    expect(html).toContain("Nothing currently blocked");
  });

  it("uses semantic focus state classes rather than colour alone", () => {
    const html = renderToStaticMarkup(
      <FocusPanel
        focus={buildFocusWorkspace({
          ...EMPTY,
          activeWork: {
            kind: "ticket",
            id: "t1",
            label: "Ticket #12345",
            running: true,
            elapsedMs: 120000,
          },
          tickets: [
            { id: "t2", number: "2", status: "waiting-cs", updatedAt: 1, accountNumber: "1" },
          ],
        })}
        onClose={() => {}}
      />,
    );
    expect(html).toContain("focus-current");
    expect(html).toContain("focus-blocked");
    expect(html).toContain("Waiting on Customer Service");
  });

  it("closes through its keyboard-reachable close control", async () => {
    const onClose = vi.fn();
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    await act(async () => {
      root.render(<FocusPanel focus={buildFocusWorkspace(EMPTY)} onClose={onClose} />);
    });
    const close = host.querySelector<HTMLButtonElement>("button");
    expect(close?.className).toContain("focus-visible:ring");
    await act(async () => {
      close?.click();
    });
    expect(onClose).toHaveBeenCalled();
    await act(async () => root.unmount());
    host.remove();
  });
});
