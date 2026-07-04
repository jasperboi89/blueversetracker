import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { json, notAuthed, readStoreBlob } from "../supabase";

interface AccountsBlob {
  accounts?: Array<{
    number: string;
    name: string;
    tags?: string[];
    updatedAt?: number;
  }>;
}

export default defineTool({
  name: "list_accounts",
  title: "List / search accounts",
  description:
    "List the signed-in user's saved accounts. Optionally filter by a substring match on account number or name.",
  inputSchema: {
    query: z.string().trim().optional().describe("Substring match on account number or name"),
    limit: z.number().int().min(1).max(200).default(50),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ query, limit }, ctx) => {
    if (!ctx.isAuthenticated()) return notAuthed();
    const blob = (await readStoreBlob<AccountsBlob>(ctx, "accounts")) ?? {};
    const all = blob.accounts ?? [];
    const q = query?.toLowerCase();
    const filtered = q
      ? all.filter(
          (a) =>
            (a.number ?? "").toLowerCase().includes(q) ||
            (a.name ?? "").toLowerCase().includes(q),
        )
      : all;
    return json({
      count: Math.min(filtered.length, limit),
      totalStored: all.length,
      accounts: filtered.slice(0, limit),
    });
  },
});