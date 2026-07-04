import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { json, notAuthed } from "../supabase";

export default defineTool({
  name: "whoami",
  title: "Who am I",
  description: "Return the signed-in user's id and email for the current MCP session.",
  inputSchema: {},
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: (_input, ctx) => {
    if (!ctx.isAuthenticated()) return notAuthed();
    return json({ userId: ctx.getUserId(), email: ctx.getUserEmail() ?? null });
  },
});