import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireActiveAuthorizedUser } from "@/integrations/supabase/require-authorized";
import { logTicketAccess, emailFromClaims } from "./ticket-access-log";
import type {
  FreshdeskTicketDTO,
  FreshdeskConversationDTO,
  NormalizedTicket,
  NormalizedNote,
  NormalizedAttachment,
} from "./freshdesk.types";

function readCreds() {
  const domain = process.env.FRESHDESK_DOMAIN?.trim();
  const apiKey = process.env.FRESHDESK_API_KEY?.trim();
  if (!domain || !apiKey) {
    return { error: "Freshdesk is not connected. Add your domain and API key in Settings." };
  }
  // Allow either "acme" or "acme.freshdesk.com"
  const host = domain.includes(".") ? domain : `${domain}.freshdesk.com`;
  const authHeader = `Basic ${Buffer.from(`${apiKey}:X`).toString("base64")}`;
  return { host, authHeader, apiKey };
}

export async function fdFetch<T>(
  path: string,
): Promise<{ data?: T; status: number; error?: string }> {
  const creds = readCreds();
  if ("error" in creds && creds.error) return { status: 0, error: creds.error };
  const { host, authHeader } = creds as { host: string; authHeader: string };
  try {
    const res = await fetch(`https://${host}${path}`, {
      headers: { Authorization: authHeader, "Content-Type": "application/json" },
    });
    if (res.status === 404) return { status: 404, error: "Ticket not found in Freshdesk." };
    if (res.status === 401 || res.status === 403) {
      return {
        status: res.status,
        error: "Freshdesk authentication failed. Check API key in Settings.",
      };
    }
    if (!res.ok) {
      let detail = "";
      try {
        const body = await res.text();
        // Freshdesk returns JSON like { description: "...", errors: [{ message: "..." }] }
        try {
          const j = JSON.parse(body) as {
            description?: string;
            message?: string;
            errors?: { message?: string; field?: string }[];
          };
          detail =
            j.errors?.map((e) => [e.field, e.message].filter(Boolean).join(": ")).join("; ") ||
            j.description ||
            j.message ||
            body.slice(0, 200);
        } catch {
          detail = body.slice(0, 200);
        }
      } catch {
        /* ignore */
      }
      return {
        status: res.status,
        error: detail ? `Freshdesk ${res.status}: ${detail}` : `Freshdesk returned ${res.status}.`,
      };
    }
    const data = (await res.json()) as T;
    return { data, status: res.status };
  } catch {
    return { status: 0, error: "Could not reach Freshdesk. Check your network and domain." };
  }
}

export function readFreshdeskCreds() {
  return readCreds();
}

const STATUS_MAP: Record<number, NormalizedTicket["status"]> = {
  2: "working", // Open
  3: "waiting-cs", // Pending
  4: "completed", // Resolved
  5: "completed", // Closed
  6: "waiting-cs",
  7: "waiting-prog",
};
const PRIORITY_MAP: Record<number, NonNullable<NormalizedTicket["priority"]>> = {
  1: "Low",
  2: "Medium",
  3: "High",
  4: "Urgent",
};

/**
 * Strict "packed" account matcher for the "48043 - Dr. Movassaghi's" shape:
 * the value must START with a 3–8 digit number, then a separator, then a
 * non-empty name. Requiring the leading number + separator + name keeps it
 * from false-matching bare numbers (phone/ID fields) or free prose.
 */
