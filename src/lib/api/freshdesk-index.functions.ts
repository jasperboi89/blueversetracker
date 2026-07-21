import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireActiveAuthorizedUser } from "@/integrations/supabase/require-authorized";
import {
  fdFetch,
  fetchAllConversations,
  normalizeTicket,
  readFreshdeskCreds,
} from "./freshdesk.functions";
import type { FreshdeskTicketDTO, NormalizedTicket } from "./freshdesk.types";

interface IndexRow {
  ticket_id: number;
  ticket: NormalizedTicket;
  conversation_text: string;
  indexed_at: string;
  freshdesk_updated_at: string;
  status: number;
  priority: number;
  group_id: number | null;
  agent_id: number | null;
}

interface SyncStateRow {
  next_page: number;
  next_offset: number;
  completed: boolean;
  tickets_indexed: number;
  conversations_indexed: number;
  started_at: string | null;
  sync_since: string | null;
  completed_at: string | null;
  last_error: string | null;
  updated_at: string;
}

const INDEX_LOOKBACK_DAYS = 180;

function indexFloorIso(): string {
  return new Date(Date.now() - INDEX_LOOKBACK_DAYS * 24 * 60 * 60 * 1000).toISOString();
}

function laterIso(a: string | null | undefined, b: string): string {
  if (!a) return b;
  return new Date(a).getTime() >= new Date(b).getTime() ? a : b;
}

const TARGET_GROUP_NAMES = ["Programming Support", "Customer Support", "Sup Pod - GB"];
const AUTO_REPLY_PHRASES = [
  "out of office",
  "automatic reply",
  "auto-reply",
  "autoreply",
  "vacation reply",
  "i am currently out",
  "away from the office",
];
const SPAM_KEYWORDS = ["unsubscribe", "viagra", "winner", "lottery", "bitcoin giveaway"];

type ExclusionReason =
  | "spam_or_deleted"
  | "group_not_allowed"
  | "auto_reply"
  | "no_account_match"
  | "keyword_spam";

interface FreshdeskGroupDTO {
  id: number;
  name: string;
}

async function resolveTargetGroupIds(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  cached: unknown,
): Promise<{ ids: number[]; nameToId: Record<string, number> } | { error: string }> {
  const isRecord = (v: unknown): v is Record<string, number> =>
    !!v && typeof v === "object" && !Array.isArray(v);
  if (isRecord(cached)) {
    const ids: number[] = [];
    for (const name of TARGET_GROUP_NAMES) {
      const id = cached[name];
      if (typeof id !== "number") {
        return await fetchAndCacheGroupIds(db);
      }
      ids.push(id);
    }
    return { ids, nameToId: cached };
  }
  return await fetchAndCacheGroupIds(db);
}

async function fetchAndCacheGroupIds(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
): Promise<{ ids: number[]; nameToId: Record<string, number> } | { error: string }> {
  const listed = await fdFetch<FreshdeskGroupDTO[]>("/api/v2/groups?per_page=100");
  if (listed.error || !listed.data) {
    return { error: listed.error ?? "Freshdesk group listing failed." };
  }
  const norm = (s: string) => s.trim().toLowerCase();
  const byName = new Map(listed.data.map((g) => [norm(g.name), g.id]));
  const nameToId: Record<string, number> = {};
  const ids: number[] = [];
  for (const name of TARGET_GROUP_NAMES) {
    const id = byName.get(norm(name));
    if (typeof id !== "number") {
      return { error: `Freshdesk group not found: "${name}"` };
    }
    nameToId[name] = id;
    ids.push(id);
  }
  await db
    .from("freshdesk_search_sync_state")
    .upsert({
      id: "primary",
      target_group_ids: nameToId,
      updated_at: new Date().toISOString(),
    });
  return { ids, nameToId };
}

function containsAny(hay: string, needles: string[]): boolean {
  if (!hay) return false;
  const lower = hay.toLowerCase();
  return needles.some((n) => lower.includes(n));
}

function classifyExclusion(
  dto: FreshdeskTicketDTO & { spam?: boolean; deleted?: boolean },
  normalized: NormalizedTicket,
  allowedGroupIds: Set<number>,
): ExclusionReason | null {
  if (dto.spam === true || dto.deleted === true) return "spam_or_deleted";
  if (!dto.group_id || !allowedGroupIds.has(dto.group_id)) return "group_not_allowed";
  const subject = normalized.subject ?? "";
  const body = normalized.description ?? "";
  if (containsAny(subject, AUTO_REPLY_PHRASES) || containsAny(body, AUTO_REPLY_PHRASES)) {
    return "auto_reply";
  }
  if (!normalized.accountNumber || !normalized.accountNumber.trim()) {
    return "no_account_match";
  }
  if (containsAny(subject, SPAM_KEYWORDS) || containsAny(body, SPAM_KEYWORDS)) {
    return "keyword_spam";
  }
  return null;
}

