import { createPersistedStore, useStoreValue } from "@/lib/settings/_persist";
import { attachCloudSync } from "@/lib/cloud-sync/blob-sync";
import { eventSpine } from "./event-spine";
import type { AccEvent, AccEventType, AccEventSource, AccEventMetadata } from "./events";
import { isDurableEvent } from "./ledger-events";
import { appendLedgerEvents, queryLedgerEvents } from "./ledger.functions";

/**
 * Durable Operational Event Ledger — Layer 2 of the two-layer event model.
 *
 * Layer 1 (the Event Spine, `event-spine.ts`) is a small, shift-scoped, capped
 * coordination buffer. This ledger is Layer 2: the LONG-TERM, auditable record
 * used for historical learning, correlation, analytics and future predictive
 * intelligence.
 *
 * It is NOT a second event bus. It is a durable *sink* on the existing one:
 * it consumes the same sanitized `AccEvent` contract via `eventSpine.subscribe`
 * and never defines its own event vocabulary. Nothing emits here directly.
 *
 * Persistence reuses the app's own primitives — `createPersistedStore`
 * (localStorage) for per-device durability plus `attachCloudSync` (the shared
 * `user_store_blobs` blob) for cross-device durability. No new table or
 * migration is introduced. A server-backed append-only table is the documented
 * Phase 3 scale upgrade (see docs/OPERATIONAL_EVENT_LEDGER.md); this store is
 * bounded so the synced blob stays sane in the meantime.
 *
 * Privacy: it stores exactly what the Spine already sanitized — ids, labels,
 * statuses, timestamps and small routing metadata. Never ticket bodies, notes,
 * conversations, caller/patient data, prompts or model output.
 *
 * Availability: entirely local + deterministic. It needs no AI and no network
 * to function; cloud sync is best-effort on top.
 */

export interface LedgerEntry extends AccEvent {
  /** Monotonic insertion order assigned by this device's ledger. */
  seq: number;
}

export interface LedgerState {
  /** Ordered newest-first (by timestamp, then seq). */
  entries: LedgerEntry[];
  /** Next sequence number to assign on this device. */
  nextSeq: number;
}

const DEFAULT: LedgerState = { entries: [], nextSeq: 1 };

/** Rotation bounds — keep the synced blob modest. */
export const LEDGER_MAX_ENTRIES = 1500;
export const LEDGER_MAX_AGE_DAYS = 60;
const DAY_MS = 24 * 60 * 60 * 1000;

const store = createPersistedStore<LedgerState>("aih:core:eventledger:v1", DEFAULT);

/* ------------------------------------------------------------------ */
/* Pure helpers (deterministic — unit tested)                          */
/* ------------------------------------------------------------------ */

function timeOf(e: LedgerEntry): number {
  const t = Date.parse(e.timestamp);
  return Number.isNaN(t) ? 0 : t;
}

/** Newest first: timestamp desc, then seq desc as a stable tiebreak. */
export function compareEntries(a: LedgerEntry, b: LedgerEntry): number {
  const dt = timeOf(b) - timeOf(a);
  return dt !== 0 ? dt : b.seq - a.seq;
}

/**
 * Sort newest-first, drop anything older than the age window, cap to the entry
 * limit. Entries with an unparseable timestamp are kept (never silently aged
 * out on a bad clock).
 */
export function rotate(
  entries: LedgerEntry[],
  now: number,
  maxEntries: number = LEDGER_MAX_ENTRIES,
  maxAgeDays: number = LEDGER_MAX_AGE_DAYS,
): LedgerEntry[] {
  const cutoff = now - maxAgeDays * DAY_MS;
  const fresh = entries.filter((e) => {
    const t = Date.parse(e.timestamp);
    return Number.isNaN(t) ? true : t >= cutoff;
  });
  return [...fresh].sort(compareEntries).slice(0, maxEntries);
}

/**
 * Merge two ledgers by event id (union), preferring the existing entry's seq on
 * collision. Deterministic — used when a cloud snapshot arrives so cross-device
 * history is unioned rather than overwritten.
 */
export function mergeLedgers(
  local: LedgerState,
  incoming: LedgerState,
  now: number = Date.now(),
): LedgerState {
  const byId = new Map<string, LedgerEntry>();
  for (const e of incoming.entries) byId.set(e.id, e);
  for (const e of local.entries) byId.set(e.id, e); // local wins on collision
  const entries = rotate([...byId.values()], now);
  const maxSeq = entries.reduce((m, e) => Math.max(m, e.seq), 0);
  return { entries, nextSeq: Math.max(local.nextSeq, incoming.nextSeq, maxSeq + 1) };
}

/* ------------------------------------------------------------------ */
/* Recording                                                           */
/* ------------------------------------------------------------------ */

