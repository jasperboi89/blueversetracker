// Server-only AI gateway client. Never import from client bundles.
//
// All calls go through the Lovable AI Gateway Responses API with
// `stream: true` (consumed server-side) so long reasoning runs never sit
// silent past the platform request timeout.

import { routeTask } from "./router/task-router";
import { reportModelFailure, reportModelSuccess } from "./router/model-registry";
import { recordRouting, describeRouting, logRoutingIfDev } from "./router/telemetry";
import type { ModelTier as RouterTier, TaskKind } from "./router/task-types";

export interface AiCompleteResult {
  ok: boolean;
  text?: string;
  error?: string;
}

const RESPONSES_URL = "https://ai.gateway.lovable.dev/v1/responses";

/**
 * Per-task model tiers. Cheap/fast work (parse, classify, organize) runs on
 * the small model; operator-facing reasoning (copilot, focus, intel) runs on
 * the flagship.
 */
export const AI_MODELS = {
  fast: "openai/gpt-5.6-luna",
  balanced: "openai/gpt-5.6-terra",
  flagship: "openai/gpt-5.6-sol",
} as const;
export type ModelTier = keyof typeof AI_MODELS;

export function modelFor(tier: ModelTier): string {
  return AI_MODELS[tier];
}

/**
 * Resolve the model for a call through the Task / Model Router. Legacy
 * `tier`/`model` options still work; `task` is the preferred input.
 */
function resolveRouting(opts: {
  task?: TaskKind;
  tier?: ModelTier;
  model?: string;
  capabilities?: { tools?: boolean; structuredOutput?: boolean; streaming?: boolean; vision?: boolean; longContext?: boolean };
}) {
  if (opts.model) {
    return { modelId: opts.model, tier: (opts.tier ?? "balanced") as RouterTier, decision: undefined };
  }
  const kind: TaskKind = opts.task ?? "summary";
  const decision = routeTask({
    kind,
    requirements: {
      ...(opts.task ? {} : { tier: opts.tier ?? "balanced" }),
      ...(opts.capabilities ? { capabilities: opts.capabilities } : {}),
    },
  });
  logRoutingIfDev(
    describeRouting({
      taskKind: decision.taskKind,
      tier: decision.tier,
      ...(decision.modelId ? { modelId: decision.modelId } : {}),
      reasonCode: decision.reasonCode,
      capabilities: { ...decision.capabilities },
    }),
  );
  return {
    modelId: decision.modelId ?? modelFor(opts.tier ?? "balanced"),
    tier: (decision.tier === "deterministic" ? "balanced" : decision.tier) as RouterTier,
    decision,
  };
}

export interface ResponsesTool {
  type: "function";
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  strict?: boolean;
}

/** Minimal shape of the items the Responses API returns in `output`. */
export interface ResponseItem {
  type: string;
  id?: string;
  call_id?: string;
  name?: string;
  arguments?: string;
  [k: string]: unknown;
}

interface RawCallResult {
  ok: boolean;
  error?: string;
  text?: string;
  output?: ResponseItem[];
}

function gatewayGuard(): { ok: false; error: string } | { ok: true; key: string } {
  if (process.env.AI_DISABLED === "true") {
    return { ok: false, error: "AI is disabled by the administrator." };
  }
  const key = process.env.LOVABLE_API_KEY;
  if (!key) return { ok: false, error: "AI unavailable: LOVABLE_API_KEY not set." };
  return { ok: true, key };
}

function statusError(status: number): string {
  if (status === 429) return "AI rate limit hit. Try again shortly.";
  if (status === 402) return "AI credits exhausted. Add credits in workspace billing.";
  if (status === 403) return "Lovable AI is disabled for this workspace.";
  return `AI call failed (${status}).`;
}

/**
 * POST to /v1/responses with streaming, consume the SSE server-side, and
 * return the accumulated text plus the terminal output items.
 */
async function callResponses(body: Record<string, unknown>): Promise<RawCallResult> {
  return callResponsesStreaming(body);
}

async function callResponsesStreaming(
  body: Record<string, unknown>,
  onTextDelta?: (delta: string) => void,
): Promise<RawCallResult> {
  const guard = gatewayGuard();
  if (!guard.ok) return { ok: false, error: guard.error };

  let res: Response;
  try {
    res = await fetch(RESPONSES_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Lovable-API-Key": guard.key,
        "X-Lovable-AIG-SDK": "fetch",
      },
      body: JSON.stringify({ ...body, stream: true, store: false }),
    });
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "AI call failed." };
  }

  if (!res.ok || !res.body) {
    let detail = "";
    try {
      detail = (await res.text()).slice(0, 300);
    } catch {
      /* ignore */
    }
    return { ok: false, error: detail ? `${statusError(res.status)} ${detail}` : statusError(res.status) };
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let text = "";
  let output: ResponseItem[] | undefined;
  let failure: string | undefined;

  const handleEvent = (payload: string) => {
    let evt: {
      type?: string;
      delta?: string;
      response?: { output?: ResponseItem[]; output_text?: string; error?: { message?: string } };
      message?: string;
    };
    try {
      evt = JSON.parse(payload);
    } catch {
      return;
    }
    if (evt.type === "response.output_text.delta" && typeof evt.delta === "string") {
      text += evt.delta;
      onTextDelta?.(evt.delta);
    } else if (evt.type === "response.completed" || evt.type === "response.incomplete") {
      output = evt.response?.output ?? output;
      if (!text && typeof evt.response?.output_text === "string") text = evt.response.output_text;
    } else if (evt.type === "error" || evt.type === "response.failed") {
      failure = evt.response?.error?.message ?? evt.message ?? "AI call failed.";
    }
  };

  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      buffer += decoder.decode(chunk.value, { stream: true });
      let idx: number;
      while ((idx = buffer.indexOf("\n\n")) !== -1) {
        const frame = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 2);
        for (const line of frame.split("\n")) {
          if (!line.startsWith("data:")) continue;
          const payload = line.slice(5).trim();
          if (!payload || payload === "[DONE]") continue;
          handleEvent(payload);
        }
      }
    }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "AI stream failed." };
  }

  if (failure) return { ok: false, error: failure };
  return { ok: true, text, output };
}

