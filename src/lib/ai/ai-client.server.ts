// Server-only AI gateway client. Never import from client bundles.
// Wraps the Lovable AI gateway with the error handling proven in
// freshdesk-search.functions.ts.

export interface AiCompleteResult {
  ok: boolean;
  text?: string;
  error?: string;
}

const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const DEFAULT_MODEL = "google/gemini-3-flash-preview";

export async function aiComplete(opts: {
  system: string;
  prompt: string;
  json?: boolean;
  model?: string;
}): Promise<AiCompleteResult> {
  // Hard environment kill-switch, independent of the client-side toggle.
  if (process.env.AI_DISABLED === "true") {
    return { ok: false, error: "AI is disabled by the administrator." };
  }
  const key = process.env.LOVABLE_API_KEY;
  if (!key) return { ok: false, error: "AI unavailable: LOVABLE_API_KEY not set." };

  try {
    const res = await fetch(GATEWAY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Lovable-API-Key": key },
      body: JSON.stringify({
        model: opts.model ?? DEFAULT_MODEL,
        messages: [
          { role: "system", content: opts.system },
          { role: "user", content: opts.prompt },
        ],
        ...(opts.json ? { response_format: { type: "json_object" } } : {}),
      }),
    });
    if (res.status === 429) return { ok: false, error: "AI rate limit hit. Try again shortly." };
    if (res.status === 402)
      return { ok: false, error: "AI credits exhausted. Add credits in workspace billing." };
    if (!res.ok) return { ok: false, error: `AI call failed (${res.status}).` };
    const body = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const text = body.choices?.[0]?.message?.content ?? "";
    return { ok: true, text };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "AI call failed." };
  }
}
