import type { Capabilities, ModelTier } from "./task-types";

/**
 * Central model registry. Model ids live here and nowhere else, so swapping a
 * provider/model never requires touching feature code.
 */
export interface ModelProfile {
  id: string;
  provider: string;
  tier: ModelTier;
  capabilities: Capabilities;
  enabled: boolean;
  /** Higher wins inside a tier. */
  priority: number;
  maxOutputTokens?: number;
}

const ALL: Capabilities = {
  tools: true,
  vision: true,
  structuredOutput: true,
  streaming: true,
  longContext: true,
};

/**
 * Models actually reachable through the configured Lovable AI Gateway today.
 * All three are OpenAI Responses-API models (tools + vision + structured
 * output + streaming).
 */
export const MODEL_REGISTRY: ModelProfile[] = [
  {
    id: "openai/gpt-5.6-luna",
    provider: "lovable-gateway",
    tier: "fast",
    capabilities: { ...ALL, longContext: false },
    enabled: true,
    priority: 100,
    maxOutputTokens: 1200,
  },
  {
    id: "openai/gpt-5.6-terra",
    provider: "lovable-gateway",
    tier: "balanced",
    capabilities: { ...ALL },
    enabled: true,
    priority: 100,
    maxOutputTokens: 4000,
  },
  {
    id: "openai/gpt-5.4-mini",
    provider: "lovable-gateway",
    tier: "balanced",
    capabilities: { ...ALL },
    enabled: true,
    priority: 50,
    maxOutputTokens: 4000,
  },
  {
    id: "openai/gpt-5.6-sol",
    provider: "lovable-gateway",
    tier: "flagship",
    capabilities: { ...ALL },
    enabled: true,
    priority: 100,
    maxOutputTokens: 8000,
  },
  {
    id: "openai/gpt-5.5",
    provider: "lovable-gateway",
    tier: "flagship",
    capabilities: { ...ALL },
    enabled: true,
    priority: 50,
    maxOutputTokens: 8000,
  },
];

/* ---------------------------------------------------------------- health -- */

const COOLDOWN_MS = 60_000;
const FAILS_BEFORE_COOLDOWN = 3;
const health = new Map<string, { fails: number; until: number }>();

export function reportModelFailure(id: string, now = Date.now()) {
  const entry = health.get(id) ?? { fails: 0, until: 0 };
  entry.fails += 1;
  if (entry.fails >= FAILS_BEFORE_COOLDOWN) {
    entry.until = now + COOLDOWN_MS;
    entry.fails = 0;
  }
  health.set(id, entry);
}

export function reportModelSuccess(id: string) {
  health.delete(id);
}

export function isModelHealthy(id: string, now = Date.now()): boolean {
  const entry = health.get(id);
  return !entry || entry.until <= now;
}

export function resetModelHealth() {
  health.clear();
}

/* -------------------------------------------------------------- selection -- */

function satisfies(profile: ModelProfile, required: Partial<Capabilities>): boolean {
  return (Object.keys(required) as Array<keyof Capabilities>).every(
    (cap) => !required[cap] || profile.capabilities[cap],
  );
}

/** Highest-priority enabled + healthy model in a tier that has the capabilities. */
export function selectModel(
  tier: ModelTier,
  required: Partial<Capabilities> = {},
  registry: ModelProfile[] = MODEL_REGISTRY,
  now = Date.now(),
): ModelProfile | undefined {
  const candidates = registry
    .filter((m) => m.tier === tier && m.enabled && satisfies(m, required))
    .sort((a, b) => b.priority - a.priority);
  return candidates.find((m) => isModelHealthy(m.id, now)) ?? candidates[0];
}

export function modelById(id: string, registry: ModelProfile[] = MODEL_REGISTRY) {
  return registry.find((m) => m.id === id);
}