/** One-shot completion. `json: true` asks the model for a JSON object. */
export async function aiComplete(opts: {
  system: string;
  prompt: string;
  json?: boolean;
  /** Task tier; defaults to the balanced model. */
  tier?: ModelTier;
  /** Explicit model id override (must be an allowlisted gateway id). */
  model?: string;
  /** Preferred input: the router picks the tier/model from the task kind. */
  task?: TaskKind;
}): Promise<AiCompleteResult> {
  const routing = resolveRouting({
    ...(opts.task ? { task: opts.task } : {}),
    ...(opts.tier ? { tier: opts.tier } : {}),
    ...(opts.model ? { model: opts.model } : {}),
    ...(opts.json ? { capabilities: { structuredOutput: true } } : {}),
  });
  const started = Date.now();
  const res = await callResponses({
    model: routing.modelId,
    instructions: opts.system,
    input: [
      {
        role: "user",
        content: [
          {
            type: "input_text",
            // json_object mode requires the literal word "json" in the input.
            text: opts.json ? `${opts.prompt}\n\nRespond with json only.` : opts.prompt,
          },
        ],
      },
    ],
    ...(opts.json ? { text: { format: { type: "json_object" } } } : {}),
  });
  recordRouting({
    at: new Date().toISOString(),
    taskKind: routing.decision?.taskKind ?? opts.task ?? "summary",
    tier: routing.tier,
    modelId: routing.modelId,
    reasonCode: routing.decision?.reasonCode ?? "ROUTINE_GENERATION",
    fallbackUsed: Boolean(routing.decision?.degradedFrom),
    durationMs: Date.now() - started,
    success: res.ok,
  });
  if (res.ok) reportModelSuccess(routing.modelId);
  else reportModelFailure(routing.modelId);
  if (!res.ok) return { ok: false, error: res.error };
  return { ok: true, text: res.text ?? "" };
}

export interface ToolRunTrace {
  name: string;
  args: string;
}

/** Live progress events emitted while a tool-using run is in flight. */
export type CopilotStreamEvent =
  | { type: "tool-start"; name: string; args: string }
  | { type: "tool-done"; name: string }
  | { type: "delta"; text: string };

/**
 * Multi-turn, tool-using call. `input` carries the accumulated conversation
 * items; the loop runs tools until the model answers or the step cap is hit.
 */
export async function aiRespondWithTools(opts: {
  system: string;
  input: Record<string, unknown>[];
  tools: ResponsesTool[];
  runTool: (name: string, args: unknown) => Promise<unknown>;
  tier?: ModelTier;
  maxSteps?: number;
  /** Optional live progress sink (tool activity + answer text deltas). */
  onEvent?: (event: CopilotStreamEvent) => void;
}): Promise<{ ok: boolean; text?: string; error?: string; toolsUsed?: ToolRunTrace[] }> {
  const items = [...opts.input];
  const toolsUsed: ToolRunTrace[] = [];
  const maxSteps = opts.maxSteps ?? 6;

  for (let step = 0; step < maxSteps; step++) {
    const res = await callResponsesStreaming(
      {
        model: modelFor(opts.tier ?? "flagship"),
        instructions: opts.system,
        input: items,
        tools: opts.tools,
        tool_choice: "auto",
        // Reasoning is on by default for these models; carry it forward inline
        // so the follow-up turn can resend the items verbatim.
        include: ["reasoning.encrypted_content"],
      },
      opts.onEvent ? (text) => opts.onEvent?.({ type: "delta", text }) : undefined,
    );
    if (!res.ok) return { ok: false, error: res.error, toolsUsed };

    const output = res.output ?? [];
    const calls = output.filter((i) => i.type === "function_call");

    if (calls.length === 0) {
      const text = (res.text ?? "").trim();
      return { ok: true, text: text || "No answer was returned. Try rephrasing.", toolsUsed };
    }

    // Resend the model's own items, then append each tool result.
    for (const item of output) items.push(item as unknown as Record<string, unknown>);
    for (const call of calls) {
      let parsedArgs: unknown = {};
      try {
        parsedArgs = call.arguments ? JSON.parse(call.arguments) : {};
      } catch {
        parsedArgs = {};
      }
      toolsUsed.push({ name: call.name ?? "tool", args: call.arguments ?? "{}" });
      opts.onEvent?.({ type: "tool-start", name: call.name ?? "tool", args: call.arguments ?? "{}" });
      let result: unknown;
      try {
        result = await opts.runTool(call.name ?? "", parsedArgs);
      } catch (e) {
        result = { error: e instanceof Error ? e.message : "Tool failed." };
      }
      opts.onEvent?.({ type: "tool-done", name: call.name ?? "tool" });
      items.push({
        type: "function_call_output",
        call_id: call.call_id,
        output: JSON.stringify(result).slice(0, 20000),
      });
    }
  }

  return {
    ok: false,
    error: "Copilot needed too many lookups to answer. Try a narrower question.",
    toolsUsed,
  };
}