/** Append one already-sanitized event. Deduped by id; rotated on write. */
function record(event: AccEvent, now: number = Date.now()): void {
  store.update((s) => {
    if (s.entries.some((e) => e.id === event.id)) return s;
    const entry: LedgerEntry = { ...event, seq: s.nextSeq };
    return { entries: rotate([entry, ...s.entries], now), nextSeq: s.nextSeq + 1 };
  });
}

let started = false;

/* ------------------------------------------------------------------ */
/* Server sink (Phase 3) — best-effort durable backing                 */
/* ------------------------------------------------------------------ */

/*
 * The Phase 2 API (queryLedger / aggregateAccount / the local store) is the
 * consumer-facing interface and is unchanged. Phase 3 adds a server-backed
 * durable ledger BEHIND it: durable, allowlisted events are pushed to the
 * server table (idempotent upsert), and recent server history is pulled once on
 * start to backfill the local cache. Every server call is best-effort — a
 * failure logs and leaves the bounded local ledger as the working source, so a
 * ledger outage never disturbs ordinary operation.
 */

const SERVER_FLUSH_MS = 1500;
const SERVER_QUEUE_MAX = 1000;
const pendingServer = new Map<string, AccEvent>();
let flushTimer: ReturnType<typeof setTimeout> | null = null;

function toServerEvent(e: AccEvent) {
  return {
    eventId: e.id,
    type: e.type,
    source: e.source,
    accountId: e.accountId ?? "",
    ticketId: e.ticketId ?? "",
    workItemId: e.workItemId ?? "",
    dispatchId: e.dispatchId ?? "",
    occurredAt: e.timestamp,
    metadata: (e.metadata ?? {}) as Record<string, string | number | boolean | null>,
  };
}

async function flushServer(): Promise<void> {
  flushTimer = null;
  if (pendingServer.size === 0) return;
  const batch = [...pendingServer.values()].slice(0, 200);
  try {
    await appendLedgerEvents({ data: { events: batch.map(toServerEvent) } });
    for (const e of batch) pendingServer.delete(e.id);
    if (pendingServer.size > 0) scheduleFlush();
  } catch (err) {
    // Keep pending for a later attempt; never disable permanently on one failure.
    console.warn("[event-ledger] server append failed (local fallback in use)", err);
  }
}

function scheduleFlush(): void {
  if (flushTimer || typeof window === "undefined") return;
  flushTimer = setTimeout(() => void flushServer(), SERVER_FLUSH_MS);
}

/** Queue a durable event for the server sink. No-op for non-durable events. */
function enqueueServer(e: AccEvent): void {
  if (!isDurableEvent(e.type)) return;
  if (pendingServer.size >= SERVER_QUEUE_MAX) return; // local cache stays authoritative
  pendingServer.set(e.id, e);
  scheduleFlush();
}

/** One-time best-effort backfill of the local cache from server history. */
async function hydrateFromServer(): Promise<void> {
  try {
    const res = await queryLedgerEvents({ data: { limit: 500 } });
    if (!res.events.length) return;
    store.update((s) => {
      const incoming: LedgerEntry[] = res.events.map((se, i) => ({
        id: se.eventId,
        type: se.type as AccEventType,
        timestamp: se.occurredAt,
        source: se.source as AccEventSource,
        ...(se.accountId ? { accountId: se.accountId } : {}),
        ...(se.ticketId ? { ticketId: se.ticketId } : {}),
        ...(se.workItemId ? { workItemId: se.workItemId } : {}),
        ...(se.dispatchId ? { dispatchId: se.dispatchId } : {}),
        metadata: se.metadata as AccEventMetadata,
        seq: s.nextSeq + i,
      }));
      return mergeLedgers(
        s,
        { entries: incoming, nextSeq: s.nextSeq + incoming.length },
        Date.now(),
      );
    });
  } catch (err) {
    console.warn("[event-ledger] server hydrate failed (local only)", err);
  }
}

/**
 * Start the ledger: seed from the Spine's current buffer (so events already
 * emitted this shift are captured), backfill from the server ledger, subscribe
 * to all future events (persisting durable ones to the server), and attach
 * cloud sync. Idempotent — safe to call from a mounted watcher.
 */
export function startEventLedger(): void {
  if (started || typeof window === "undefined") return;
  started = true;

  // Seed oldest→newest so seq order matches emit order. Seeded events are not
  // re-pushed to the server (idempotent upsert would no-op, but this avoids the
  // work) — only live events flow to the server sink below.
  try {
    const buffered = eventSpine.getState().events;
    for (let i = buffered.length - 1; i >= 0; i--) record(buffered[i]!);
  } catch (err) {
    console.warn("[event-ledger] seed failed", err);
  }

  void hydrateFromServer();

  eventSpine.subscribe((e) => {
    try {
      record(e);
      enqueueServer(e);
    } catch (err) {
      console.warn("[event-ledger] record failed", err);
    }
  });

  attachCloudSync<LedgerState>({
    storeKey: "event-ledger",
    subscribe: store.subscribe,
    getSnapshot: () => store.get(),
    // Union the cloud snapshot with local history instead of overwriting it.
    applyServerSnapshot: (next) => store.set(mergeLedgers(store.get(), next)),
    isEmpty: (s) => s.entries.length === 0,
  });
}

