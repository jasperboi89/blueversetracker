import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireActiveAuthorizedUser } from "@/integrations/supabase/require-authorized";

/**
 * "Seen this before" — finds past Freshdesk tickets and Knowledge Vault notes
 * that resemble the ticket currently being worked, using the existing
 * full-text ticket index plus the operator's own notes. An optional cheap AI
 * pass adds a one-line "why this matches" and pulls out the likely fix.
 */

export interface PriorFixTicket {
  ticketNumber: string;
  subject: string;
  accountNumber?: string;
  accountName?: string;
  updatedAt: number;
  freshdeskUrl: string;
  /** Short excerpt from the ticket thread — the raw evidence. */
  excerpt: string;
  /** AI-extracted resolution, empty when unknown. */
  fix: string;
  /** AI one-liner explaining the match. */
  why: string;
}

export interface PriorFixNote {
  id: string;
  title: string;
  noteType: string;
  updatedAt: string;
  excerpt: string;
}

export interface PriorFixesResult {
  ok: boolean;
  indexAvailable: boolean;
  tickets: PriorFixTicket[];
  notes: PriorFixNote[];
  query: string;
  error?: string;
}

const STOP_WORDS = new Set([
  "the","and","for","with","from","that","this","have","has","not","are","was","were","you","your",
  "please","hello","hi","thanks","thank","need","needs","would","could","should","when","what","they",
  "them","their","there","here","about","into","over","been","being","also","can","will","just","only",
  "ticket","tickets","issue","issues","account","customer","client","call","calls","message","messages",
  "regards","best","team","support","sent","sender","email","emails","attached","attachment","http","https",
]);

/** Pull the most distinctive terms out of subject + description. */
export function priorFixKeywords(subject: string, description: string): string[] {
  const counts = new Map<string, number>();
  const push = (text: string, weight: number) => {
    for (const raw of text.toLocaleLowerCase().split(/[^a-z0-9._-]+/i)) {
      const token = raw.replace(/^[._-]+|[._-]+$/g, "");
      if (token.length < 4 || token.length > 28) continue;
      if (STOP_WORDS.has(token)) continue;
      if (/^\d+$/.test(token) && token.length < 4) continue;
      counts.set(token, (counts.get(token) ?? 0) + weight);
    }
  };
  push(subject, 3);
  push(description.slice(0, 4000), 1);
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([token]) => token);
}

function excerptAround(text: string, terms: string[], length = 320): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return "";
  const lower = clean.toLocaleLowerCase();
  let at = -1;
  for (const term of terms) {
    const found = lower.indexOf(term);
    if (found >= 0) {
      at = found;
      break;
    }
  }
  const start = at < 0 ? 0 : Math.max(0, at - 90);
  const slice = clean.slice(start, start + length);
  return (start > 0 ? "…" : "") + slice + (start + length < clean.length ? "…" : "");
}

const InputSchema = z.object({
  ticketNumber: z.string().max(20).optional(),
  subject: z.string().max(400).default(""),
  description: z.string().max(12000).default(""),
  accountNumber: z.string().max(50).optional(),
  /** Restrict ticket hits to this account (used on the account page). */
  accountOnly: z.boolean().optional(),
  withAi: z.boolean().optional(),
  limit: z.number().int().min(1).max(10).optional(),
});

