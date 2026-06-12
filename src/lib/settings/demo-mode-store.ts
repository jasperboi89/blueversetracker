import { createPersistedStore, useStoreValue } from "./_persist";

export interface DemoModeState {
  enabled: boolean;
}

const DEFAULT: DemoModeState = { enabled: true };

export const demoModeStore = createPersistedStore<DemoModeState>(
  "aih:settings:demo-mode:v1",
  DEFAULT,
);

export function useDemoMode(): boolean {
  return useStoreValue(demoModeStore, DEFAULT).enabled;
}

export function setDemoMode(enabled: boolean) {
  demoModeStore.set({ enabled });
}