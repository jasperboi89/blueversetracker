import { useSyncExternalStore } from "react";

let active = false;
const listeners = new Set<() => void>();

function emit() {
  if (typeof document !== "undefined") {
    if (active) document.documentElement.dataset.qbSanctuary = "on";
    else delete document.documentElement.dataset.qbSanctuary;
  }
  listeners.forEach((l) => l());
}

export const sanctuary = {
  isActive: () => active,
  enter() {
    if (!active) {
      active = true;
      try {
        const key = "achievements:sanctuary_visits";
        const n = Number(localStorage.getItem(key) ?? "0") + 1;
        localStorage.setItem(key, String(n));
      } catch {}
      emit();
    }
  },
  exit() { if (active) { active = false; emit(); } },
  toggle() { active = !active; emit(); },
  subscribe(l: () => void) { listeners.add(l); return () => listeners.delete(l); },
};

export function getSanctuaryVisitCount(): number {
  if (typeof window === "undefined") return 0;
  try {
    return Number(localStorage.getItem("achievements:sanctuary_visits") ?? "0");
  } catch {
    return 0;
  }
}

export function useSanctuary(): boolean {
  return useSyncExternalStore(
    (l) => sanctuary.subscribe(l),
    () => sanctuary.isActive(),
    () => false,
  );
}
