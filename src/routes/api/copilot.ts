import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database } from "@/integrations/supabase/types";
import { classifyOperatorMessage, detectDeterministicIntent } from "@/lib/ai/router/deterministic-intercept";
import { routeTask } from "@/lib/ai/router/task-router";
import { GROUNDING_RULES } from "@/lib/ai/router/context-builder";
import type { TaskKind } from "@/lib/ai/router/task-types";

/**
 * Streaming Copilot endpoint. Same tool loop as the buffered server function,
 * but tool activity and answer text are pushed to the browser as SSE frames
 * so the assistant feels live instead of appearing all at once.
 *
 * Auth: the browser sends its Supabase access token as a bearer header; the
 * caller must also be an active row in authorized_users (same wall as the
 * server functions).
 */

const Body = z.object({
  mode: z.enum(["chat", "briefing"]).default("chat"),
  kind: z.enum(["shift-start", "shift-end", "weekly-digest"]).optional(),
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().max(8000),
      }),
    )
    .max(24)
    .default([]),
  signals: z.string().max(2000).optional(),
  style: z.string().max(600).optional(),
  pageContext: z.string().max(600).optional(),
  profile: z.string().max(2000).optional(),
  nowIso: z.string().max(40).optional(),
});

const BRIEFING_GOAL: Record<string, string> = {
  "shift-start":
    "Write a SHIFT-START BRIEFING. Look up open/overdue tickets, waiting items, the night plan (including rolled-over items) and what was completed on the last shift. Output: one short orienting paragraph, then a bulleted 'Start here' list of at most 5 concrete next actions in priority order.",
  "shift-end":
    "Write a SHIFT-END HANDOFF NOTE for the next operator, copy-ready. Look up what was completed this shift, what is still open or waiting and on whom, night plan items not finished, and logged work time. Output sections: **Completed**, **Still open / waiting**, **Watch outs**, **Next shift should**. Bullets only, no filler.",
  "weekly-digest":
    "Write a WEEKLY PATTERN DIGEST. Look across tickets and account history for recurring issue clusters. Output: at most 6 bullets, each phrased as 'Account <number> (<name>) keeps hitting <pattern>' with ticket numbers as evidence, then one short 'Suggested follow-ups' list. Only report patterns backed by 2+ tickets.",
};

function sse(event: unknown): Uint8Array {
  return new TextEncoder().encode(`data: ${JSON.stringify(event)}\n\n`);
}