/* ------------------------------------------------------------------ */
/* Queries                                                             */
/* ------------------------------------------------------------------ */

export interface LedgerQuery {
  accountId?: string;
  ticketId?: string;
  types?: readonly AccEventType[];
  /** Inclusive lower/upper time bounds in epoch ms. */
  sinceMs?: number;
  untilMs?: number;
  /** Max entries returned (newest first). */
  limit?: number;
}

/** Deterministic, bounded read over the durable ledger. */
export function queryLedger(
  query: LedgerQuery = {},
  state: LedgerState = store.get(),
): LedgerEntry[] {
  const { accountId, ticketId, types, sinceMs, untilMs, limit } = query;
  const typeSet = types ? new Set(types) : null;
  const out = state.entries.filter((e) => {
    if (accountId && e.accountId !== accountId) return false;
    if (ticketId && e.ticketId !== ticketId) return false;
    if (typeSet && !typeSet.has(e.type)) return false;
    if (sinceMs != null && timeOf(e) < sinceMs) return false;
    if (untilMs != null && timeOf(e) > untilMs) return false;
    return true;
  });
  return typeof limit === "number" ? out.slice(0, limit) : out;
}

/* ------------------------------------------------------------------ */
/* Account aggregate — the deterministic input to Account Cortex        */
/* ------------------------------------------------------------------ */

export interface AccountLedgerAggregate {
  accountId: string;
  total: number;
  firstAt?: string;
  lastAt?: string;
  countsByType: Partial<Record<AccEventType, number>>;
  last7dCount: number;
  prev7dCount: number;
  last30dCount: number;
  /** Distinct UTC days with activity in the last 30 days. */
  activeDays30d: number;
  /** Distinct tickets touched in the ledger for this account. */
  touchedTickets: number;
  generatedAt: string;
}

/**
 * Pure rollup of an account's ledger slice. Takes entries + a clock so it is
 * fully deterministic and testable; `getAccountAggregate` supplies the store.
 */
export function aggregateAccount(
  entries: LedgerEntry[],
  accountId: string,
  now: number,
): AccountLedgerAggregate {
  const mine = entries.filter((e) => e.accountId === accountId);
  const countsByType: Partial<Record<AccEventType, number>> = {};
  const tickets = new Set<string>();
  const days30 = new Set<string>();
  let last7 = 0;
  let prev7 = 0;
  let last30 = 0;
  let firstMs = Infinity;
  let lastMs = -Infinity;

  for (const e of mine) {
    countsByType[e.type] = (countsByType[e.type] ?? 0) + 1;
    if (e.ticketId) tickets.add(e.ticketId);
    const t = timeOf(e);
    if (t) {
      firstMs = Math.min(firstMs, t);
      lastMs = Math.max(lastMs, t);
      const ageDays = (now - t) / DAY_MS;
      if (ageDays >= 0 && ageDays < 7) last7 += 1;
      else if (ageDays >= 7 && ageDays < 14) prev7 += 1;
      if (ageDays >= 0 && ageDays < 30) {
        last30 += 1;
        days30.add(new Date(t).toISOString().slice(0, 10));
      }
    }
  }

  return {
    accountId,
    total: mine.length,
    ...(firstMs !== Infinity ? { firstAt: new Date(firstMs).toISOString() } : {}),
    ...(lastMs !== -Infinity ? { lastAt: new Date(lastMs).toISOString() } : {}),
    countsByType,
    last7dCount: last7,
    prev7dCount: prev7,
    last30dCount: last30,
    activeDays30d: days30.size,
    touchedTickets: tickets.size,
    generatedAt: new Date(now).toISOString(),
  };
}

/** Convenience: aggregate straight from the live store. */
export function getAccountAggregate(
  accountId: string,
  now: number = Date.now(),
): AccountLedgerAggregate {
  return aggregateAccount(store.get().entries, accountId, now);
}

/* ------------------------------------------------------------------ */
/* Store access (views / diagnostics)                                  */
/* ------------------------------------------------------------------ */

export function getLedgerState(): LedgerState {
  return store.get();
}

export function useLedgerState(): LedgerState {
  return useStoreValue(store, DEFAULT);
}

/** Test/diagnostic only — clears the durable ledger. */
export function clearLedger(): void {
  store.set({ entries: [], nextSeq: 1 });
}
