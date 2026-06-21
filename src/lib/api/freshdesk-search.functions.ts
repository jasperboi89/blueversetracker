import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  fdFetch,
  readFreshdeskCreds,
  fetchAllConversations,
  enrichTicket,
  normalizeConversation,
  collectAttachments,
} from "./freshdesk.functions";
import type {
  FreshdeskTicketDTO,
  FreshdeskConversationDTO,
  NormalizedTicket,
} from "./freshdesk.types";

/* -------------------------- types -------------------------- */

const FiltersSchema = z.object({
  accountNumber: z.string().optional(),
  statuses: z.array(z.number()).optional(),
  priorities: z.array(z.number()).optional(),
  groupId: z.number().optional(),
  agentId: z.number().optional(),
  updatedAfter: z.string().optional(), // ISO date
  includeClosed: z.boolean().optional(),
});

export type IntelFilters = z.infer<typeof FiltersSchema>;

export interface IntelCandidate {
  ticket: NormalizedTicket;
  excerpt: string;
}

export interface IntelRanked {
  ticketNumber: string;
  matchReason: string;
  issue: string;
  latestUpdate: string;
  suggestedAction: string;
  owner?: string;
  signal: "stale" | "urgent" | "duplicate" | "ready-to-close" | "needs-review";
  confidence: number;
  snippet: string;
}

/* -------------------------- search -------------------------- */

