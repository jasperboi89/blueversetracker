import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { json, notAuthed, readStoreBlob } from "../supabase";

interface TicketsBlob {
  tickets?: Array<{
    id: string;
    number: string;
    accountNumber: string;
    accountName: string;
    status: string;
    priority?: string;
    updatedAt: number;
    completedAt?: number;
    details?: { subject?: string; freshdeskUrl?: string };
  }>;
}

export default defineTool({
  name: "list_tickets",
  title: "List Freshdesk tickets",
  description:
    "List the signed-in user's tracked Freshdesk tickets. Filter by status ('working', 'waiting-cs', 'waiting-prog', 'completed', or 'all') and optional account number.",
  inputSchema: {
    status: z.enum(["working", "waiting-cs", "waiting-prog", "completed", "all"]).default("working"),
    accountNumber: z.string().trim().optional(),
    limit: z.number().int().min(1).max(200).default(50),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ status, accountNumber, limit }, ctx) => {
    if (!ctx.isAuthenticated()) return notAuthed();
    const blob = (await readStoreBlob<TicketsBlob>(ctx, "tickets")) ?? {};
    const all = blob.tickets ?? [];
    const filtered = all.filter((t) => {
      if (status !== "all" && t.status !== status) return false;
      if (accountNumber && t.accountNumber !== accountNumber) return false;
      return true;
    });
    const sorted = [...filtered]
      .sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))
      .slice(0, limit)
      .map((t) => ({
        number: t.number,
        accountNumber: t.accountNumber,
        accountName: t.accountName,
        subject: t.details?.subject,
        status: t.status,
        priority: t.priority,
        updatedAt: t.updatedAt,
        freshdeskUrl: t.details?.freshdeskUrl,
      }));
    return json({ count: sorted.length, totalStored: all.length, tickets: sorted });
  },
});