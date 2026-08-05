import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireActiveAuthorizedUser } from "@/integrations/supabase/require-authorized";
import { logTicketAccess, emailFromClaims } from "@/lib/api/ticket-access-log";

/**
 * Portal-wide AI endpoints. Every one is gated by requireActiveAuthorizedUser
 * and writes an `action:'ai'` row to the audit trail (with the surface in the
 * query field) BEFORE calling the model, since the payload can contain PHI.
 */

const NoteSchema = z.object({ author: z.string().max(200).optional(), body: z.string().max(4000) });

const TicketContextSchema = z.object({
  number: z.string().max(20),
  subject: z.string().max(400).optional(),
  description: z.string().max(8000).optional(),
  accountName: z.string().max(200).optional(),
  notes: z.array(NoteSchema).max(60).optional(),
  issueText: z.string().max(4000).optional(),
  changesText: z.string().max(4000).optional(),
  resultStatus: z.string().max(40).optional(),
  resultNotes: z.string().max(4000).optional(),
  style: z.string().max(600).optional(),
});
type TicketContext = z.infer<typeof TicketContextSchema>;

function threadText(t: TicketContext): string {
  const lines = [
    `Ticket #${t.number}`,
    t.accountName ? `Account: ${t.accountName}` : "",
    t.subject ? `Subject: ${t.subject}` : "",
    t.description ? `Description: ${t.description}` : "",
    ...(t.notes ?? []).map((n) => `${n.author ?? "Note"}: ${n.body}`),
  ];
  return lines.filter(Boolean).join("\n");
}

