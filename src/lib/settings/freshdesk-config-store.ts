import { createPersistedStore, useStoreValue } from "./_persist";

export type FreshdeskStatus = "not-connected" | "connected" | "error";

export interface FreshdeskConfig {
  /** subdomain (e.g. "acme" for acme.freshdesk.com) — non-secret, ok in localStorage */
  domain: string;
  /** masked tail of the api key for display only (e.g. "••••••••a1b2") */
  apiKeyTail: string;
  status: FreshdeskStatus;
  lastSuccessAt?: number;
  lastErrorMessage?: string;
  /** agent name returned by last successful test, for display */
  agentName?: string;
}

export const DEFAULT_FRESHDESK_CONFIG: FreshdeskConfig = {
  domain: "",
  apiKeyTail: "",
  status: "not-connected",
};

export const freshdeskConfigStore = createPersistedStore<FreshdeskConfig>(
  "aih:settings:freshdesk-config:v1",
  DEFAULT_FRESHDESK_CONFIG,
);

export function useFreshdeskConfig(): FreshdeskConfig {
  return useStoreValue(freshdeskConfigStore, DEFAULT_FRESHDESK_CONFIG);
}

/** Record a successful test/connection. Stores domain + last4 of key only. */
export function markFreshdeskConnected(domain: string, apiKeyLast4: string, agentName?: string) {
  freshdeskConfigStore.update((c) => ({
    ...c,
    domain,
    apiKeyTail: `••••••••${apiKeyLast4}`,
    status: "connected",
    lastSuccessAt: Date.now(),
    lastErrorMessage: undefined,
    agentName,
  }));
}
export function markFreshdeskError(message: string) {
  freshdeskConfigStore.update((c) => ({ ...c, status: "error", lastErrorMessage: message }));
}
export function clearFreshdeskConfig() {
  freshdeskConfigStore.set(DEFAULT_FRESHDESK_CONFIG);
}