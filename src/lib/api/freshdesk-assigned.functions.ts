import { createServerFn } from "@tanstack/react-start";
import { requireActiveAuthorizedUser } from "@/integrations/supabase/require-authorized";
import { fdFetch, readFreshdeskCreds } from "./freshdesk.functions";
import type { FreshdeskTicketDTO } from "./freshdesk.types";

export interface AssignedTicketRow {
  number: string;
  subject: string;
  status: number;
  statusLabel: "Open" | "Pending" | "Waiting on Customer" | "Waiting on Third Party" | "Other";
  priority?: "Low" | "Medium" | "High" | "Urgent";
  companyName?: string;
  accountNumber?: string;
  updatedAt: number;
  createdAt: number;
  freshdeskUrl: string;
}

const STATUS_LABELS: Record<number, AssignedTicketRow["statusLabel"]> = {
  2: "Open",
  3: "Pending",
  6: "Waiting on Customer",
  7: "Waiting on Third Party",
};
const PRIORITY: Record<number, NonNullable<AssignedTicketRow["priority"]>> = {
  1: "Low",
  2: "Medium",
  3: "High",
  4: "Urgent",
};

/** Return the current Freshdesk agent's id + name (from the stored API key). */
export const freshdeskGetMyAgent = createServerFn({ method: "POST" })
  .middleware([requireActiveAuthorizedUser])
  .handler(async () => {
    const creds = readFreshdeskCreds();
    if ("error" in creds && creds.error) return { ok: false as const, error: creds.error };
    const res = await fdFetch<{ id: number; contact?: { name?: string; email?: string } }>(
      "/api/v2/agents/me",
    );
    if (res.error || !res.data) return { ok: false as const, error: res.error ?? "Unknown error." };
    return {
      ok: true as const,
      agentId: res.data.id,
      name: res.data.contact?.name ?? "Agent",
      email: res.data.contact?.email,
    };
  });

function packedAccountFromCf(t: FreshdeskTicketDTO): { number?: string; name?: string } {
  const cf = t.custom_fields ?? {};
  const sources: unknown[] = [t.company?.name, ...Object.values(cf)];
  for (const src of sources) {
    if (typeof src !== "string") continue;
    const m = src.trim().match(/^#?(\d{3,8})\s*[-–—:·|]\s*(\S.*)$/);
    if (m) return { number: m[1], name: m[2].trim() };
  }
  return {};
}

/** List tickets currently assigned to the given agent (open + pending states). */
export const freshdeskListAssignedToMe = createServerFn({ method: "POST" })
  .middleware([requireActiveAuthorizedUser])
  .inputValidator((input: { agentId: number }) => {
    if (!input || typeof input.agentId !== "number") throw new Error("agentId required");
    return { agentId: input.agentId };
  })
  .handler(async ({ data }) => {
    const creds = readFreshdeskCreds();
    if ("error" in creds && creds.error) return { ok: false as const, error: creds.error };
    const { host } = creds as { host: string };

    // Filter: any non-closed/resolved status assigned to this agent.
    const query = `"agent_id:${data.agentId} AND (status:2 OR status:3 OR status:6 OR status:7)"`;
    const encoded = encodeURIComponent(query).replace(/'/g, "%27");

    const rows: AssignedTicketRow[] = [];
    // Search API returns max 30 per page, up to 10 pages.
    for (let page = 1; page <= 10; page++) {
      const res = await fdFetch<{ total: number; results: FreshdeskTicketDTO[] }>(
        `/api/v2/search/tickets?query=${encoded}&page=${page}`,
      );
      if (res.error || !res.data) {
        if (page === 1) return { ok: false as const, error: res.error ?? "Search failed." };
        break;
      }
      const results = res.data.results ?? [];
      for (const t of results) {
        const acct = packedAccountFromCf(t);
        rows.push({
          number: String(t.id),
          subject: t.subject ?? "(no subject)",
          status: t.status,
          statusLabel: STATUS_LABELS[t.status] ?? "Other",
          priority: PRIORITY[t.priority],
          companyName: t.company?.name,
          accountNumber: acct.number,
          updatedAt: new Date(t.updated_at).getTime(),
          createdAt: new Date(t.created_at).getTime(),
          freshdeskUrl: `https://${host}/a/tickets/${t.id}`,
        });
      }
      if (results.length < 30) break;
    }

    rows.sort((a, b) => b.updatedAt - a.updatedAt);
    return { ok: true as const, tickets: rows, fetchedAt: Date.now() };
  });