function workText(t: TicketContext): string {
  return [
    t.issueText ? `Issue worked: ${t.issueText}` : "",
    t.changesText ? `Changes made: ${t.changesText}` : "",
    t.resultStatus ? `Result: ${t.resultStatus}` : "",
    t.resultNotes ? `Result notes: ${t.resultNotes}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

async function logAi(context: { userId: string; claims: unknown }, surface: string, num: string) {
  await logTicketAccess({
    userId: context.userId,
    email: emailFromClaims(context.claims),
    action: "ai",
    ticketNumber: num,
    query: `ai:${surface}`,
  });
}

/** Summarize the Freshdesk thread into a few tight bullets. */
export const aiSummarizeTicket = createServerFn({ method: "POST" })
  .middleware([requireActiveAuthorizedUser])
  .inputValidator((input: unknown) => TicketContextSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { aiComplete } = await import("./ai-client.server");
    await logAi(context, "ticket-summary", data.number);
    const res = await aiComplete({
      system: [
        "You are a concise support-ops analyst. Summarize the ticket thread for a night-shift operator.",
        "Use 3-6 short bullets. State the current ask, what's blocking, and who owes the next step.",
        "Use ONLY the provided text. Do not invent facts.",
        data.style ?? "",
      ]
        .filter(Boolean)
        .join("\n"),
      prompt: threadText(data),
      tier: "balanced",
    });
    return res;
  });

/** Draft an editable work note from the operator's session context. */
export const aiDraftNote = createServerFn({ method: "POST" })
  .middleware([requireActiveAuthorizedUser])
  .inputValidator((input: unknown) => TicketContextSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { aiComplete } = await import("./ai-client.server");
    await logAi(context, "ticket-draft-note", data.number);
    const res = await aiComplete({
      system: [
        "You draft internal work notes for a support/programming operator (initials LTP).",
        "Write a clear, postable note describing the issue, the changes made, and the result.",
        "Plain text, no preamble. Base it ONLY on the provided context.",
        data.style ?? "",
      ]
        .filter(Boolean)
        .join("\n"),
      prompt: `${threadText(data)}\n\n${workText(data)}`,
      tier: "balanced",
    });
    return res;
  });

/**
 * Intel Copilot: answer a natural-language question using ONLY a bounded
 * snapshot of the operator's Hub data that the client assembles and sends.
 */
export const aiCopilot = createServerFn({ method: "POST" })
  .middleware([requireActiveAuthorizedUser])
  .inputValidator((input: unknown) =>
    z.object({ question: z.string().min(1).max(600), snapshot: z.string().max(8000) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { aiComplete } = await import("./ai-client.server");
    await logAi(context, "copilot", "");
    return aiComplete({
      system: [
        "You are Intel Copilot for a night-shift support/programming operator.",
        "Answer using ONLY the provided Hub snapshot. If the answer isn't in it, say so.",
        "Be concise and specific. Reference ticket numbers and accounts where relevant.",
      ].join("\n"),
      prompt: `Question: ${data.question}\n\nHub snapshot:\n${data.snapshot}`,
      tier: "balanced",
    });
  });

/** Draft an end-of-shift narrative from a bounded, client-assembled shift snapshot. */
export const aiShiftSummary = createServerFn({ method: "POST" })
  .middleware([requireActiveAuthorizedUser])
  .inputValidator((input: unknown) =>
    z
      .object({ snapshot: z.string().max(8000), style: z.string().max(600).optional() })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { aiComplete } = await import("./ai-client.server");
    await logAi(context, "shift-summary", "");
    return aiComplete({
      system: [
        "Draft a concise end-of-shift summary for a night-shift support/programming operator.",
        "Cover: tickets completed (by theme), items still open or waiting, dispatches, and night-plan progress.",
        "Use ONLY the provided snapshot. A short narrative plus a few bullets. No preamble.",
        data.style ?? "",
      ]
        .filter(Boolean)
        .join("\n"),
      prompt: data.snapshot,
      tier: "balanced",
    });
  });

/**
 * On-demand "what should I focus on?" — reasons over the operator's recent
 * movements + a bounded Hub snapshot to suggest the next best action and why.
 */
export const aiFocus = createServerFn({ method: "POST" })
  .middleware([requireActiveAuthorizedUser])
  .inputValidator((input: unknown) =>
    z
      .object({
        activity: z.string().max(3000),
        snapshot: z.string().max(6000),
        insights: z.string().max(2000).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { aiComplete } = await import("./ai-client.server");
    await logAi(context, "focus", "");
    return aiComplete({
      system: [
        "You are Intel Copilot's focus advisor for a night-shift support/programming operator.",
        "Given their recent movements, current Hub state, and detected signals, recommend the",
        "next 1-3 concrete actions and briefly why. Prioritize overdue/at-risk work and unblocking.",
        "Use ONLY the provided data. Be short and directive.",
      ].join("\n"),
      prompt: [
        data.insights ? `SIGNALS:\n${data.insights}` : "",
        `RECENT MOVEMENTS:\n${data.activity}`,
        `HUB SNAPSHOT:\n${data.snapshot}`,
      ]
        .filter(Boolean)
        .join("\n\n"),
      tier: "flagship",
    });
  });

/** Account intelligence: synthesize recurring issues + typical fixes from past tickets. */
export const aiAccountIntel = createServerFn({ method: "POST" })
  .middleware([requireActiveAuthorizedUser])
  .inputValidator((input: unknown) =>
    z
      .object({
        accountNumber: z.string().max(50),
        accountName: z.string().max(200).optional(),
        tickets: z
          .array(
            z.object({
              number: z.string().max(20),
              subject: z.string().max(400).optional(),
              classification: z.string().max(40).optional(),
              summary: z.string().max(1000).optional(),
            }),
          )
          .max(60),
        style: z.string().max(600).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { aiComplete } = await import("./ai-client.server");
    await logAi(context, "account-intel", data.accountNumber);
    const body = data.tickets
      .map((t) =>
        `#${t.number} [${t.classification ?? "?"}] ${t.subject ?? ""} ${t.summary ?? ""}`.trim(),
      )
      .join("\n");
    return aiComplete({
      system: [
        `Synthesize the recurring issues and typical fixes for account ${data.accountNumber} (${data.accountName ?? ""}).`,
        "Group by theme, note how often each recurs, and what usually resolves it.",
        "Use ONLY the provided ticket history. Keep it tight — a few grouped bullets.",
        data.style ?? "",
      ]
        .filter(Boolean)
        .join("\n"),
      prompt: body || "No ticket history provided.",
      tier: "balanced",
    });
  });

/** Suggest an issue classification and next action (structured). */
export const aiClassifyTicket = createServerFn({ method: "POST" })
  .middleware([requireActiveAuthorizedUser])
  .inputValidator((input: unknown) => TicketContextSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { aiComplete } = await import("./ai-client.server");
    await logAi(context, "ticket-classify", data.number);
    const res = await aiComplete({
      json: true,
      system: [
        "Classify the ticket for a support/programming team.",
        'Return JSON: { "classification": "Scripting Issue" | "Client Change" | "Other", "nextAction": "...", "owner": "...", "reason": "..." }.',
        "Base it ONLY on the provided text.",
      ].join("\n"),
      prompt: `${threadText(data)}\n\n${workText(data)}`,
      tier: "fast",
    });
    if (!res.ok) return { ok: false as const, error: res.error };
    try {
      const parsed = JSON.parse(res.text ?? "{}") as {
        classification?: string;
        nextAction?: string;
        owner?: string;
        reason?: string;
      };
      return { ok: true as const, suggestion: parsed };
    } catch {
      return { ok: false as const, error: "Could not parse AI response." };
    }
  });