function buildFreshdeskQuery(query: string, filters: IntelFilters): string {
  const clauses: string[] = [];
  const q = query.trim();

  // ticket number / account number / phone — exact-ish matches
  const ticketNum = q.match(/\b#?(\d{4,8})\b/);
  const acct = filters.accountNumber?.trim();
  if (acct) {
    clauses.push(
      `(description:'${acct}' OR subject:'${acct}' OR cf_account_number:'${acct}')`,
    );
  }

  // free text
  if (q) {
    const safe = q.replace(/'/g, " ").slice(0, 120);
    clauses.push(`(subject:'${safe}' OR description:'${safe}')`);
  }

  if (filters.statuses?.length) {
    clauses.push(`(${filters.statuses.map((s) => `status:${s}`).join(" OR ")})`);
  } else if (!filters.includeClosed) {
    // exclude 4 (resolved) and 5 (closed) by default
    clauses.push(`(status:2 OR status:3 OR status:6 OR status:7)`);
  }
  if (filters.priorities?.length) {
    clauses.push(`(${filters.priorities.map((p) => `priority:${p}`).join(" OR ")})`);
  }
  if (filters.groupId) clauses.push(`group_id:${filters.groupId}`);
  if (filters.agentId) clauses.push(`agent_id:${filters.agentId}`);
  if (filters.updatedAfter) clauses.push(`updated_at:>'${filters.updatedAfter}'`);

  if (!clauses.length && ticketNum) {
    clauses.push(`description:'${ticketNum[1]}'`);
  }

  return clauses.join(" AND ");
}

/** Live search. Returns lightweight candidates (no full conversations). */
export const freshdeskSearch = createServerFn({ method: "POST" })
  .inputValidator((input: { query: string; filters?: IntelFilters }) =>
    z.object({ query: z.string().max(500), filters: FiltersSchema.optional() }).parse(input),
  )
  .handler(async ({ data }) => {
    const creds = readFreshdeskCreds();
    if ("error" in creds && creds.error) {
      return { ok: false as const, error: creds.error, candidates: [] };
    }
    const { host } = creds as { host: string };
    const filters = data.filters ?? {};
    const ticketNumMatch = data.query.trim().match(/^#?(\d{4,8})$/);

    // If the query is just a ticket number, fetch that ticket directly.
    if (ticketNumMatch) {
      const t = await fdFetch<FreshdeskTicketDTO>(
        `/api/v2/tickets/${ticketNumMatch[1]}?include=requester,company,stats`,
      );
      if (t.data) {
        const ticket = await enrichTicket(t.data, host, []);
        const excerpt = (t.data.description_text ?? "").slice(0, 400);
        return { ok: true as const, candidates: [{ ticket, excerpt }] as IntelCandidate[] };
      }
    }

    const queryString = buildFreshdeskQuery(data.query, filters);
    if (!queryString) {
      return { ok: false as const, error: "Type a search query or apply a filter.", candidates: [] };
    }

    const candidates: IntelCandidate[] = [];
    for (let page = 1; page <= 3; page += 1) {
      const res = await fdFetch<{ total: number; results: FreshdeskTicketDTO[] }>(
        `/api/v2/search/tickets?query=%22${encodeURIComponent(queryString)}%22&page=${page}`,
      );
      if (res.error) {
        if (page === 1) {
          return { ok: false as const, error: res.error, candidates: [] };
        }
        break;
      }
      const results = res.data?.results ?? [];
      if (!results.length) break;
      for (const r of results) {
        const ticket = await enrichTicket(r, host, []);
        const excerpt = (r.description_text ?? "").slice(0, 400);
        candidates.push({ ticket, excerpt });
      }
      if (results.length < 30) break;
    }
    return { ok: true as const, candidates };
  });

/** Lazy backfill of full conversations for one ticket. */
export const freshdeskPullFullConversations = createServerFn({ method: "POST" })
  .inputValidator((input: { number: string }) =>
    z.object({ number: z.string().min(1).max(20) }).parse(input),
  )
  .handler(async ({ data }) => {
    const creds = readFreshdeskCreds();
    if ("error" in creds && creds.error) return { ok: false as const, error: creds.error };
    const t = await fdFetch<FreshdeskTicketDTO>(
      `/api/v2/tickets/${encodeURIComponent(data.number)}?include=requester,company,stats`,
    );
    if (t.error || !t.data) return { ok: false as const, error: t.error ?? "Ticket not found." };
    const conv = await fetchAllConversations(data.number);
    if (!conv.ok) return { ok: false as const, error: conv.error ?? "Could not fetch conversations." };
    const notes = conv.conversations.map(normalizeConversation);
    return {
      ok: true as const,
      notes,
      attachments: collectAttachments(t.data, conv.conversations),
      pages: conv.pages,
    };
  });

/* -------------------------- AI re-rank -------------------------- */

function truncate(s: string, n: number) {
  if (!s) return "";
  return s.length > n ? s.slice(0, n) + "…" : s;
}

function buildCandidateBlock(c: IntelCandidate): string {
  const t = c.ticket;
  return [
    `#${t.number} — ${t.subject}`,
    `status=${t.status} priority=${t.priority ?? "?"} group=${t.groupName ?? "?"} agent=${t.agentName ?? "?"} updated=${new Date(t.updatedAt).toISOString()}`,
    `account=${t.accountNumber ?? "?"} (${t.accountName ?? "?"})`,
    `desc: ${truncate(t.description, 800)}`,
  ].join("\n");
}

export const freshdeskIntelligenceRank = createServerFn({ method: "POST" })
  .inputValidator((input: { query: string; candidates: IntelCandidate[] }) =>
    z
      .object({
        query: z.string().max(500),
        candidates: z.array(z.any()).max(30),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) {
      return { ok: false as const, error: "AI summaries unavailable: LOVABLE_API_KEY not set.", ranked: [] as IntelRanked[] };
    }
    const candidates = (data.candidates as IntelCandidate[]).slice(0, 20);
    if (!candidates.length) return { ok: true as const, ranked: [] as IntelRanked[] };

    const system = [
      "You are Freshdesk Intelligence, a strict read-only ticket analyst.",
      "RULES:",
      "- Use ONLY the ticket text provided. Do not invent facts, account names, or actions.",
      "- 'snippet' MUST be a verbatim phrase copied from the ticket text supplied.",
      "- If a field is unknown, return an empty string (do not guess).",
      "- Only return tickets that are plausibly relevant to the user's query.",
      "- confidence is a number 0.0–1.0 reflecting strength of match.",
      "- signal must be one of: stale, urgent, duplicate, ready-to-close, needs-review.",
    ].join("\n");

    const prompt = [
      `USER QUERY: ${data.query}`,
      "",
      "CANDIDATES:",
      ...candidates.map((c, i) => `---\n[${i + 1}]\n${buildCandidateBlock(c)}`),
      "",
      'Return JSON: { "results": [ { "ticketNumber": "...", "matchReason": "...", "issue": "...", "latestUpdate": "...", "suggestedAction": "...", "owner": "...", "signal": "needs-review", "confidence": 0.5, "snippet": "..." } ] }',
    ].join("\n");

    try {
      const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Lovable-API-Key": key,
        },
        body: JSON.stringify({
          model: "google/gemini-3-flash-preview",
          messages: [
            { role: "system", content: system },
            { role: "user", content: prompt },
          ],
          response_format: { type: "json_object" },
        }),
      });
      if (res.status === 429) {
        return { ok: false as const, error: "AI rate limit hit. Try again shortly.", ranked: [] as IntelRanked[] };
      }
      if (res.status === 402) {
        return { ok: false as const, error: "AI credits exhausted. Add credits in workspace billing.", ranked: [] as IntelRanked[] };
      }
      if (!res.ok) {
        return { ok: false as const, error: `AI call failed (${res.status}).`, ranked: [] as IntelRanked[] };
      }
      const body = (await res.json()) as {
        choices?: { message?: { content?: string } }[];
      };
      const content = body.choices?.[0]?.message?.content ?? "{}";
      let parsed: { results?: IntelRanked[] } = {};
      try { parsed = JSON.parse(content); } catch { parsed = {}; }
      const ranked = (parsed.results ?? []).filter(
        (r): r is IntelRanked => typeof r?.ticketNumber === "string",
      );
      return { ok: true as const, ranked };
    } catch (e) {
      return {
        ok: false as const,
        error: e instanceof Error ? e.message : "AI call failed.",
        ranked: [] as IntelRanked[],
      };
    }
  });