export const Route = createFileRoute("/api/copilot")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = request.headers.get("authorization") ?? "";
        if (!auth.startsWith("Bearer ")) {
          return new Response("Unauthorized", { status: 401 });
        }
        const token = auth.slice(7).trim();
        const url = process.env["SUPABASE_URL"];
        const key = process.env["SUPABASE_PUBLISHABLE_KEY"];
        if (!url || !key) return new Response("Backend not configured", { status: 500 });

        const supabase = createClient<Database>(url, key, {
          global: { headers: { Authorization: `Bearer ${token}` } },
          auth: { persistSession: false, autoRefreshToken: false },
        });

        const claims = await supabase.auth.getClaims(token);
        const userId = claims.data?.claims?.sub;
        if (claims.error || !userId) return new Response("Unauthorized", { status: 401 });

        const { data: authorized } = await supabase
          .from("authorized_users")
          .select("status")
          .eq("user_id", userId)
          .maybeSingle();
        if (!authorized || authorized.status !== "active") {
          return new Response("Forbidden", { status: 403 });
        }

        let body: z.infer<typeof Body>;
        try {
          body = Body.parse(await request.json());
        } catch {
          return new Response("Bad request", { status: 400 });
        }

        const { aiRespondWithTools } = await import("@/lib/ai/ai-client.server");
        const { COPILOT_TOOLS, runCopilotTool } = await import("@/lib/ai/copilot-tools.server");
        const { logTicketAccess } = await import("@/lib/api/ticket-access-log");
        await logTicketAccess({
          userId,
          email: (claims.data?.claims as { email?: string } | undefined)?.email,
          action: "ai",
          query: `ai:${body.mode === "briefing" ? `briefing-${body.kind}` : "copilot-chat"}`,
        });

        // Task routing: briefings are handoff/pattern work; chat is classified
        // deterministically from the operator's last message.
        const lastUser = [...body.messages].reverse().find((m) => m.role === "user")?.content ?? "";
        const intercept = body.mode === "chat" ? detectDeterministicIntent(lastUser) : null;
        const taskKind: TaskKind =
          body.mode === "briefing"
            ? body.kind === "weekly-digest"
              ? "pattern_analysis"
              : "handoff_generation"
            : intercept?.wantsInterpretation
              ? "knowledge_interpretation"
              : intercept
                ? intercept.taskKind
                : classifyOperatorMessage(lastUser);

        // A pure deterministic intent is answered by the Hub's own tools; the
        // model tier is only used when interpretation is actually requested.
        const decision = routeTask({
          kind: taskKind,
          requirements: { capabilities: { tools: true, streaming: true } },
        });
        const modelTaskKind: TaskKind =
          decision.route === "deterministic" ? "operational_question" : taskKind;

        const system = [
          "You are Intel Copilot for a night-shift support/programming operator in the Account Intel Hub.",
          "Use the read-only tools to look up the operator's real Hub data before answering — never guess ticket numbers, accounts, statuses, or times.",
          "If a lookup returns nothing, say so plainly. Be concise and specific; reference ticket and account numbers.",
          "When the operator would clearly benefit from a change (a night plan item, a classification, a timer), call propose_action — it only queues a card they confirm.",
          "Short markdown: bold labels and bullets. No preamble, no closing pleasantries.",
          GROUNDING_RULES,
          intercept
            ? `The request maps to a deterministic Hub lookup (${intercept.intercept}${intercept.target ? ` ${intercept.target}` : ""}). Answer from that lookup's tool result only — do not speculate.`
            : "",
          body.nowIso ? `Current time (ISO): ${body.nowIso}.` : "",
          body.pageContext ? `The operator is currently viewing: ${body.pageContext}.` : "",
          body.profile ? `Operator profile (learned patterns):\n${body.profile}` : "",
          body.signals ? `Detected signals from the Hub:\n${body.signals}` : "",
          body.style ?? "",
        ]
          .filter(Boolean)
          .join("\n");

        const input =
          body.mode === "briefing"
            ? [
                {
                  role: "user",
                  content: [
                    {
                      type: "input_text",
                      text: BRIEFING_GOAL[body.kind ?? "shift-start"] ?? BRIEFING_GOAL["shift-start"],
                    },
                  ],
                },
              ]
            : body.messages.map((m) =>
                m.role === "user"
                  ? { role: "user", content: [{ type: "input_text", text: m.content }] }
                  : { role: "assistant", content: [{ type: "output_text", text: m.content }] },
              );

        const stream = new ReadableStream<Uint8Array>({
          async start(controller) {
            const send = (e: unknown) => {
              try {
                controller.enqueue(sse(e));
              } catch {
                /* client went away */
              }
            };
            send({ type: "start" });
            const res = await aiRespondWithTools({
              system,
              input: input as Record<string, unknown>[],
              tools: COPILOT_TOOLS,
              task: modelTaskKind,
              maxSteps: body.mode === "briefing" ? 8 : 6,
              onEvent: send,
              runTool: async (name, args) => {
                const result = await runCopilotTool(supabase, userId, name, args);
                if (name === "propose_action") send({ type: "proposal", action: result });
                return result;
              },
            });
            send({ type: "done", ...res });
            controller.close();
          },
        });

        return new Response(stream, {
          headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache, no-transform",
            Connection: "keep-alive",
          },
        });
      },
    },
  },
});