/**
 * Organize a Knowledge Vault note without changing its original text.
 * The client stores the generated HTML in separate AI-only columns and
 * sanitizes it before display/editing.
 */
const KnowledgeNoteOrganizeInput = z.object({
  title: z.string().trim().min(1).max(200),
  noteType: z.enum(["work-note", "training", "prompt", "procedure", "reference"]),
  sourceText: z.string().trim().min(1).max(30000),
  style: z.string().max(600).optional(),
});

export const aiOrganizeKnowledgeNote = createServerFn({ method: "POST" })
  .middleware([requireActiveAuthorizedUser])
  .inputValidator((input: unknown) => KnowledgeNoteOrganizeInput.parse(input))
  .handler(async ({ data, context }) => {
    const { aiComplete } = await import("./ai-client.server");
    await logAi(context, "knowledge-organize", "");

    const formatGuidance: Record<typeof data.noteType, string> = {
      "work-note":
        "Use: Overview, Key details, Actions or next steps, and Warnings only when supported.",
      training:
        "Use: Objective, Key concepts, Step-by-step guidance, Examples, and Verification or tips.",
      prompt:
        "Use: Purpose, Reusable prompt, Variables to customize, and Usage notes.",
      procedure:
        "Use: Purpose, Prerequisites, Numbered steps, Warnings, and Verification.",
      reference:
        "Use: Summary, Key facts, Lookup details, and Examples or related notes when supported.",
    };

    const res = await aiComplete({
      json: true,
      system: [
        "You organize rough operational notes into a clear, highly readable reference.",
        "Preserve every factual detail from the source. Never invent, guess, or silently remove",
        "account numbers, names, IDs, field names, expressions, warnings, exceptions, or steps.",
        formatGuidance[data.noteType],
        "Return strict JSON only: { \"html\": \"...\" }.",
        "The html value may use only: h2, h3, p, ul, ol, li, strong, em, blockquote, code, pre, br.",
        "Do not include html/body wrappers, CSS, styles, classes, links, images, scripts, or a preamble.",
        "Use concise headings and short paragraphs. If the source is uncertain, label it clearly",
        "instead of resolving the uncertainty yourself.",
        data.style ?? "",
      ]
        .filter(Boolean)
        .join("\n"),
      prompt: [
        `Title: ${data.title}`,
        `Knowledge type: ${data.noteType}`,
        "",
        "ORIGINAL NOTE:",
        data.sourceText,
      ].join("\n"),
      tier: "balanced",
    });

    if (!res.ok) return { ok: false as const, error: res.error };
    try {
      const parsed = JSON.parse(res.text ?? "{}") as { html?: unknown };
      if (typeof parsed.html !== "string" || !parsed.html.trim()) {
        return { ok: false as const, error: "AI returned an empty organized note." };
      }
      if (parsed.html.length > 250000) {
        return { ok: false as const, error: "AI organized note was too large to save." };
      }
      return { ok: true as const, html: parsed.html.trim() };
    } catch {
      return { ok: false as const, error: "Could not parse the organized note." };
    }
  });

/**
 * Parse a Freshdesk ticket description into the fixed "Ticket Issue" template.
 * Never invents values — missing fields come back as empty strings and the
 * client formatter renders them as "Not provided."
 */
