import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { json, notAuthed, readStoreBlob } from "../supabase";

interface DispatchBlob {
  sessions?: Array<{
    id: string;
    accountNumber: string;
    accountName: string;
    ticketNumber?: string;
    status: string | null;
    updatedAt: number;
    completedAt?: number;
    activatedAt?: number;
  }>;
}

export default defineTool({
  name: "list_dispatches",
  title: "List contact dispatch sessions",
  description:
    "List the signed-in user's contact dispatch testing sessions. Filter by status: 'active' (default) excludes ready/activated, 'ready', 'activated', or 'all'.",
  inputSchema: {
    status: z.enum(["active", "ready", "activated", "all"]).default("active"),
    limit: z.number().int().min(1).max(200).default(50),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ status, limit }, ctx) => {
    if (!ctx.isAuthenticated()) return notAuthed();
    const blob = (await readStoreBlob<DispatchBlob>(ctx, "dispatch")) ?? {};
    const all = blob.sessions ?? [];
    const filtered = all.filter((s) => {
      if (status === "all") return true;
      if (status === "active") return s.status !== "ready" && s.status !== "activated";
      return s.status === status;
    });
    const sorted = [...filtered].sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0)).slice(0, limit);
    return json({ count: sorted.length, totalStored: all.length, sessions: sorted });
  },
});