/**
 * Account Context service — default source wiring, caching, invalidation.
 *
 * Consumers ask for an account by number and get one bounded, provenance-
 * tagged pack. Nothing here owns data: each port reads the authoritative
 * store or server function that already owns that slice.
 */
import { accountsStore } from "@/lib/accounts-store";
import { ticketsStore } from "@/lib/tickets-store";
import { workLogStore } from "@/lib/workspace/work-log-store";
import { additionalWorkStore } from "@/lib/additional-work-store";
import { dispatchStore } from "@/lib/dispatch-store";
import { coverageStore, computeCoverageGaps } from "@/lib/coverage/coverage-store";
import { isAccountActiveRecurring, getRecurringRows } from "@/lib/reports/recurring-issues";
import { awarenessStore } from "./awareness-store";
import { eventSpine } from "./event-spine";
import type { AccEventType } from "./events";
import { listChangeRecords } from "@/lib/changes/changes.functions";
import { listKnowledgeVault } from "@/lib/knowledge/knowledge.functions";
import {
  assembleAccountContext,
  knowledgeMatchesAccount,
  type AccountContextOptions,
  type AccountContextPack,
  type AccountContextPorts,
} from "./account-context";

/** Events that can invalidate an account's cached pack. */
const INVALIDATING: readonly AccEventType[] = [
  "ticket.opened",
  "ticket.pulled",
  "ticket.status_changed",
  "ticket.completed",
  "work.started",
  "work.completed",
  "dispatch.completed",
  "dispatch.retested",
  "change.created",
  "change.applied",
  "change.verified",
  "coverage.expiring",
  "coverage.confirmed",
  "knowledge.created",
  "knowledge.updated",
];

export const CONTEXT_TTL_MS = 60_000;

interface CacheEntry {
  key: string;
  at: number;
  pack: AccountContextPack;
  inflight?: Promise<AccountContextPack>;
}

const cache = new Map<string, CacheEntry>();

export const defaultAccountContextPorts: AccountContextPorts = {
  identity: (num) => {
    const account = accountsStore.get(num);
    return account
      ? { number: account.number, name: account.name, status: account.status }
      : null;
  },
  tickets: (num) =>
    ticketsStore.getState().tickets.filter((t) => t.accountNumber === num),
  work: (num) => ({
    logged: workLogStore.get().entries.filter((w) => w.accountNumber === num),
    additional: additionalWorkStore.byAccount(num),
  }),
  changes: async (num) => {
    const rows = await listChangeRecords({ data: { accountNumber: num, limit: 50 } });
    return Array.isArray(rows) ? rows : [];
  },
  coverage: (num) => {
    const state = coverageStore.get();
    return {
      watched: state.accounts.find((a) => a.number === num),
      gaps: computeCoverageGaps(state).filter((g) => g.accountNumber === num),
    };
  },
  knowledge: async (num, name) => {
    const vault = await listKnowledgeVault();
    const notes = vault?.notes ?? [];
    return notes
      .filter((n) => knowledgeMatchesAccount(n, num, name))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  },
  dispatch: (num) =>
    dispatchStore.getState().sessions.filter((s) => s.accountNumber === num),
  recurring: (num) =>
    isAccountActiveRecurring(num) ?? getRecurringRows().find((r) => r.accountNumber === num),
  awareness: (num) =>
    awarenessStore
      .get()
      .filter((i) => i.entity?.type === "account" && i.entity.id === num),
};

function cacheKey(options: AccountContextOptions): string {
  return JSON.stringify([
    options.recentTicketLimit ?? 0,
    options.recentWorkLimit ?? 0,
    options.recentChangeLimit ?? 0,
    options.recentDispatchLimit ?? 0,
    options.knowledgeLimit ?? 0,
    options.includeCoverage !== false,
    options.includeKnowledge !== false,
  ]);
}

export interface GetAccountContextOptions extends AccountContextOptions {
  /** Skip the cache and re-read every source. */
  force?: boolean;
  ports?: AccountContextPorts;
}

/**
 * Get the pack for an account. Repeated calls inside the TTL reuse the cached
 * result, and concurrent calls share one assembly pass.
 */
export async function getAccountContext(
  accountNumber: string,
  options: GetAccountContextOptions = {},
): Promise<AccountContextPack> {
  const num = accountNumber.trim();
  const { force, ports = defaultAccountContextPorts, ...rest } = options;
  const key = cacheKey(rest);
  const hit = cache.get(num);
  const now = Date.now();

  if (hit && hit.key === key) {
    if (hit.inflight) return hit.inflight;
    if (!force && now - hit.at < CONTEXT_TTL_MS) return hit.pack;
  }

  const inflight = assembleAccountContext(num, ports, rest)
    .then((pack) => {
      cache.set(num, { key, at: Date.now(), pack });
      return pack;
    })
    .catch((err) => {
      cache.delete(num);
      throw err;
    });

  cache.set(num, {
    key,
    at: hit?.at ?? 0,
    pack: hit?.pack ?? ({} as AccountContextPack),
    inflight,
  });
  return inflight;
}

export function invalidateAccountContext(accountNumber?: string): void {
  if (!accountNumber) {
    cache.clear();
    return;
  }
  cache.delete(accountNumber.trim());
}

let wired = false;

/** Subscribe cache invalidation to the Event Spine. Idempotent. */
export function startAccountContextInvalidation(): () => void {
  if (wired) return () => {};
  wired = true;
  const unsub = eventSpine.subscribe(
    (event) => {
      if (event.accountId) invalidateAccountContext(event.accountId);
      else cache.clear();
    },
    { types: INVALIDATING },
  );
  return () => {
    unsub();
    wired = false;
  };
}