function looksLikePackedAccount(v: unknown): { number: string; name: string } | null {
  if (typeof v !== "string") return null;
  const m = v.trim().match(/^#?(\d{3,8})\s*[-–—:·|]\s*(\S.*)$/);
  if (!m) return null;
  return { number: m[1], name: m[2].trim() };
}

function detectAccount(t: FreshdeskTicketDTO): { number?: string; name?: string } {
  const cf = t.custom_fields ?? {};

  // 1. Packed "NUMBER - Name" value. The built-in company association is the
  //    authoritative source, but the "Company" control may be configured as a
  //    custom dropdown instead — so scan every custom field too and take the
  //    first that fits the packed shape. This yields both number AND name from
  //    the same source (e.g. 48043 + "Dr. Movassaghi's").
  const packedSources: unknown[] = [t.company?.name, ...Object.values(cf)];
  for (const src of packedSources) {
    const packed = looksLikePackedAccount(src);
    if (packed) return { number: packed.number, name: packed.name };
  }

  // 2. Explicit numeric account-number custom fields (no name attached).
  const explicit = [
    cf["cf_account_number"],
    cf["cf_account"],
    cf["cf_acct"],
    cf["account_number"],
    cf["account"],
  ];
  for (const c of explicit) {
    if (typeof c === "string" && c.trim()) return { number: c.trim(), name: t.company?.name };
    if (typeof c === "number") return { number: String(c), name: t.company?.name };
  }

  // 3. Fall back to scanning free text (subject, body, tags, requester).
  const haystacks: string[] = [
    t.subject ?? "",
    t.description_text ?? "",
    (t.tags ?? []).join(" "),
    t.requester?.name ?? "",
    t.requester?.email ?? "",
  ];
  const labeled = /(?:\[|Acct\.?\s*|Account\s*#?\s*|#\s*)(\d{3,8})\b/i;
  const bare = /\b(\d{3,8})\b/;
  for (const h of haystacks) {
    const m = h.match(labeled) ?? h.match(bare);
    if (m) return { number: m[1], name: t.company?.name };
  }

  // No number found anywhere — surface any plain company name for context.
  return { number: undefined, name: t.company?.name ?? undefined };
}

/**
 * Split a company-field value that packs account number + client name into
 * one string. Handles "12345 - Acme Clinic", "#12345 Acme Clinic",
 * "Acme Clinic - 12345", "Acme Clinic (12345)", and plain "12345".
 */
export function parseCompanyAccount(company?: string | null): { number?: string; name?: string } {
  const c = company?.trim();
  if (!c) return {};
  // Number-first: "12345 - Acme Clinic", "#12345: Acme Clinic", "12345 Acme"
  let m = c.match(/^#?(\d{3,8})\s*[-–—:·|.]?\s*(.*)$/);
  if (m) return { number: m[1], name: m[2].trim() || undefined };
  // Number-last: "Acme Clinic - 12345", "Acme Clinic (12345)", "Acme #12345"
  m = c.match(/^(.*?)\s*[-–—:·|(#]\s*#?(\d{3,8})\)?\s*$/);
  if (m) return { number: m[2], name: m[1].trim() || undefined };
  return { name: c };
}

function sanitizeCustomFields(
  cf: Record<string, unknown> | undefined,
): Record<string, string | number | boolean | null> | undefined {
  if (!cf) return undefined;
  const out: Record<string, string | number | boolean | null> = {};
  for (const [k, v] of Object.entries(cf)) {
    if (v == null) {
      out[k] = null;
      continue;
    }
    if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") out[k] = v;
    else out[k] = String(v);
  }
  return out;
}

function buildSearchableText(t: NormalizedTicket, notes: NormalizedNote[]): string {
  const parts: string[] = [
    `#${t.number}`,
    t.subject,
    t.description,
    t.accountNumber ? `Account ${t.accountNumber}` : "",
    t.accountName ?? "",
    t.companyName ?? "",
    t.requesterName ?? "",
    `status:${t.status}`,
    t.priority ? `priority:${t.priority}` : "",
    t.type ? `type:${t.type}` : "",
    t.groupName ? `group:${t.groupName}` : "",
    t.agentName ? `agent:${t.agentName}` : "",
    (t.tags ?? []).join(" "),
    t.customFields
      ? Object.entries(t.customFields)
          .map(([k, v]) => `${k}:${v}`)
          .join(" ")
      : "",
    notes.map((n) => n.body).join("\n"),
  ];
  return parts.filter(Boolean).join("\n");
}

/** Paginate /tickets/{id}/conversations until empty. Page size = 30 (Freshdesk default). */
export async function fetchAllConversations(ticketNumber: string): Promise<{
  ok: boolean;
  conversations: FreshdeskConversationDTO[];
  error?: string;
  pages: number;
}> {
  const all: FreshdeskConversationDTO[] = [];
  let page = 1;
  while (page <= 20) {
    const res = await fdFetch<FreshdeskConversationDTO[]>(
      `/api/v2/tickets/${encodeURIComponent(ticketNumber)}/conversations?page=${page}&per_page=30`,
    );
    if (res.error || !res.data) {
      if (page === 1) return { ok: false, conversations: [], error: res.error, pages: 0 };
      break;
    }
    all.push(...res.data);
    if (res.data.length < 30) break;
    page += 1;
  }
  return { ok: true, conversations: all, pages: page };
}

const groupCache = new Map<number, string | undefined>();
const agentCache = new Map<number, string | undefined>();

async function resolveGroupName(id?: number | null): Promise<string | undefined> {
  if (!id) return undefined;
  if (groupCache.has(id)) return groupCache.get(id);
  const res = await fdFetch<{ name?: string }>(`/api/v2/groups/${id}`);
  const name = res.data?.name;
  groupCache.set(id, name);
  return name;
}
async function resolveAgentName(id?: number | null): Promise<string | undefined> {
  if (!id) return undefined;
  if (agentCache.has(id)) return agentCache.get(id);
  const res = await fdFetch<{ contact?: { name?: string } }>(`/api/v2/agents/${id}`);
  const name = res.data?.contact?.name;
  agentCache.set(id, name);
  return name;
}

function normalizeTicket(t: FreshdeskTicketDTO, host: string): NormalizedTicket {
  const acct = detectAccount(t);
  return {
    number: String(t.id),
    subject: t.subject ?? "",
    description: t.description_text ?? "",
    status: STATUS_MAP[t.status] ?? "working",
    priority: PRIORITY_MAP[t.priority],
    requesterName: t.requester?.name,
    companyName: t.company?.name,
    type: t.type ?? undefined,
    dueAt: t.due_by ? new Date(t.due_by).getTime() : undefined,
    freshdeskUrl: `https://${host}/a/tickets/${t.id}`,
    createdAt: new Date(t.created_at).getTime(),
    updatedAt: new Date(t.updated_at).getTime(),
    accountNumber: acct.number,
    accountName: acct.name,
    tags: t.tags ?? [],
    customFields: sanitizeCustomFields(t.custom_fields),
  };
}

async function enrichTicket(
  t: FreshdeskTicketDTO,
  host: string,
  notes: NormalizedNote[],
): Promise<NormalizedTicket> {
  const base = normalizeTicket(t, host);
  const [groupName, agentName] = await Promise.all([
    resolveGroupName(t.group_id),
    resolveAgentName(t.responder_id),
  ]);
  base.groupName = groupName;
  base.agentName = agentName;
  base.searchableText = buildSearchableText(base, notes);
  return base;
}

function normalizeConversation(c: FreshdeskConversationDTO): NormalizedNote {
  return {
    freshdeskId: String(c.id),
    author: c.from_email ?? (c.user_id ? `User #${c.user_id}` : "Freshdesk"),
    createdAt: new Date(c.created_at).getTime(),
    body: (c.body_text ?? c.body ?? "").trim(),
    isPrivate: !!c.private,
  };
}

function fmtBytes(n?: number): string | undefined {
  if (!n || n < 1) return undefined;
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function collectAttachments(
  t: FreshdeskTicketDTO,
  convos: FreshdeskConversationDTO[],
): NormalizedAttachment[] {
  const all: NormalizedAttachment[] = [];
  const push = (a: {
    id: number;
    name: string;
    size?: number;
    created_at: string;
    attachment_url?: string;
    content_type?: string;
  }) => {
    all.push({
      freshdeskId: String(a.id),
      name: a.name,
      size: fmtBytes(a.size),
      createdAt: new Date(a.created_at).getTime(),
      url: a.attachment_url,
      contentType: a.content_type,
    });
  };
  t.attachments?.forEach(push);
  convos.forEach((c) => c.attachments?.forEach(push));
  // Dedupe by freshdeskId
  const seen = new Set<string>();
  return all.filter((a) => (seen.has(a.freshdeskId) ? false : (seen.add(a.freshdeskId), true)));
}

/** Test the connection by calling /agents/me */
export const freshdeskTestConnection = createServerFn({ method: "POST" })
  .middleware([requireActiveAuthorizedUser])
  .handler(async () => {
    const creds = readCreds();
    if ("error" in creds && creds.error) return { ok: false as const, error: creds.error };
    const res = await fdFetch<{ contact?: { name?: string }; name?: string }>("/api/v2/agents/me");
    if (res.error || !res.data) return { ok: false as const, error: res.error ?? "Unknown error." };
    const agentName = res.data.contact?.name ?? res.data.name ?? "Connected";
    return { ok: true as const, agentName, domain: (creds as { host: string }).host };
  });

/** Pull a ticket by number. */
export const freshdeskPullTicket = createServerFn({ method: "POST" })
  .middleware([requireActiveAuthorizedUser])
  .inputValidator((input: { number: string }) =>
    z.object({ number: z.string().min(1).max(20) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const creds = readCreds();
    if ("error" in creds && creds.error) return { ok: false as const, error: creds.error };
    await logTicketAccess({
      userId: context.userId,
      email: emailFromClaims(context.claims),
      action: "pull",
      ticketNumber: data.number,
    });
    const { host } = creds as { host: string };
    const t = await fdFetch<FreshdeskTicketDTO>(
      `/api/v2/tickets/${encodeURIComponent(data.number)}?include=requester,company,stats`,
    );
    if (t.status === 404)
      return { ok: false as const, notFound: true as const, error: t.error ?? "Ticket not found." };
    if (t.error || !t.data) return { ok: false as const, error: t.error ?? "Unknown error." };
    const conv = await fetchAllConversations(data.number);
    const conversations = conv.conversations;
    const notes = conversations.map(normalizeConversation);
    const ticket = await enrichTicket(t.data, host, notes);
    return {
      ok: true as const,
      ticket,
      notes,
      attachments: collectAttachments(t.data, conversations),
    };
  });

/** Sync — same shape as pull. UI computes diffs against Hub state. */
export const freshdeskSyncTicket = createServerFn({ method: "POST" })
  .middleware([requireActiveAuthorizedUser])
  .inputValidator((input: { number: string }) =>
    z.object({ number: z.string().min(1).max(20) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const creds = readCreds();
    if ("error" in creds && creds.error) return { ok: false as const, error: creds.error };
    await logTicketAccess({
      userId: context.userId,
      email: emailFromClaims(context.claims),
      action: "sync",
      ticketNumber: data.number,
    });
    const { host } = creds as { host: string };
    const t = await fdFetch<FreshdeskTicketDTO>(
      `/api/v2/tickets/${encodeURIComponent(data.number)}?include=requester,company,stats`,
    );
    if (t.error || !t.data) return { ok: false as const, error: t.error ?? "Sync failed." };
    const conv = await fetchAllConversations(data.number);
    const conversations = conv.conversations;
    const notes = conversations.map(normalizeConversation);
    const ticket = await enrichTicket(t.data, host, notes);
    return {
      ok: true as const,
      ticket,
      notes,
      attachments: collectAttachments(t.data, conversations),
    };
  });

// Exports for sibling search module:
export {
  normalizeTicket,
  normalizeConversation,
  collectAttachments,
  enrichTicket,
  buildSearchableText,
};
