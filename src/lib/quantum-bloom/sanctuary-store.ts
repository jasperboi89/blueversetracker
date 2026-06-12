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
  enter() { if (!active) { active = true; emit(); } },
  exit() { if (active) { active = false; emit(); } },
  toggle() { active = !active; emit(); },
  subscribe(l: () => void) { listeners.add(l); return () => listeners.delete(l); },
};

export function useSanctuary(): boolean {
  return useSyncExternalStore(
    (l) => sanctuary.subscribe(l),
    () => sanctuary.isActive(),
    () => false,
  );
}