export const findPriorFixes = createServerFn({ method: "POST" })
  .middleware([requireActiveAuthorizedUser])
  .inputValidator((input: unknown) => InputSchema.parse(input))
  .handler(async ({ data, context }): Promise<PriorFixesResult> => {
    const keywords = priorFixKeywords(data.subject, data.description);
    const query = [data.accountOnly ? "" : "", ...keywords].filter(Boolean).join(" ");
    const limit = data.limit ?? 5;

    if (!query && !data.accountNumber) {
      return { ok: true, indexAvailable: true, tickets: [], notes: [], query: "" };
    }

    const { searchFreshdeskIndex } = await import("./freshdesk-index.functions");
    const search = await searchFreshdeskIndex(query || (data.accountNumber ?? ""), 60);

    let hits = (search.hits ?? []).filter((h) => h.ticket.number !== data.ticketNumber);
    if (data.accountOnly && data.accountNumber) {
      hits = hits.filter((h) => h.ticket.accountNumber === data.accountNumber);
    } else if (data.accountNumber) {
      // Same-account tickets first, then everything else by recency.
      hits.sort((a, b) => {
        const aSame = a.ticket.accountNumber === data.accountNumber ? 1 : 0;
        const bSame = b.ticket.accountNumber === data.accountNumber ? 1 : 0;
        if (aSame !== bSame) return bSame - aSame;
        return b.ticket.updatedAt - a.ticket.updatedAt;
      });
    }
    const top = hits.slice(0, limit);

    const tickets: PriorFixTicket[] = top.map((h) => ({
      ticketNumber: h.ticket.number,
      subject: h.ticket.subject,
      accountNumber: h.ticket.accountNumber,
      accountName: h.ticket.accountName ?? h.ticket.companyName,
      updatedAt: h.ticket.updatedAt,
      freshdeskUrl: h.ticket.freshdeskUrl,
      excerpt: excerptAround(
        `${h.ticket.description ?? ""} ${h.conversationText ?? ""}`,
        keywords,
      ),
      fix: "",
      why: "",
    }));

    // Knowledge Vault notes — RLS-scoped to the caller.
    const notes: PriorFixNote[] = [];
    if (keywords.length) {
      const or = keywords
        .slice(0, 5)
        .map((k) => `title.ilike.%${k}%,content_html.ilike.%${k}%`)
        .join(",");
      const { data: noteRows } = await context.supabase
        .from("knowledge_notes")
        .select("id,title,note_type,updated_at,content_html")
        .eq("is_archived", false)
        .or(or)
        .order("updated_at", { ascending: false })
        .limit(limit);
      for (const row of noteRows ?? []) {
        notes.push({
          id: row.id as string,
          title: row.title as string,
          noteType: row.note_type as string,
          updatedAt: row.updated_at as string,
          excerpt: excerptAround(
            String(row.content_html ?? "").replace(/<[^>]*>/g, " "),
            keywords,
            220,
          ),
        });
      }
    }

    if (!tickets.length || data.withAi === false) {
      return {
        ok: true,
        indexAvailable: search.available,
        tickets,
        notes,
        query,
        ...(search.error ? { error: search.error } : {}),
      };
    }

    // One cheap call over the shortlist only: why it matches + what fixed it.
    try {
      const { aiComplete } = await import("@/lib/ai/ai-client.server");
      const res = await aiComplete({
        json: true,
        tier: "fast",
        system: [
          "You compare a current support ticket against past tickets for a night-shift operator.",
          'Return strict JSON: { "matches": [ { "number": string, "why": string, "fix": string } ] }.',
          "'why' is one short sentence on why the past ticket resembles the current one.",
          "'fix' is the resolution taken on the past ticket, quoted or tightly paraphrased.",
          'If the past ticket shows no resolution, return "" for fix.',
          "Use ONLY the provided text. Never invent fixes. Drop entries that are not genuinely similar.",
        ].join("\n"),
        prompt: [
          "CURRENT TICKET:",
          data.subject,
          data.description.slice(0, 2500),
          "",
          "PAST TICKETS:",
          ...tickets.map(
            (t) => `#${t.number} [${t.accountNumber ?? "?"}] ${t.subject}\n${t.excerpt}`,
          ),
        ].join("\n"),
      });
      if (res.ok) {
        const parsed = JSON.parse(res.text ?? "{}") as {
          matches?: { number?: string; why?: string; fix?: string }[];
        };
        const byNumber = new Map(
          (parsed.matches ?? []).map((m) => [String(m.number ?? "").replace(/^#/, ""), m]),
        );
        const enriched = tickets
          .map((t) => {
            const m = byNumber.get(t.ticketNumber);
            return m ? { ...t, why: m.why ?? "", fix: m.fix ?? "" } : null;
          })
          .filter((t): t is PriorFixTicket => t !== null);
        if (enriched.length) {
          return { ok: true, indexAvailable: search.available, tickets: enriched, notes, query };
        }
      }
    } catch {
      // Fall through to the unranked list — the raw hits are still useful.
    }

    return { ok: true, indexAvailable: search.available, tickets, notes, query };
  });