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

const DateRangeSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("all") }),
  z.object({ kind: z.literal("preset"), days: z.union([z.literal(7), z.literal(30), z.literal(90)]) }),
  z.object({
    kind: z.literal("custom"),
    from: z.string().optional(),
    to: z.string().optional(),
  }),
]);
export type DateRange = z.infer<typeof DateRangeSchema>;

const FiltersSchema = z.object({
  accountNumber: z.string().optional(),
  statuses: z.array(z.number()).optional(),
  priorities: z.array(z.number()).optional(),
  groupId: z.number().optional(),
  agentId: z.number().optional(),
  dateRange: DateRangeSchema.optional(),
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

export type ResultGroup = "strong" | "possible" | "related-mention";

export interface IntelResult {
  candidate: IntelCandidate;
  ranked?: IntelRanked;
  group: ResultGroup;
  inclusionReason: string;
}

export interface SearchDebug {
  mode: "account-exact" | "ticket-number" | "email" | "keyword" | "filter-only";
  dataSource: "freshdesk-api";
  freshdeskQuery: string;
  dateRangeLabel: string;
  scanned: number;
  excludedBeforeAi: number;
  exclusions: { reason: string; count: number }[];
  sentToAi: number;
  conversationsPulled: number;
  conversationPages: number;
  filters: string;
  groupCounts: { strong: number; possible: number; relatedMentions: number };
  inclusionReasons: { ticketNumber: string; group: ResultGroup; reason: string }[];
  accountFieldDetected?: string | null;
  paginationTruncated: boolean;
  notes: string[];
}

export type SearchResponse =
  | {
      ok: true;
      strong: IntelResult[];
      possible: IntelResult[];
      relatedMentions: IntelResult[];
      notice?: string;
      aiNotice?: string;
      debug: SearchDebug;
    }
  | { ok: false; error: string; debug?: SearchDebug };

/* -------------------------- helpers -------------------------- */

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}
function isoDaysAgo(days: number): string {
  return isoDate(new Date(Date.now() - days * 24 * 60 * 60 * 1000));
}
function looksLikeEmail(s: string): boolean {
  return /\S+@\S+\.\S+/.test(s);
}
function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function normalizeAccountValue(value: unknown): string {
  return String(value ?? "").trim().replace(/[^a-z0-9]/gi, "").toUpperCase();
}

interface AccountMatcher {
  normalized: string;
  textRegex: RegExp;
}
function createAccountMatcher(acct: string): AccountMatcher | null {
  const normalized = normalizeAccountValue(acct);
  if (!normalized) return null;
  const sep = normalized.split("").map(escapeRegExp).join("[^a-zA-Z0-9]*");
  return {
    normalized,
    textRegex: new RegExp(`(^|[^a-zA-Z0-9])${sep}([^a-zA-Z0-9]|$)`, "i"),
  };
}
function valueEqualsAccount(value: unknown, m: AccountMatcher): boolean {
  return normalizeAccountValue(value) === m.normalized;
}
function textMentionsAccount(value: unknown, m: AccountMatcher): boolean {
  return m.textRegex.test(String(value ?? ""));
}
function isAccountLikeFieldName(key: string): boolean {
  return /account|acct/i.test(key);
}
function accountLikeCustomFieldEntries(
  fields: Record<string, string | number | boolean | null> | undefined,
): [string, string | number | boolean | null][] {
  return fields ? Object.entries(fields).filter(([k]) => isAccountLikeFieldName(k)) : [];
}
function isAccountLikeTag(tag: string, m: AccountMatcher): boolean {
  // Tag of form "acct-1234", "account_1234", "1234", "acct1234"
  return valueEqualsAccount(tag, m) || valueEqualsAccount(tag.replace(/^(acct|account)[-_ ]?/i, ""), m);
}

/** Classify a candidate for account mode: exact (strong) vs mention-only (related) vs none. */
function classifyAccountMatch(
  c: IntelCandidate,
  m: AccountMatcher,
): { group: "strong" | "related-mention" | "none"; reason: string } {
  const t = c.ticket;

  // 1. Exact: normalized accountNumber field on enriched ticket
  if (t.accountNumber && valueEqualsAccount(t.accountNumber, m)) {
    return { group: "strong", reason: `Exact match on ticket.accountNumber (${t.accountNumber})` };
  }
  // 2. Exact: account-like custom fields
  for (const [k, v] of accountLikeCustomFieldEntries(t.customFields)) {
    if (valueEqualsAccount(v, m)) {
      return { group: "strong", reason: `Exact match on custom field ${k}=${String(v)}` };
    }
  }
  // 3. Exact: account/company tags
  for (const tag of t.tags ?? []) {
    if (isAccountLikeTag(tag, m)) {
      return { group: "strong", reason: `Exact match on tag "${tag}"` };
    }
  }
  // 4. Exact: company name normalized equals account number (rare but supported)
  if (t.companyName && valueEqualsAccount(t.companyName, m)) {
    return { group: "strong", reason: `Exact match on company name` };
  }

  // 5. Mention: text fields
  const textBuckets: { label: string; value: string | undefined }[] = [
    { label: "subject", value: t.subject },
    { label: "description", value: t.description },
    { label: "excerpt", value: c.excerpt },
    { label: "company name", value: t.companyName },
    { label: "account name", value: t.accountName },
    { label: "requester", value: t.requesterName },
  ];
  for (const b of textBuckets) {
    if (b.value && textMentionsAccount(b.value, m)) {
      return { group: "related-mention", reason: `Number appears in ${b.label}` };
    }
  }
  for (const tag of t.tags ?? []) {
    if (textMentionsAccount(tag, m)) {
      return { group: "related-mention", reason: `Number appears in tag "${tag}"` };
    }
  }
  return { group: "none", reason: "" };
}

/* ----- account custom field auto-detection ----- */

interface FreshdeskFieldDTO {
  name: string;
  label?: string;
  type?: string;
}
let cachedAccountField: string | null | undefined;

async function detectAccountField(): Promise<string | null> {
  if (cachedAccountField !== undefined) return cachedAccountField;
  const res = await fdFetch<FreshdeskFieldDTO[]>(`/api/v2/ticket_fields`);
  if (!res.data) {
    cachedAccountField = null;
    return null;
  }
  const customs = res.data.filter((f) => typeof f.name === "string" && f.name.startsWith("cf_"));
  const score = (f: FreshdeskFieldDTO) => {
    const n = (f.name + " " + (f.label ?? "")).toLowerCase();
    if (/\b(account[_\s-]?(number|num|no|#))\b/.test(n)) return 3;
    if (/account/.test(n)) return 2;
    if (/\bacct/.test(n)) return 1;
    return 0;
  };
  const best = customs
    .map((f) => ({ f, s: score(f) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s)[0];
  cachedAccountField = best?.f.name ?? null;
  return cachedAccountField;
}

export const freshdeskDetectAccountField = createServerFn({ method: "GET" }).handler(async () => {
  const name = await detectAccountField();
  return { name };
});

/* -------------------------- date range -------------------------- */

function resolveDateRange(dr: DateRange | undefined): {
  from?: string;
  to?: string;
  label: string;
  active: boolean;
} {
  if (!dr || dr.kind === "all") return { label: "All Time", active: false };
  if (dr.kind === "preset") {
    return { from: isoDaysAgo(dr.days), label: `Last ${dr.days} days`, active: true };
  }
  // custom
  const from = dr.from?.trim() || undefined;
  const to = dr.to?.trim() || undefined;
  const label = `Custom${from ? ` from ${from}` : ""}${to ? ` to ${to}` : ""}`.trim();
  return { from, to, label, active: !!(from || to) };
}

/* -------------------------- Freshdesk query -------------------------- */

function buildFreshdeskQuery(opts: {
  filters: IntelFilters;
  accountField?: string | null;
  range: { from?: string; to?: string; active: boolean };
  includeAccountClause: boolean;
}): string {
  const { filters, accountField, range, includeAccountClause } = opts;
  const clauses: string[] = [];
  const acct = filters.accountNumber?.trim();
  if (includeAccountClause && acct && accountField) {
    clauses.push(`${accountField}:'${acct.replace(/'/g, "")}'`);
  }
  if (filters.statuses?.length) {
    clauses.push(`(${filters.statuses.map((s) => `status:${s}`).join(" OR ")})`);
  } else if (!filters.includeClosed) {
    clauses.push(`(status:2 OR status:3 OR status:6 OR status:7)`);
  }
  if (filters.priorities?.length) {
    clauses.push(`(${filters.priorities.map((p) => `priority:${p}`).join(" OR ")})`);
  }
  if (filters.groupId) clauses.push(`group_id:${filters.groupId}`);
  if (filters.agentId) clauses.push(`agent_id:${filters.agentId}`);
  if (range.from) clauses.push(`updated_at:>'${range.from}'`);
  if (range.to) clauses.push(`updated_at:<'${range.to}'`);
  return clauses.join(" AND ");
}

interface RunSearchResult {
  out: IntelCandidate[];
  pagesFetched: number;
  truncated: boolean;
  firstError?: string;
}

async function runFreshdeskSearch(
  qs: string,
  host: string,
  maxPages: number,
): Promise<RunSearchResult> {
  const out: IntelCandidate[] = [];
  let firstError: string | undefined;
  let pagesFetched = 0;
  let truncated = false;
  for (let page = 1; page <= maxPages; page += 1) {
    const res = await fdFetch<{ total: number; results: FreshdeskTicketDTO[] }>(
      `/api/v2/search/tickets?query=%22${encodeURIComponent(qs)}%22&page=${page}`,
    );
    pagesFetched = page;
    if (res.error) {
      if (page === 1) firstError = res.error;
      break;
    }
    const results = res.data?.results ?? [];
    if (!results.length) break;
    for (const r of results) {
      const ticket = await enrichTicket(r, host, []);
      out.push({ ticket, excerpt: (r.description_text ?? "").slice(0, 400) });
    }
    if (results.length < 30) break;
    if (page === maxPages) truncated = true;
  }
  return { out, pagesFetched, truncated, firstError };
}

/* -------------------------- AI ranking (internal) -------------------------- */

function truncate(s: string, n: number) {
  if (!s) return "";
  return s.length > n ? s.slice(0, n) + "…" : s;
}

interface AiCandidateInput {
  index: number;
  candidate: IntelCandidate;
  notesText: string;
}

function buildCandidateBlock(input: AiCandidateInput): string {
  const t = input.candidate.ticket;
  return [
    `[${input.index}] #${t.number} — ${t.subject}`,
    `status=${t.status} priority=${t.priority ?? "?"} group=${t.groupName ?? "?"} agent=${t.agentName ?? "?"} updated=${new Date(t.updatedAt).toISOString()}`,
    `account=${t.accountNumber ?? "?"} (${t.accountName ?? t.companyName ?? "?"})`,
    `desc: ${truncate(t.description, 600)}`,
    input.notesText ? `notes: ${truncate(input.notesText, 1200)}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

async function aiRankCandidates(
  query: string,
  inputs: AiCandidateInput[],
): Promise<{ ranked: IntelRanked[]; error?: string }> {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) return { ranked: [], error: "AI summaries unavailable: LOVABLE_API_KEY not set." };
  if (!inputs.length) return { ranked: [] };

  const system = [
    "You are Freshdesk Intelligence, a strict read-only ticket analyst.",
    "RULES:",
    "- Use ONLY the ticket text provided. Do not invent facts.",
    "- 'snippet' MUST be a verbatim phrase copied from the ticket text supplied.",
    "- If a field is unknown, return an empty string.",
    "- Only return tickets that are plausibly relevant to the user's query.",
    "- Drop tickets with no evidence — do not pad results.",
    "- confidence is a number 0.0-1.0 reflecting strength of match.",
    "- signal must be one of: stale, urgent, duplicate, ready-to-close, needs-review.",
  ].join("\n");
  const prompt = [
    `USER QUERY: ${query}`,
    "",
    "CANDIDATES:",
    ...inputs.map((c) => `---\n${buildCandidateBlock(c)}`),
    "",
    'Return JSON: { "results": [ { "ticketNumber": "...", "matchReason": "...", "issue": "...", "latestUpdate": "...", "suggestedAction": "...", "owner": "...", "signal": "needs-review", "confidence": 0.5, "snippet": "..." } ] }',
  ].join("\n");

  try {
    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Lovable-API-Key": key },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: system },
          { role: "user", content: prompt },
        ],
        response_format: { type: "json_object" },
      }),
    });
    if (res.status === 429) return { ranked: [], error: "AI rate limit hit. Try again shortly." };
    if (res.status === 402) return { ranked: [], error: "AI credits exhausted. Add credits in workspace billing." };
    if (!res.ok) return { ranked: [], error: `AI call failed (${res.status}).` };
    const body = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const content = body.choices?.[0]?.message?.content ?? "{}";
    let parsed: { results?: IntelRanked[] } = {};
    try { parsed = JSON.parse(content); } catch { parsed = {}; }
    const valid = new Set(inputs.map((i) => i.candidate.ticket.number));
    const ranked = (parsed.results ?? []).filter(
      (r): r is IntelRanked =>
        typeof r?.ticketNumber === "string" &&
        valid.has(r.ticketNumber) &&
        typeof r.snippet === "string" &&
        r.snippet.trim().length > 0,
    );
    return { ranked };
  } catch (e) {
    return { ranked: [], error: e instanceof Error ? e.message : "AI call failed." };
  }
}

/* -------------------------- conversation backfill -------------------------- */

async function pullConversationsBatch(
  candidates: IntelCandidate[],
  maxTickets: number,
): Promise<{
  notesByTicket: Map<string, string>;
  conversationsPulled: number;
  pagesPulled: number;
  errors: string[];
}> {
  const notesByTicket = new Map<string, string>();
  let conversationsPulled = 0;
  let pagesPulled = 0;
  const errors: string[] = [];
  const subset = candidates.slice(0, maxTickets);
  for (let i = 0; i < subset.length; i += 4) {
    const batch = subset.slice(i, i + 4);
    const results = await Promise.all(
      batch.map(async (c) => {
        const conv = await fetchAllConversations(c.ticket.number);
        return { number: c.ticket.number, conv };
      }),
    );
    for (const r of results) {
      if (!r.conv.ok) {
        if (r.conv.error) errors.push(`#${r.number}: ${r.conv.error}`);
        continue;
      }
      conversationsPulled += r.conv.conversations.length;
      pagesPulled += r.conv.pages;
      const text = r.conv.conversations
        .map((n: FreshdeskConversationDTO) => (n.body_text ?? n.body ?? "").trim())
        .filter(Boolean)
        .join("\n---\n");
      notesByTicket.set(r.number, text);
    }
  }
  return { notesByTicket, conversationsPulled, pagesPulled, errors };
}

/* -------------------------- main search -------------------------- */

const MAX_PAGES_ACCOUNT_EXACT = 10;       // up to ~300 tickets (Freshdesk search cap)
const MAX_PAGES_ACCOUNT_MENTION = 5;      // bounded scan for mentions when no cf field
const MAX_PAGES_GENERAL = 5;              // bounded scan for keyword queries
const MAX_CANDIDATES_FOR_CONVERSATIONS = 15;
const MAX_CANDIDATES_FOR_AI = 20;

export const freshdeskSearch = createServerFn({ method: "POST" })
  .inputValidator((input: { query: string; filters?: IntelFilters }) =>
    z.object({ query: z.string().max(500), filters: FiltersSchema.optional() }).parse(input),
  )
  .handler(async ({ data }): Promise<SearchResponse> => {
    const creds = readFreshdeskCreds();
    if ("error" in creds && creds.error) {
      return { ok: false, error: creds.error };
    }
    const { host } = creds as { host: string };
    const filters = data.filters ?? {};
    const q = data.query.trim();
    const range = resolveDateRange(filters.dateRange);
    const acct = filters.accountNumber?.trim();
    const accountField = await detectAccountField();
    const debugNotes: string[] = [];
    const exclusions: { reason: string; count: number }[] = [];

    const filtersForDebugObj = {
      accountNumber: acct,
      statuses: filters.statuses,
      priorities: filters.priorities,
      groupId: filters.groupId,
      agentId: filters.agentId,
      dateRange: range.label,
      includeClosed: filters.includeClosed,
    };

    /* ---- Ticket-number shortcut ---- */
    const ticketNumMatch = !acct && q.match(/^#?(\d{4,8})$/);
    if (ticketNumMatch) {
      const t = await fdFetch<FreshdeskTicketDTO>(
        `/api/v2/tickets/${ticketNumMatch[1]}?include=requester,company,stats`,
      );
      if (t.data) {
        const ticket = await enrichTicket(t.data, host, []);
        const cand: IntelCandidate = { ticket, excerpt: (t.data.description_text ?? "").slice(0, 400) };
        const result: IntelResult = {
          candidate: cand,
          group: "strong",
          inclusionReason: `Direct ticket fetch by number #${ticket.number}`,
        };
        return {
          ok: true,
          strong: [result],
          possible: [],
          relatedMentions: [],
          debug: {
            mode: "ticket-number",
            dataSource: "freshdesk-api",
            freshdeskQuery: `GET /tickets/${ticketNumMatch[1]}`,
            dateRangeLabel: range.label,
            scanned: 1,
            excludedBeforeAi: 0,
            exclusions: [],
            sentToAi: 0,
            conversationsPulled: 0,
            conversationPages: 0,
            filters: filtersForDebug,
            groupCounts: { strong: 1, possible: 0, relatedMentions: 0 },
            inclusionReasons: [
              { ticketNumber: ticket.number, group: "strong", reason: result.inclusionReason },
            ],
            accountFieldDetected: accountField,
            paginationTruncated: false,
            notes: ["Direct ticket-number lookup; AI ranking skipped."],
          },
        };
      }
    }

    /* ---- Email shortcut ---- */
    if (!acct && q && looksLikeEmail(q)) {
      const contacts = await fdFetch<{ id: number }[]>(`/api/v2/contacts?email=${encodeURIComponent(q)}`);
      const contactId = contacts.data?.[0]?.id;
      if (contactId) {
        const tix = await fdFetch<FreshdeskTicketDTO[]>(
          `/api/v2/tickets?requester_id=${contactId}&include=requester,company&per_page=50`,
        );
        const out: IntelCandidate[] = [];
        for (const r of tix.data ?? []) {
          const ticket = await enrichTicket(r, host, []);
          out.push({ ticket, excerpt: (r.description_text ?? "").slice(0, 400) });
        }
        const results: IntelResult[] = out.map((c) => ({
          candidate: c,
          group: "strong",
          inclusionReason: `Ticket belongs to requester ${q}`,
        }));
        return {
          ok: true,
          strong: results,
          possible: [],
          relatedMentions: [],
          debug: {
            mode: "email",
            dataSource: "freshdesk-api",
            freshdeskQuery: `GET /tickets?requester_id=${contactId}`,
            dateRangeLabel: range.label,
            scanned: out.length,
            excludedBeforeAi: 0,
            exclusions: [],
            sentToAi: 0,
            conversationsPulled: 0,
            conversationPages: 0,
            filters: filtersForDebug,
            groupCounts: { strong: results.length, possible: 0, relatedMentions: 0 },
            inclusionReasons: results.map((r) => ({
              ticketNumber: r.candidate.ticket.number,
              group: "strong" as const,
              reason: r.inclusionReason,
            })),
            accountFieldDetected: accountField,
            paginationTruncated: false,
            notes: ["Requester email lookup."],
          },
        };
      }
    }

    /* ---- ACCOUNT MODE ---- */
    if (acct) {
      const matcher = createAccountMatcher(acct);
      if (!matcher) {
        return { ok: false, error: "Invalid account number." };
      }

      const strongMap = new Map<string, IntelResult>();
      const mentionMap = new Map<string, IntelResult>();
      let scanned = 0;
      let paginationTruncated = false;
      let firstError: string | undefined;
      const queriesUsed: string[] = [];

      // Pass A: strict cf account filter (exact, all time unless range set)
      if (accountField) {
        const qs = buildFreshdeskQuery({
          filters,
          accountField,
          range,
          includeAccountClause: true,
        });
        queriesUsed.push(qs);
        const r = await runFreshdeskSearch(qs, host, MAX_PAGES_ACCOUNT_EXACT);
        scanned += r.out.length;
        if (r.truncated) paginationTruncated = true;
        if (r.firstError) firstError = r.firstError;
        for (const c of r.out) {
          // Treat all results of this query as exact — the API guaranteed the cf match
          if (!strongMap.has(c.ticket.number)) {
            strongMap.set(c.ticket.number, {
              candidate: c,
              group: "strong",
              inclusionReason: `Freshdesk filter ${accountField}='${acct}' matched`,
            });
          }
        }
        debugNotes.push(
          `Account custom field detected: ${accountField}. Strict query returned ${r.out.length} ticket(s) across ${r.pagesFetched} page(s)${r.truncated ? " (truncated)" : ""}.`,
        );
      } else {
        debugNotes.push(
          "No account custom field detected on this Freshdesk account. Strict filter pass skipped; falling back to mention scan only.",
        );
      }

      // Pass B: mention scan — broader recent slice, post-filter for mentions
      // Skip if user supplied a date range and we already exhausted the strict pass.
      // Even with strict matches, we still surface mentions separately.
      const broadQs = buildFreshdeskQuery({
        filters,
        accountField: null, // no acct clause
        range,
        includeAccountClause: false,
      });
      if (broadQs) {
        queriesUsed.push(broadQs);
        const r = await runFreshdeskSearch(broadQs, host, MAX_PAGES_ACCOUNT_MENTION);
        scanned += r.out.length;
        if (r.truncated) paginationTruncated = true;
        if (r.firstError && !firstError) firstError = r.firstError;
        let mentionExcluded = 0;
        for (const c of r.out) {
          if (strongMap.has(c.ticket.number)) continue;
          const cls = classifyAccountMatch(c, matcher);
          if (cls.group === "strong") {
            strongMap.set(c.ticket.number, {
              candidate: c,
              group: "strong",
              inclusionReason: cls.reason,
            });
          } else if (cls.group === "related-mention") {
            mentionMap.set(c.ticket.number, {
              candidate: c,
              group: "related-mention",
              inclusionReason: cls.reason,
            });
          } else {
            mentionExcluded += 1;
          }
        }
        if (mentionExcluded > 0) {
          exclusions.push({ reason: "scanned but no account-number evidence", count: mentionExcluded });
        }
        debugNotes.push(
          `Mention scan returned ${r.out.length} ticket(s) across ${r.pagesFetched} page(s)${r.truncated ? " (truncated)" : ""}.`,
        );
        if (r.truncated && !range.active) {
          debugNotes.push(
            "Mention scan was capped because no date range was selected. Pick a date range for fuller mention coverage.",
          );
        }
      }

      const strong = Array.from(strongMap.values());
      const mentions = Array.from(mentionMap.values());

      // AI summarize strong + first few mentions for snippet/action
      const aiInputs: AiCandidateInput[] = [];
      const forAi = [...strong, ...mentions].slice(0, MAX_CANDIDATES_FOR_AI);
      const convo = await pullConversationsBatch(
        forAi.map((r) => r.candidate),
        MAX_CANDIDATES_FOR_CONVERSATIONS,
      );
      forAi.forEach((r, idx) =>
        aiInputs.push({
          index: idx + 1,
          candidate: r.candidate,
          notesText: convo.notesByTicket.get(r.candidate.ticket.number) ?? "",
        }),
      );
      const ai = await aiRankCandidates(q || `Account ${acct}`, aiInputs);
      const rankedByNum = new Map(ai.ranked.map((r) => [r.ticketNumber, r]));
      const attach = (results: IntelResult[]) =>
        results.map((r) => ({ ...r, ranked: rankedByNum.get(r.candidate.ticket.number) }));

      const strongOut = attach(strong);
      const mentionsOut = attach(mentions);

      const debug: SearchDebug = {
        mode: "account-exact",
        dataSource: "freshdesk-api",
        freshdeskQuery: queriesUsed.join("  ||  "),
        dateRangeLabel: range.label,
        scanned,
        excludedBeforeAi: exclusions.reduce((s, e) => s + e.count, 0),
        exclusions,
        sentToAi: aiInputs.length,
        conversationsPulled: convo.conversationsPulled,
        conversationPages: convo.pagesPulled,
        filters: filtersForDebug,
        groupCounts: { strong: strongOut.length, possible: 0, relatedMentions: mentionsOut.length },
        inclusionReasons: [...strongOut, ...mentionsOut].map((r) => ({
          ticketNumber: r.candidate.ticket.number,
          group: r.group,
          reason: r.inclusionReason,
        })),
        accountFieldDetected: accountField,
        paginationTruncated,
        notes: debugNotes.concat(convo.errors.length ? [`Conversation errors: ${convo.errors.join("; ")}`] : []),
      };

      let notice: string | undefined;
      if (!strongOut.length) {
        notice = mentionsOut.length
          ? `No exact account match found for ${acct}. Showing related mentions only.`
          : `No tickets found for account ${acct}${range.active ? ` in ${range.label}` : ""}.`;
      }
      if (!strongOut.length && !mentionsOut.length && firstError) {
        return { ok: false, error: firstError, debug };
      }
      return {
        ok: true,
        strong: strongOut,
        possible: [],
        relatedMentions: mentionsOut,
        notice,
        aiNotice: ai.error,
        debug,
      };
    }

    /* ---- GENERAL / KEYWORD MODE ---- */
    if (!q) {
      // Filter-only: just list matching tickets, no AI
      const qs = buildFreshdeskQuery({ filters, accountField: null, range, includeAccountClause: false });
      if (!qs) return { ok: false, error: "Type a search query or set a filter." };
      const r = await runFreshdeskSearch(qs, host, MAX_PAGES_GENERAL);
      const results: IntelResult[] = r.out.map((c) => ({
        candidate: c,
        group: "strong",
        inclusionReason: "Matches active filters",
      }));
      return {
        ok: true,
        strong: results,
        possible: [],
        relatedMentions: [],
        debug: {
          mode: "filter-only",
          dataSource: "freshdesk-api",
          freshdeskQuery: qs,
          dateRangeLabel: range.label,
          scanned: r.out.length,
          excludedBeforeAi: 0,
          exclusions: [],
          sentToAi: 0,
          conversationsPulled: 0,
          conversationPages: 0,
          filters: filtersForDebug,
          groupCounts: { strong: results.length, possible: 0, relatedMentions: 0 },
          inclusionReasons: results.map((res) => ({
            ticketNumber: res.candidate.ticket.number,
            group: "strong" as const,
            reason: res.inclusionReason,
          })),
          accountFieldDetected: accountField,
          paginationTruncated: r.truncated,
          notes: r.truncated && !range.active ? ["Result list was truncated; pick a date range to narrow."] : [],
        },
      };
    }

    // Keyword mode
    const qs = buildFreshdeskQuery({ filters, accountField: null, range, includeAccountClause: false });
    const effectiveQs = qs || `updated_at:>'2000-01-01'`;
    const r = await runFreshdeskSearch(effectiveQs, host, MAX_PAGES_GENERAL);
    if (r.firstError && !r.out.length) {
      return {
        ok: false,
        error: r.firstError,
        debug: {
          mode: "keyword",
          dataSource: "freshdesk-api",
          freshdeskQuery: effectiveQs,
          dateRangeLabel: range.label,
          scanned: 0,
          excludedBeforeAi: 0,
          exclusions: [],
          sentToAi: 0,
          conversationsPulled: 0,
          conversationPages: 0,
          filters: filtersForDebug,
          groupCounts: { strong: 0, possible: 0, relatedMentions: 0 },
          inclusionReasons: [],
          accountFieldDetected: accountField,
          paginationTruncated: false,
          notes: [],
        },
      };
    }
    const forAi = r.out.slice(0, MAX_CANDIDATES_FOR_AI);
    const convo = await pullConversationsBatch(forAi, MAX_CANDIDATES_FOR_CONVERSATIONS);
    const aiInputs: AiCandidateInput[] = forAi.map((c, idx) => ({
      index: idx + 1,
      candidate: c,
      notesText: convo.notesByTicket.get(c.ticket.number) ?? "",
    }));
    const ai = await aiRankCandidates(q, aiInputs);
    const rankedByNum = new Map(ai.ranked.map((rk) => [rk.ticketNumber, rk]));
    const strong: IntelResult[] = [];
    const possible: IntelResult[] = [];
    let droppedNoAi = 0;
    for (const c of forAi) {
      const rk = rankedByNum.get(c.ticket.number);
      if (!rk) { droppedNoAi += 1; continue; }
      const conf = typeof rk.confidence === "number" ? rk.confidence : 0;
      const result: IntelResult = {
        candidate: c,
        ranked: rk,
        group: conf >= 0.75 ? "strong" : "possible",
        inclusionReason: `AI confidence ${conf.toFixed(2)} — ${rk.matchReason || "match"}`,
      };
      if (conf >= 0.45) {
        if (conf >= 0.75) strong.push(result); else possible.push(result);
      } else {
        droppedNoAi += 1;
      }
    }
    if (droppedNoAi > 0) exclusions.push({ reason: "AI low confidence or no evidence", count: droppedNoAi });
    const scannedButNotSent = r.out.length - forAi.length;
    if (scannedButNotSent > 0) exclusions.push({ reason: "scanned but capped before AI", count: scannedButNotSent });

    const debug: SearchDebug = {
      mode: "keyword",
      dataSource: "freshdesk-api",
      freshdeskQuery: effectiveQs,
      dateRangeLabel: range.label,
      scanned: r.out.length,
      excludedBeforeAi: exclusions.reduce((s, e) => s + e.count, 0),
      exclusions,
      sentToAi: aiInputs.length,
      conversationsPulled: convo.conversationsPulled,
      conversationPages: convo.pagesPulled,
      filters: filtersForDebug,
      groupCounts: { strong: strong.length, possible: possible.length, relatedMentions: 0 },
      inclusionReasons: [...strong, ...possible].map((res) => ({
        ticketNumber: res.candidate.ticket.number,
        group: res.group,
        reason: res.inclusionReason,
      })),
      accountFieldDetected: accountField,
      paginationTruncated: r.truncated,
      notes: ([] as string[]).concat(
        r.truncated && !range.active ? ["Candidate scan capped; pick a date range for fuller coverage."] : [],
        convo.errors.length ? [`Conversation errors: ${convo.errors.join("; ")}`] : [],
      ),
    };

    return {
      ok: true,
      strong,
      possible,
      relatedMentions: [],
      notice: strong.length + possible.length === 0 ? "No strong matches found." : undefined,
      aiNotice: ai.error,
      debug,
    };
  });

/* -------------------------- conversation backfill (lazy) -------------------------- */

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

/* -------------------------- sync check (per-ticket coverage) -------------------------- */

export const freshdeskSyncCheck = createServerFn({ method: "POST" })
  .inputValidator((input: { number: string }) =>
    z.object({ number: z.string().min(1).max(20) }).parse(input),
  )
  .handler(async ({ data }) => {
    const creds = readFreshdeskCreds();
    if ("error" in creds && creds.error) return { ok: false as const, error: creds.error };
    const t = await fdFetch<FreshdeskTicketDTO>(
      `/api/v2/tickets/${encodeURIComponent(data.number)}?include=requester,company,stats`,
    );
    if (t.status === 404) {
      return {
        ok: true as const,
        report: {
          found: false,
          subject: false,
          description: false,
          customFields: false,
          tags: false,
          account: false,
          notes: false,
          conversationCount: 0,
          conversationPages: 0,
          latestConversationAt: null as number | null,
          lastSyncAt: Date.now(),
          errors: [] as string[],
          fullyIndexed: false,
        },
      };
    }
    if (t.error || !t.data) return { ok: false as const, error: t.error ?? "Ticket lookup failed." };
    const conv = await fetchAllConversations(data.number);
    const errors: string[] = [];
    if (!conv.ok && conv.error) errors.push(conv.error);
    const latest = conv.conversations.reduce(
      (max, c) => Math.max(max, new Date(c.created_at).getTime()),
      0,
    );
    const dto = t.data;
    return {
      ok: true as const,
      report: {
        found: true,
        subject: !!dto.subject?.trim(),
        description: !!dto.description_text?.trim(),
        customFields: !!dto.custom_fields && Object.keys(dto.custom_fields).length > 0,
        tags: !!dto.tags && dto.tags.length > 0,
        account: !!dto.company?.name || !!dto.company_id,
        notes: conv.ok && conv.conversations.length > 0,
        conversationCount: conv.conversations.length,
        conversationPages: conv.pages,
        latestConversationAt: latest || null,
        lastSyncAt: Date.now(),
        errors,
        fullyIndexed: !!dto.description_text?.trim() && conv.ok && errors.length === 0,
      },
    };
  });

/* -------------------------- account coverage diagnostic -------------------------- */

export interface AccountCoverageReport {
  accountNumber: string;
  accountFieldDetected: string | null;
  exactQuery: string | null;
  exactTotal: number;
  exactPages: number;
  exactTruncated: boolean;
  oldest: number | null;
  newest: number | null;
  mentionsScanned: number;
  mentionsPagesTruncated: boolean;
  scope: "all-time" | "limited";
  errors: string[];
  notes: string[];
}

export const freshdeskAccountCoverage = createServerFn({ method: "POST" })
  .inputValidator((input: { accountNumber: string }) =>
    z.object({ accountNumber: z.string().min(1).max(50) }).parse(input),
  )
  .handler(async ({ data }): Promise<{ ok: true; report: AccountCoverageReport } | { ok: false; error: string }> => {
    const creds = readFreshdeskCreds();
    if ("error" in creds && creds.error) return { ok: false, error: creds.error };
    const { host } = creds as { host: string };
    const acct = data.accountNumber.trim();
    const accountField = await detectAccountField();
    const errors: string[] = [];
    const notes: string[] = [];

    let exactTotal = 0;
    let exactPages = 0;
    let exactTruncated = false;
    let exactQuery: string | null = null;
    let oldest: number | null = null;
    let newest: number | null = null;

    if (accountField) {
      const qs = `${accountField}:'${acct.replace(/'/g, "")}' AND (status:2 OR status:3 OR status:4 OR status:5 OR status:6 OR status:7)`;
      exactQuery = qs;
      const r = await runFreshdeskSearch(qs, host, MAX_PAGES_ACCOUNT_EXACT);
      exactTotal = r.out.length;
      exactPages = r.pagesFetched;
      exactTruncated = r.truncated;
      if (r.firstError) errors.push(r.firstError);
      for (const c of r.out) {
        const u = c.ticket.updatedAt;
        if (oldest === null || u < oldest) oldest = u;
        if (newest === null || u > newest) newest = u;
      }
      notes.push(`Strict scan via ${accountField}='${acct}' across all statuses, all time.`);
    } else {
      notes.push("No account custom field detected; strict scan not possible. Falling back to mention scan only.");
    }

    // Mention scan: broad recent
    const broad = `(status:2 OR status:3 OR status:4 OR status:5 OR status:6 OR status:7)`;
    const r2 = await runFreshdeskSearch(broad, host, MAX_PAGES_ACCOUNT_MENTION);
    if (r2.firstError) errors.push(r2.firstError);

    const scope: "all-time" | "limited" = exactTruncated || r2.truncated ? "limited" : "all-time";
    if (scope === "limited") {
      notes.push(
        "Result set was truncated by Freshdesk pagination; coverage is partial. Narrow with filters to confirm.",
      );
    }

    return {
      ok: true,
      report: {
        accountNumber: acct,
        accountFieldDetected: accountField,
        exactQuery,
        exactTotal,
        exactPages,
        exactTruncated,
        oldest,
        newest,
        mentionsScanned: r2.out.length,
        mentionsPagesTruncated: r2.truncated,
        scope,
        errors,
        notes,
      },
    };
  });
