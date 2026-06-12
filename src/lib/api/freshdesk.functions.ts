import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
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

async function fdFetch<T>(path: string): Promise<{ data?: T; status: number; error?: string }> {
  const creds = readCreds();
  if ("error" in creds && creds.error) return { status: 0, error: creds.error };
  const { host, authHeader } = creds as { host: string; authHeader: string };
  try {
    const res = await fetch(`https://${host}${path}`, {
      headers: { Authorization: authHeader, "Content-Type": "application/json" },
    });
    if (res.status === 404) return { status: 404, error: "Ticket not found in Freshdesk." };
    if (res.status === 401 || res.status === 403) {
      return { status: res.status, error: "Freshdesk authentication failed. Check API key in Settings." };
    }
    if (!res.ok) {
      return { status: res.status, error: `Freshdesk returned ${res.status}.` };
    }
    const data = (await res.json()) as T;
    return { data, status: res.status };
  } catch {
    return { status: 0, error: "Could not reach Freshdesk. Check your network and domain." };
  }
}

const STATUS_MAP: Record<number, NormalizedTicket["status"]> = {
  2: "working",     // Open
  3: "waiting-cs",  // Pending
  4: "completed",   // Resolved
  5: "completed",   // Closed
  6: "waiting-cs",
  7: "waiting-prog",
};
const PRIORITY_MAP: Record<number, NonNullable<NormalizedTicket["priority"]>> = {
  1: "Low", 2: "Medium", 3: "High", 4: "Urgent",
};

function detectAccount(t: FreshdeskTicketDTO): { number?: string; name?: string } {
  const cf = t.custom_fields ?? {};
  const candidates = [
    cf["cf_account_number"], cf["cf_account"], cf["cf_acct"],
    cf["account_number"], cf["account"],
  ];
  let acctNum: string | undefined;
  for (const c of candidates) {
    if (typeof c === "string" && c.trim()) { acctNum = c.trim(); break; }
    if (typeof c === "number") { acctNum = String(c); break; }
  }
  if (!acctNum) {
    // Try subject pattern like "[1234]" or "Acct 1234"
    const m = (t.subject ?? "").match(/(?:\[|Acct\s*|Account\s*#?\s*)(\d{3,8})/i);
    if (m) acctNum = m[1];
  }
  const acctName = t.company?.name;
  return { number: acctNum, name: acctName };
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
  };
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

function collectAttachments(t: FreshdeskTicketDTO, convos: FreshdeskConversationDTO[]): NormalizedAttachment[] {
  const all: NormalizedAttachment[] = [];
  const push = (a: { id: number; name: string; size?: number; created_at: string; attachment_url?: string; content_type?: string }) => {
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
export const freshdeskTestConnection = createServerFn({ method: "POST" }).handler(async () => {
  const creds = readCreds();
  if ("error" in creds && creds.error) return { ok: false as const, error: creds.error };
  const res = await fdFetch<{ contact?: { name?: string }; name?: string }>("/api/v2/agents/me");
  if (res.error || !res.data) return { ok: false as const, error: res.error ?? "Unknown error." };
  const agentName = res.data.contact?.name ?? res.data.name ?? "Connected";
  return { ok: true as const, agentName, domain: (creds as { host: string }).host };
});

/** Pull a ticket by number. */
export const freshdeskPullTicket = createServerFn({ method: "POST" })
  .inputValidator((input: { number: string }) => z.object({ number: z.string().min(1).max(20) }).parse(input))
  .handler(async ({ data }) => {
    const creds = readCreds();
    if ("error" in creds && creds.error) return { ok: false as const, error: creds.error };
    const { host } = creds as { host: string };
    const t = await fdFetch<FreshdeskTicketDTO>(
      `/api/v2/tickets/${encodeURIComponent(data.number)}?include=requester,company,stats`,
    );
    if (t.status === 404) return { ok: false as const, notFound: true as const, error: t.error ?? "Ticket not found." };
    if (t.error || !t.data) return { ok: false as const, error: t.error ?? "Unknown error." };
    const convos = await fdFetch<FreshdeskConversationDTO[]>(
      `/api/v2/tickets/${encodeURIComponent(data.number)}/conversations`,
    );
    const conversations = convos.data ?? [];
    return {
      ok: true as const,
      ticket: normalizeTicket(t.data, host),
      notes: conversations.map(normalizeConversation),
      attachments: collectAttachments(t.data, conversations),
    };
  });

/** Sync — same shape as pull. UI computes diffs against Hub state. */
export const freshdeskSyncTicket = createServerFn({ method: "POST" })
  .inputValidator((input: { number: string }) => z.object({ number: z.string().min(1).max(20) }).parse(input))
  .handler(async ({ data }) => {
    const creds = readCreds();
    if ("error" in creds && creds.error) return { ok: false as const, error: creds.error };
    const { host } = creds as { host: string };
    const t = await fdFetch<FreshdeskTicketDTO>(
      `/api/v2/tickets/${encodeURIComponent(data.number)}?include=requester,company,stats`,
    );
    if (t.error || !t.data) return { ok: false as const, error: t.error ?? "Sync failed." };
    const convos = await fdFetch<FreshdeskConversationDTO[]>(
      `/api/v2/tickets/${encodeURIComponent(data.number)}/conversations`,
    );
    return {
      ok: true as const,
      ticket: normalizeTicket(t.data, host),
      notes: (convos.data ?? []).map(normalizeConversation),
      attachments: collectAttachments(t.data, convos.data ?? []),
    };
  });