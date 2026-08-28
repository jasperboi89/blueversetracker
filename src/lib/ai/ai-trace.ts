import { createPersistedStore, useStoreValue } from "@/lib/settings/_persist";

/**
 * AI traceability (Phase 3, Part 13) — a bounded, device-local record of
 * important AI operations so they can be inspected on evidence/debug/audit
 * surfaces. Everyday operator UI does not need provider/model clutter, so
 * `redactForOperator` strips it; the full record stays available to debug views.
 *
 * This is the FOUNDATION: it captures what the client knows at call time
 * (task class, sensitivity, latency, correlation, ok/fallback, and provider/
 * model/token/cost when the AI path surfaces them). Threading richer
 * provider/model/token metadata out of the server AI client is a documented
 * follow-up.
 */

export type TraceSensitivity = "public" | "internal" | "sensitive";

export interface AiTraceRecord {
  id: string;
  at: number;
  ok: boolean;
  /** Task class / route (e.g. "copilot_chat", "briefing", "account_intel"). */
  taskClass: string;
  provider?: string;
  model?: string;
  templateVersion?: string;
  latencyMs?: number;
  tokensIn?: number;
  tokensOut?: number;
  costUsd?: number;
  /** Set when a fallback route was taken (from → the served route). */
  fallbackFrom?: string;
  sensitivity: TraceSensitivity;
  accountId?: string;
  ticketId?: string;
  correlationId?: string;
  error?: string;
}

/** What everyday operator UI may see — no provider/model/token/cost. */
export interface OperatorTraceView {
  id: string;
  at: number;
  ok: boolean;
  taskClass: string;
  latencyMs?: number;
  sensitivity: TraceSensitivity;
}

export function redactForOperator(r: AiTraceRecord): OperatorTraceView {
  return {
    id: r.id,
    at: r.at,
    ok: r.ok,
    taskClass: r.taskClass,
    ...(typeof r.latencyMs === "number" ? { latencyMs: r.latencyMs } : {}),
    sensitivity: r.sensitivity,
  };
}

interface TraceState {
  /** Newest first. */
  records: AiTraceRecord[];
}

const DEFAULT: TraceState = { records: [] };
const TRACE_MAX = 200;

const store = createPersistedStore<TraceState>("aih:ai:trace:v1", DEFAULT);

let seq = 0;
function traceId(): string {
  seq += 1;
  return `${Date.now().toString(36)}-${seq.toString(36)}`;
}

export const aiTrace = {
  /** Record an AI operation. Best-effort; never throws into the caller. */
  record(input: Omit<AiTraceRecord, "id" | "at"> & { at?: number }): AiTraceRecord {
    const rec: AiTraceRecord = { id: traceId(), at: input.at ?? Date.now(), ...input };
    try {
      store.update((s) => ({ records: [rec, ...s.records].slice(0, TRACE_MAX) }));
    } catch {
      /* device storage unavailable — tracing is best-effort */
    }
    return rec;
  },

  recent(limit = 50): AiTraceRecord[] {
    return store.get().records.slice(0, limit);
  },

  clear(): void {
    store.set({ records: [] });
  },
};

export function useAiTrace(limit = 50): AiTraceRecord[] {
  const state = useStoreValue(store, DEFAULT);
  return state.records.slice(0, limit);
}