export interface FreshdeskIndexHit {
  ticket: NormalizedTicket;
  conversationText: string;
  indexedAt: number;
  status: number;
  priority: number;
  groupId: number | null;
  agentId: number | null;
}

export interface FreshdeskIndexStatus {
  available: boolean;
  documentCount: number;
  completed: boolean;
  nextPage: number;
  ticketsIndexedThisRun: number;
  conversationsIndexedThisRun: number;
  startedAt: number | null;
  completedAt: number | null;
  lastError: string | null;
  error?: string;
}

function asTime(value: string | null | undefined): number | null {
  if (!value) return null;
  const n = new Date(value).getTime();
  return Number.isFinite(n) ? n : null;
}

async function adminClient() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  // The generated Database type intentionally lags migrations in exported ZIPs.
  // Keeping the cast here local avoids weakening types throughout the app.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return supabaseAdmin as any;
}

export async function getFreshdeskIndexStatus(): Promise<FreshdeskIndexStatus> {
  try {
    const db = await adminClient();
    const [{ count, error: countError }, { data, error: stateError }] = await Promise.all([
      db.from("freshdesk_search_documents").select("ticket_id", { count: "exact", head: true }),
      db.from("freshdesk_search_sync_state").select("*").eq("id", "primary").maybeSingle(),
    ]);
    if (countError || stateError) {
      const message = countError?.message ?? stateError?.message ?? "Freshdesk index unavailable.";
      return {
        available: false,
        documentCount: 0,
        completed: false,
        nextPage: 1,
        ticketsIndexedThisRun: 0,
        conversationsIndexedThisRun: 0,
        startedAt: null,
        completedAt: null,
        lastError: null,
        error: message,
      };
    }
    const state = data as SyncStateRow | null;
    return {
      available: true,
      documentCount: count ?? 0,
      completed: state?.completed ?? false,
      nextPage: state?.next_page ?? 1,
      ticketsIndexedThisRun: state?.tickets_indexed ?? 0,
      conversationsIndexedThisRun: state?.conversations_indexed ?? 0,
      startedAt: asTime(state?.started_at),
      completedAt: asTime(state?.completed_at),
      lastError: state?.last_error ?? null,
    };
  } catch (e) {
    return {
      available: false,
      documentCount: 0,
      completed: false,
      nextPage: 1,
      ticketsIndexedThisRun: 0,
      conversationsIndexedThisRun: 0,
      startedAt: null,
      completedAt: null,
      lastError: null,
      error: e instanceof Error ? e.message : "Freshdesk index unavailable.",
    };
  }
}

export async function searchFreshdeskIndex(
  query: string,
  limit = 100,
): Promise<{ available: boolean; hits: FreshdeskIndexHit[]; error?: string }> {
  const term = query.trim();
  if (!term) return { available: true, hits: [] };
  try {
    const db = await adminClient();
    const run = (value: string, resultLimit: number) =>
      db.rpc("search_freshdesk_documents", {
        p_query: value,
        p_limit: resultLimit,
      });
    const { data, error } = await run(term, Math.min(Math.max(limit, 1), 200));
    if (error) return { available: false, hits: [], error: error.message };

    let rows = (data ?? []) as IndexRow[];
    if (rows.length === 0) {
      const stopWords = new Set([
        "and",
        "the",
        "for",
        "from",
        "with",
        "last",
        "ticket",
        "tickets",
        "find",
        "show",
        "about",
      ]);
      const tokens = Array.from(
        new Set(
          term
            .toLocaleLowerCase()
            .split(/[^a-z0-9@._-]+/i)
            .filter((token) => token.length >= 3 && !stopWords.has(token)),
        ),
      ).slice(0, 4);
      if (tokens.length > 1) {
        const tokenResults = await Promise.all(tokens.map((token) => run(token, 80)));
        const firstTokenError = tokenResults.find((result: { error?: { message?: string } }) =>
          Boolean(result.error),
        )?.error;
        if (firstTokenError) {
          return {
            available: false,
            hits: [],
            error: firstTokenError.message ?? "Freshdesk index search failed.",
          };
        }
        const seen = new Set<number>();
        rows = tokenResults
          .flatMap((result: { data?: IndexRow[] | null }) => result.data ?? [])
          .filter((row: IndexRow) =>
            seen.has(row.ticket_id) ? false : (seen.add(row.ticket_id), true),
          )
          .slice(0, Math.min(Math.max(limit, 1), 200));
      }
    }
    const hits = rows.map((row) => ({
      ticket: row.ticket,
      conversationText: row.conversation_text ?? "",
      indexedAt: asTime(row.indexed_at) ?? Date.now(),
      status: row.status,
      priority: row.priority,
      groupId: row.group_id,
      agentId: row.agent_id,
    }));
    return { available: true, hits };
  } catch (e) {
    return {
      available: false,
      hits: [],
      error: e instanceof Error ? e.message : "Freshdesk index search failed.",
    };
  }
}

