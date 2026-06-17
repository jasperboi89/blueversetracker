import { createPersistedStore, useStoreValue } from "./_persist";

export type EventFrequency = "off" | "low" | "normal" | "high";
export type ParticleDensity = "low" | "medium" | "high";

export interface QbTuningState {
  visualIntensity: number; // 1..5
  eventFrequency: EventFrequency;
  particleDensity: ParticleDensity;
  sleepMode: boolean;
  nightShiftSync: boolean;
  celebrations: boolean;
}

const DEFAULT: QbTuningState = {
  visualIntensity: 3,
  eventFrequency: "normal",
  particleDensity: "medium",
  sleepMode: true,
  nightShiftSync: true,
  celebrations: true,
};

export const qbTuningStore = createPersistedStore<QbTuningState>(
  "aih:qb:tuning:v1",
  DEFAULT,
);

export function useQbTuning(): QbTuningState {
  return useStoreValue(qbTuningStore, DEFAULT);
}

export function setQbTuning(patch: Partial<QbTuningState>) {
  qbTuningStore.update((c) => ({ ...c, ...patch }));
}

/** 0.4 → 1.4 multiplier mapped from 1..5. */
export function intensityToFactor(v: number): number {
  const clamped = Math.max(1, Math.min(5, v));
  return 0.4 + (clamped - 1) * 0.25;
}

/** Particle count multipliers. */
export const PARTICLE_MULT: Record<ParticleDensity, number> = {
  low: 0.5,
  medium: 1,
  high: 1.8,
};
