import { beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { ItemDetailDialog } from "./NightPlan";
import { nightPlanStore, type NightPlanItem } from "@/lib/night-plan-store";

vi.mock("@tanstack/react-router", () => ({ useNavigate: () => vi.fn() }));
vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }));

const base: NightPlanItem = {
  id: "n1",
  task: "Verify overnight backup",
  priority: "normal",
  status: "todo",
  createdAt: Date.parse("2026-08-14T02:00:00Z"),
};

function mount(item: NightPlanItem, onClose = () => {}) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() => root.render(<ItemDetailDialog item={item} onClose={onClose} />));
  return { root, host };
}

function findButton(text: string) {
  return [...document.querySelectorAll("button")].find((b) =>
    (b.textContent ?? "").includes(text),
  ) as HTMLButtonElement | undefined;
}

function click(text: string) {
  const btn = findButton(text);
  if (!btn) throw new Error(`button not found: ${text}`);
  act(() => btn.dispatchEvent(new MouseEvent("click", { bubbles: true })));
}

describe("night plan completion decision flow", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("shows Completed and Carry Over inside the same dialog and marks done", () => {
    const spy = vi.spyOn(nightPlanStore, "setStatus").mockImplementation(() => {});
    mount(base);
    click("Finish Task");
    expect(document.body.textContent).toContain("What happened with this task?");
    expect(document.body.textContent).toContain("Completed");
    expect(document.body.textContent).toContain("Carry Over");
    // only one modal content / overlay mounted
    expect(document.querySelectorAll('[data-slot="dialog-content"], [role="dialog"]').length).toBeLessThanOrEqual(1);
    click("Completed");
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith("n1", "done");
  });

  it("carries over an unfinished task", () => {
    const spy = vi.spyOn(nightPlanStore, "setStatus").mockImplementation(() => {});
    mount({ ...base, id: "n2" });
    click("Finish Task");
    click("Carry Over");
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith("n2", "carried");
  });

  it("cancel returns to detail without changing state", () => {
    const spy = vi.spyOn(nightPlanStore, "setStatus").mockImplementation(() => {});
    mount({ ...base, id: "n3" });
    click("Finish Task");
    click("Cancel");
    expect(spy).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain("Item Detail");
  });

  it("renders visible item detail content with all actions", () => {
    mount({ ...base, id: "n4", notes: "check tapes" });
    const content = document.querySelector('[data-slot="dialog-content"]');
    expect(content).toBeTruthy();
    expect(document.querySelectorAll('[data-slot="dialog-overlay"]').length).toBe(1);
    const text = document.body.textContent ?? "";
    expect(text).toContain("Verify overnight backup");
    expect(text).toContain("Finish Task");
    expect(text).toContain("Convert to Additional Work");
    expect(text).toContain("Edit");
  });

  it("dismisses a task and leaves no orphan overlay", () => {
    const spy = vi.spyOn(nightPlanStore, "setStatus").mockImplementation(() => {});
    let open = true;
    const { root } = mount({ ...base, id: "n5" }, () => {
      open = false;
    });
    click("Finish Task");
    click("Dismiss");
    expect(spy).toHaveBeenCalledWith("n5", "dismissed");
    expect(open).toBe(false);
    act(() => root.unmount());
    expect(document.querySelectorAll('[data-slot="dialog-overlay"]').length).toBe(0);
    expect(document.querySelectorAll('[data-slot="dialog-content"]').length).toBe(0);
  });
});