/* -------------------------- sync check -------------------------- */

export const freshdeskSyncCheck = createServerFn({ method: "POST" })
  .inputValidator((input: { number: string }) =>
    z.object({ number: z.string().min(1).max(20) }).parse(input),
  )
  .handler(async ({ data }) => {
    const creds = readFreshdeskCreds();
    if ("error" in creds && creds.error) {
      return {
        ok: false as const,
        error: creds.error,
      };
    }
    const t = await fdFetch<FreshdeskTicketDTO>(
      `/api/v2/tickets/${encodeURIComponent(data.number)}?include=requester,company,stats`,
    );
    if (t.status === 404) {
      return {
        ok: true as const,
        report: {
          found: false,
          descriptionPulled: false,
          conversationsPulled: false,
          conversationCount: 0,
          latestConversationAt: null as number | null,
          lastSyncAt: Date.now(),
          errors: [] as string[],
          fullyIndexed: false,
        },
      };
    }
    if (t.error || !t.data) {
      return { ok: false as const, error: t.error ?? "Ticket lookup failed." };
    }
    const conv = await fetchAllConversations(data.number);
    const errors: string[] = [];
    if (!conv.ok && conv.error) errors.push(conv.error);
    const latest = conv.conversations.reduce(
      (max, c) => Math.max(max, new Date(c.created_at).getTime()),
      0,
    );
    return {
      ok: true as const,
      report: {
        found: true,
        descriptionPulled: !!t.data.description_text?.trim(),
        conversationsPulled: conv.conversations.length > 0,
        conversationCount: conv.conversations.length,
        latestConversationAt: latest || null,
        lastSyncAt: Date.now(),
        errors,
        fullyIndexed: !!t.data.description_text?.trim() && conv.ok,
      },
    };
  });