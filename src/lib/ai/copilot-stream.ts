import { supabase } from "@/integrations/supabase/client";

/** A change the Copilot proposed; nothing happens until the operator applies it. */
export interface ProposedAction {
  kind: string;
  task?: string | null;
  notes?: string | null;
  priority?: string | null;
  ticketNumber?: string | null;
  classification?: string | null;
  reason?: string | null;
}

export interface StreamHandlers {
  onToolStart?: (name: string) => void;
  onToolDone?: (name: string) => void;
  onDelta?: (text: string) => void;
  onProposal?: (action: ProposedAction) => void;
}

export interface StreamRequest {
  mode?: "chat" | "briefing";
  kind?: "shift-start" | "shift-end" | "weekly-digest";
  messages?: Array<{ role: "user" | "assistant"; content: string }>;
  signals?: string;
  style?: string;
  pageContext?: string;
  profile?: string;
  /** Bounded deterministic Focus snapshot (CURRENT/NEXT/WATCH/BLOCKED). */
  focus?: string;
  nowIso?: string;
}

export interface StreamResult {
  ok: boolean;
  text?: string;
  error?: string;
  toolsUsed?: Array<{ name: string; args: string }>;
}

/**
 * POST to the streaming Copilot route and dispatch SSE frames to handlers.
 * Resolves with the final answer once the run completes.
 */
export async function streamCopilot(
  req: StreamRequest,
  handlers: StreamHandlers = {},
  signal?: AbortSignal,
): Promise<StreamResult> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) return { ok: false, error: "Session expired. Sign in again." };

  let res: Response;
  try {
    res = await fetch("/api/copilot", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ mode: "chat", ...req, nowIso: req.nowIso ?? new Date().toISOString() }),
      signal,
    });
  } catch (e) {
    if (signal?.aborted) return { ok: false, error: "Stopped." };
    return { ok: false, error: e instanceof Error ? e.message : "Copilot request failed." };
  }

  if (!res.ok || !res.body) {
    const detail = await res.text().catch(() => "");
    return { ok: false, error: detail?.slice(0, 200) || `Copilot failed (${res.status}).` };
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let final: StreamResult = { ok: false, error: "Copilot stream ended unexpectedly." };

  const handle = (payload: string) => {
    let evt: Record<string, unknown>;
    try {
      evt = JSON.parse(payload) as Record<string, unknown>;
    } catch {
      return;
    }
    switch (evt["type"]) {
      case "delta":
        handlers.onDelta?.(String(evt["text"] ?? ""));
        break;
      case "tool-start":
        handlers.onToolStart?.(String(evt["name"] ?? "tool"));
        break;
      case "tool-done":
        handlers.onToolDone?.(String(evt["name"] ?? "tool"));
        break;
      case "proposal": {
        const action = (evt["action"] as { action?: ProposedAction } | undefined)?.action;
        if (action) handlers.onProposal?.(action);
        break;
      }
      case "done":
        final = {
          ok: Boolean(evt["ok"]),
          text: typeof evt["text"] === "string" ? evt["text"] : undefined,
          error: typeof evt["error"] === "string" ? evt["error"] : undefined,
          toolsUsed: (evt["toolsUsed"] as StreamResult["toolsUsed"]) ?? [],
        };
        break;
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
          if (line.startsWith("data:")) handle(line.slice(5).trim());
        }
      }
    }
  } catch (e) {
    if (signal?.aborted) return { ok: false, error: "Stopped." };
    return { ok: false, error: e instanceof Error ? e.message : "Copilot stream failed." };
  }

  return final;
}

/** Human label for a tool name, shown live while the Copilot works. */
export const TOOL_LABEL: Record<string, string> = {
  search_tickets: "Searching tickets",
  get_ticket: "Reading ticket",
  list_accounts: "Listing accounts",
  account_history: "Reading account history",
  get_night_plan: "Checking night plan",
  get_dispatches: "Checking dispatches",
  get_work_time: "Reading work time",
  search_operational_knowledge: "Searching prior work",
  propose_action: "Preparing an action",
};