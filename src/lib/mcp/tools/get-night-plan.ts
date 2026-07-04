import { defineTool } from "@lovable.dev/mcp-js";
import { json, notAuthed, readStoreBlob } from "../supabase";

interface NightPlanBlob {
  shiftKey?: string;
  items?: Array<{
    id: string;
    task: string;
    notes?: string;
    priority: string;
    status: string;
    createdAt: number;
    completedAt?: number;
  }>;
}

export default defineTool({
  name: "get_night_plan",
  title: "Get night plan",
  description: "Return the signed-in user's current shift Night Plan items (tasks, priority, status).",
  inputSchema: {},
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async (_input, ctx) => {
    if (!ctx.isAuthenticated()) return notAuthed();
    const blob = (await readStoreBlob<NightPlanBlob>(ctx, "night-plan")) ?? {};
    return json({
      shiftKey: blob.shiftKey ?? null,
      itemCount: blob.items?.length ?? 0,
      items: blob.items ?? [],
    });
  },
});