const ParseIssueInput = z.object({
  number: z.string().max(20),
  subject: z.string().max(400).optional(),
  description: z.string().max(12000),
});
export type ParsedTicketIssue = {
  issue?: string;
  background?: string;
  requestedAction?: string;
  specificField?: string;
  category?: string;
  messageTakingOrDispatching?: string;
  f9Issue?: string;
  attached?: {
    msgId?: string;
    callTimestamp?: string;
    messageSummary?: string;
    for?: string;
    caller?: string;
    phone?: string;
    patient?: string;
    message?: string;
  };
};
export const aiParseTicketIssue = createServerFn({ method: "POST" })
  .middleware([requireActiveAuthorizedUser])
  .inputValidator((input: unknown) => ParseIssueInput.parse(input))
  .handler(async ({ data, context }) => {
    const { aiComplete } = await import("./ai-client.server");
    await logAi(context, "ticket-issue-parse", data.number);
    const system = [
      "You parse a Freshdesk ticket for a night-shift support/programming operator.",
      "Return STRICT JSON matching this schema (no prose, no code fences):",
      `{
  "issue": string,
  "background": string,
  "requestedAction": string,
  "specificField": string,
  "category": string,
  "messageTakingOrDispatching": string,
  "f9Issue": string,
  "attached": {
    "msgId": string,
    "callTimestamp": string,
    "messageSummary": string,
    "for": string,
    "caller": string,
    "phone": string,
    "patient": string,
    "message": string
  }
}`,
      "Rules:",
      "- Use ONLY facts present in the ticket text. Do NOT invent values.",
      '- If a value is missing or unclear, return an empty string "" for that field.',
      "- Strip HTML tags/entities before reasoning.",
      "- Preserve account numbers, company names, people names, phone numbers,",
      "  addresses, timestamps, categories, field names, and message IDs verbatim.",
      "- Separate the main ticket issue from any attached phone-message block.",
      "- 'issue' explains the actual problem/request in plain English (1-3 sentences).",
      "- 'background' explains context or why the change is needed (1-3 sentences).",
      "- 'requestedAction' states clearly what should be adjusted/configured/fixed.",
      "- 'attached.message' is the cleaned-up (not paraphrased) message body.",
      "- Every string field MUST be present in the JSON (use \"\" when unknown).",
    ].join("\n");
    const res = await aiComplete({
      json: true,
      system,
      prompt: [
        data.subject ? `Subject: ${data.subject}` : "",
        `Ticket #${data.number}`,
        "",
        "DESCRIPTION:",
        data.description,
      ]
        .filter(Boolean)
        .join("\n"),
      tier: "fast",
    });
    if (!res.ok) return { ok: false as const, error: res.error };
    try {
      const parsed = JSON.parse(res.text ?? "{}") as ParsedTicketIssue;
      return { ok: true as const, parsed };
    } catch {
      return { ok: false as const, error: "Could not parse AI response." };
    }
  });

/**
 * Intel Copilot chat: multi-turn, tool-using. The model pulls exactly the
 * Hub data it needs through read-only tools scoped to the caller, instead of
 * relying on a truncated client snapshot.
 */
const CopilotChatInput = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().min(1).max(6000),
      }),
    )
    .min(1)
    .max(24),
  signals: z.string().max(2000).optional(),
  style: z.string().max(600).optional(),
  nowIso: z.string().max(40).optional(),
});

export const aiCopilotChat = createServerFn({ method: "POST" })
  .middleware([requireActiveAuthorizedUser])
  .inputValidator((input: unknown) => CopilotChatInput.parse(input))
  .handler(async ({ data, context }) => {
    const { aiRespondWithTools } = await import("./ai-client.server");
    const { COPILOT_TOOLS, runCopilotTool } = await import("./copilot-tools.server");
    await logAi(context, "copilot-chat", "");

    const system = [
      "You are Intel Copilot for a night-shift support/programming operator in the Account Intel Hub.",
      "Use the provided read-only tools to look up the operator's real Hub data before answering —",
      "never guess ticket numbers, accounts, statuses, or times.",
      "Call several tools when needed. If a lookup returns nothing, say so plainly.",
      "Be concise and specific: reference ticket numbers and account numbers.",
      "Use short markdown (bold labels, bullets). No preamble.",
      data.nowIso ? `Current time (ISO): ${data.nowIso}.` : "",
      data.signals ? `Detected signals from the Hub:\n${data.signals}` : "",
      data.style ?? "",
    ]
      .filter(Boolean)
      .join("\n");

    const input = data.messages.map((m) =>
      m.role === "user"
        ? { role: "user", content: [{ type: "input_text", text: m.content }] }
        : { role: "assistant", content: [{ type: "output_text", text: m.content }] },
    );

    const res = await aiRespondWithTools({
      system,
      input,
      tools: COPILOT_TOOLS,
      tier: "flagship",
      runTool: (name, args) => runCopilotTool(context.supabase, context.userId, name, args),
    });

    return res;
  });