export const freshdeskIndexStatus = createServerFn({ method: "GET" })
  .middleware([requireActiveAuthorizedUser])
  .handler(async () => getFreshdeskIndexStatus());

const SyncInputSchema = z.object({ rebuild: z.boolean().optional() });

export const freshdeskSyncIndexBatch = createServerFn({ method: "POST" })
  .middleware([requireActiveAuthorizedUser])
  .inputValidator((input: { rebuild?: boolean }) => SyncInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    if (context.role !== "admin") throw new Error("Forbidden");
    const creds = readFreshdeskCreds();
    if ("error" in creds && creds.error) return { ok: false as const, error: creds.error };
    const { host } = creds as { host: string };
    const db = await adminClient();
    const indexFloor = indexFloorIso();

    // Keep the persistent index strictly inside the requested six-month
    // window, including as that window advances after the initial build.
    const { error: pruneError } = await db
      .from("freshdesk_search_documents")
      .delete()
      .lt("freshdesk_updated_at", indexFloor);
    if (pruneError) return { ok: false as const, error: pruneError.message };

    if (data.rebuild) {
      const { error: deleteError } = await db
        .from("freshdesk_search_documents")
        .delete()
        .gte("ticket_id", 0);
      if (deleteError) return { ok: false as const, error: deleteError.message };
      await db.from("freshdesk_search_sync_state").upsert({
        id: "primary",
        next_page: 1,
        next_offset: 0,
        completed: false,
        tickets_indexed: 0,
        conversations_indexed: 0,
        started_at: new Date().toISOString(),
        sync_since: indexFloor,
        completed_at: null,
        last_error: null,
        updated_at: new Date().toISOString(),
      });
    }

    const { data: rawState, error: stateError } = await db
      .from("freshdesk_search_sync_state")
      .select("*")
      .eq("id", "primary")
      .maybeSingle();
    if (stateError) return { ok: false as const, error: stateError.message };

    let state = rawState as SyncStateRow | null;

    // Existing partial all-time builds must restart at the six-month floor.
    // Documents inside the new window are retained and safely upserted.
    if (
      state?.sync_since &&
      new Date(state.sync_since).getTime() < new Date(indexFloor).getTime()
    ) {
      const now = new Date().toISOString();
      const { data: reset, error } = await db
        .from("freshdesk_search_sync_state")
        .upsert({
          id: "primary",
          next_page: 1,
          next_offset: 0,
          completed: false,
          tickets_indexed: 0,
          conversations_indexed: 0,
          started_at: now,
          sync_since: indexFloor,
          completed_at: null,
          last_error: null,
          updated_at: now,
        })
        .select("*")
        .single();
      if (error) return { ok: false as const, error: error.message };
      state = reset as SyncStateRow;
    }

    if (!state || state.completed) {
      const now = new Date().toISOString();
      const next = {
        id: "primary",
        next_page: 1,
        next_offset: 0,
        completed: false,
        tickets_indexed: 0,
        conversations_indexed: 0,
        started_at: now,
        // Re-scan from the previous run's start time so tickets changed while
        // that run was in progress cannot fall through the cursor gap.
        sync_since: laterIso(state?.started_at ?? state?.completed_at, indexFloor),
        completed_at: state?.completed_at ?? null,
        last_error: null,
        updated_at: now,
      };
      const { data: initialized, error } = await db
        .from("freshdesk_search_sync_state")
        .upsert(next)
        .select("*")
        .single();
      if (error) return { ok: false as const, error: error.message };
      state = initialized as SyncStateRow;
    }

    const page = state.next_page;
    const offset = state.next_offset ?? 0;
    const since = laterIso(state.sync_since, indexFloor);
    const path =
      `/api/v2/tickets?updated_since=${encodeURIComponent(since)}` +
      `&include=description,requester&order_by=updated_at&order_type=asc&per_page=100&page=${page}`;
    const listed = await fdFetch<FreshdeskTicketDTO[]>(path);
    if (listed.error || !listed.data) {
      const error = listed.error ?? "Freshdesk ticket listing failed.";
      await db
        .from("freshdesk_search_sync_state")
        .update({ last_error: error, updated_at: new Date().toISOString() })
        .eq("id", "primary");
      return { ok: false as const, error };
    }

    const pageTickets = listed.data;
    const tickets = pageTickets.slice(offset, offset + 5);
    const rows: Record<string, unknown>[] = [];
    const conversationErrors: string[] = [];
    let rateLimitRetryAfterMs = 0;
    let conversationCount = 0;

    // Hydrate sequentially. Four parallel conversation downloads followed by
    // an immediate next browser batch was enough to exhaust Freshdesk's
    // per-minute quota on smaller plans.
    for (const dto of tickets) {
      const conversations = await fetchAllConversations(String(dto.id));
      if (!conversations.ok && conversations.error) {
        conversationErrors.push(`#${dto.id}: ${conversations.error}`);
        if (conversations.status === 429) {
          rateLimitRetryAfterMs = Math.max(
            rateLimitRetryAfterMs,
            conversations.retryAfterMs ?? 60_000,
          );
        }
      }
      conversationCount += conversations.conversations.length;
      const conversationText = conversations.conversations
        .map((c) => (c.body_text ?? c.body ?? "").trim())
        .filter(Boolean)
        .join("\n---\n");
      const normalized = normalizeTicket(dto, host);
      rows.push({
        ticket_id: dto.id,
        ticket: normalized,
        subject: normalized.subject,
        description_text: normalized.description,
        conversation_text: conversationText,
        requester_name: normalized.requesterName ?? "",
        company_name: normalized.companyName ?? normalized.accountName ?? "",
        account_number: normalized.accountNumber ?? "",
        status: dto.status,
        priority: dto.priority,
        group_id: dto.group_id ?? null,
        agent_id: dto.responder_id ?? null,
        tags: normalized.tags ?? [],
        custom_fields: normalized.customFields ?? {},
        freshdesk_created_at: dto.created_at,
        freshdesk_updated_at: dto.updated_at,
        indexed_at: new Date().toISOString(),
      });
      // Leave a small amount of quota for normal ticket lookups while a full
      // index build is running.
      await new Promise((resolve) => setTimeout(resolve, 1_200));
    }

    // Do not advance the cursor with partially hydrated tickets. A temporary
    // Freshdesk rate limit or conversation failure should be retried on the
    // same ten-ticket batch instead of becoming a permanent blind spot.
    if (conversationErrors.length) {
      const error = conversationErrors.slice(0, 10).join("; ");
      await db
        .from("freshdesk_search_sync_state")
        .update({ last_error: error, updated_at: new Date().toISOString() })
        .eq("id", "primary");
      return {
        ok: false as const,
        error,
        rateLimited: rateLimitRetryAfterMs > 0,
        retryAfterMs: rateLimitRetryAfterMs || undefined,
      };
    }

    if (rows.length) {
      const { error } = await db.from("freshdesk_search_documents").upsert(rows, {
        onConflict: "ticket_id",
      });
      if (error) return { ok: false as const, error: error.message };
    }

    const reachedPageEnd = offset + tickets.length >= pageTickets.length;
    const completed = reachedPageEnd && pageTickets.length < 100;
    const now = new Date().toISOString();
    const nextState = {
      next_page: completed ? 1 : reachedPageEnd ? page + 1 : page,
      next_offset: completed || reachedPageEnd ? 0 : offset + tickets.length,
      completed,
      tickets_indexed: state.tickets_indexed + tickets.length,
      conversations_indexed: state.conversations_indexed + conversationCount,
      completed_at: completed ? now : state.completed_at,
      last_error: conversationErrors.length ? conversationErrors.slice(0, 10).join("; ") : null,
      updated_at: now,
    };
    const { error: updateError } = await db
      .from("freshdesk_search_sync_state")
      .update(nextState)
      .eq("id", "primary");
    if (updateError) return { ok: false as const, error: updateError.message };

    return {
      ok: true as const,
      completed,
      page,
      ticketsThisBatch: tickets.length,
      conversationsThisBatch: conversationCount,
      ticketsIndexed: nextState.tickets_indexed,
      conversationsIndexed: nextState.conversations_indexed,
      warnings: conversationErrors,
    };
  });

export interface FreshdeskSync24hResult {
  ok: true;
  pulled: number;
  upserted: number;
  excluded: {
    spam_or_deleted: number;
    auto_reply: number;
    no_account_match: number;
    keyword_spam: number;
  };
  skipped_wrong_group: number;
  groupIds: Record<string, number>;
  warnings: string[];
}

export const freshdeskSync24h = createServerFn({ method: "POST" })
  .middleware([requireActiveAuthorizedUser])
  .handler(async ({ context }) => {
    if (context.role !== "admin") throw new Error("Forbidden");
    const creds = readFreshdeskCreds();
    if ("error" in creds && creds.error) return { ok: false as const, error: creds.error };
    const { host } = creds as { host: string };
    const db = await adminClient();

    const { data: rawState } = await db
      .from("freshdesk_search_sync_state")
      .select("*")
      .eq("id", "primary")
      .maybeSingle();
    const cached = (rawState as { target_group_ids?: unknown } | null)?.target_group_ids;
    const resolved = await resolveTargetGroupIds(db, cached);
    if ("error" in resolved) return { ok: false as const, error: resolved.error };
    const allowedGroupIds = new Set(resolved.ids);

    const sinceIso = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const allTickets: FreshdeskTicketDTO[] = [];
    for (let page = 1; page <= 20; page += 1) {
      const path =
        `/api/v2/tickets?updated_since=${encodeURIComponent(sinceIso)}` +
        `&include=description,requester&order_by=updated_at&order_type=asc&per_page=100&page=${page}`;
      const listed = await fdFetch<FreshdeskTicketDTO[]>(path);
      if (listed.error || !listed.data) {
        return { ok: false as const, error: listed.error ?? "Freshdesk ticket listing failed." };
      }
      allTickets.push(...listed.data);
      if (listed.data.length < 100) break;
    }

    const excluded = { spam_or_deleted: 0, auto_reply: 0, no_account_match: 0, keyword_spam: 0 };
    let skippedWrongGroup = 0;
    const warnings: string[] = [];
    const rowsToUpsert: Record<string, unknown>[] = [];
    const excludedRows: Record<string, unknown>[] = [];
    const excludedIds: number[] = [];
    const now = new Date().toISOString();

    for (const dto of allTickets) {
      const normalized = normalizeTicket(dto, host);
      const reason = classifyExclusion(
        dto as FreshdeskTicketDTO & { spam?: boolean; deleted?: boolean },
        normalized,
        allowedGroupIds,
      );
      if (reason) {
        if (reason === "group_not_allowed") {
          skippedWrongGroup += 1;
        } else {
          excluded[reason] += 1;
        }
        excludedIds.push(dto.id);
        excludedRows.push({
          ticket_id: dto.id,
          reason,
          subject: dto.subject ?? null,
          group_id: dto.group_id ?? null,
          excluded_at: now,
        });
        continue;
      }

      const conversations = await fetchAllConversations(String(dto.id));
      if (!conversations.ok && conversations.error) {
        warnings.push(`#${dto.id}: ${conversations.error}`);
      }
      const conversationText = conversations.conversations
        .map((c) => (c.body_text ?? c.body ?? "").trim())
        .filter(Boolean)
        .join("\n---\n");
      rowsToUpsert.push({
        ticket_id: dto.id,
        ticket: normalized,
        subject: normalized.subject,
        description_text: normalized.description,
        conversation_text: conversationText,
        requester_name: normalized.requesterName ?? "",
        company_name: normalized.companyName ?? normalized.accountName ?? "",
        account_number: normalized.accountNumber ?? "",
        status: dto.status,
        priority: dto.priority,
        group_id: dto.group_id ?? null,
        agent_id: dto.responder_id ?? null,
        tags: normalized.tags ?? [],
        custom_fields: normalized.customFields ?? {},
        freshdesk_created_at: dto.created_at,
        freshdesk_updated_at: dto.updated_at,
        indexed_at: now,
      });
      await new Promise((resolve) => setTimeout(resolve, 800));
    }

    if (rowsToUpsert.length) {
      const { error } = await db
        .from("freshdesk_search_documents")
        .upsert(rowsToUpsert, { onConflict: "ticket_id" });
      if (error) return { ok: false as const, error: error.message };
    }

    if (excludedIds.length) {
      await db.from("freshdesk_search_documents").delete().in("ticket_id", excludedIds);
      await db
        .from("freshdesk_excluded_tickets")
        .upsert(excludedRows, { onConflict: "ticket_id" });
    }

    return {
      ok: true as const,
      pulled: allTickets.length,
      upserted: rowsToUpsert.length,
      excluded,
      skipped_wrong_group: skippedWrongGroup,
      groupIds: resolved.nameToId,
      warnings,
    } satisfies FreshdeskSync24hResult;
  });
