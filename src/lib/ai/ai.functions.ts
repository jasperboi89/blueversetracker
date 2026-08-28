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
      task: "summary",
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
      task: "summary",
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
      task: "operational_question",
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
      // TECH DEBT: `handoff_generation` is now a generic internal summary task
      // type used by all shift-recap / briefing summarization. The Shift Handoff
      // product feature was removed (Command Center Phase 1); the routing label
      // is intentionally kept to avoid breaking unrelated summarization routing.
      // Rename to `summary_generation` in a later phase — see
      // docs/OPERATIONAL_INTELLIGENCE_EVOLUTION.md.
      task: "handoff_generation",
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
      task: "pattern_analysis",
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
      task: "summary",
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
      task: "classification",
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
      task: "structured_generation",
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
      task: "extraction",
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
      task: "ticket_investigation",
      runTool: (name, args) => runCopilotTool(context.supabase, context.userId, name, args),
    });

    return res;
  });

/**
 * Proactive briefings. The model pulls its own Hub data with the same
 * read-only Copilot tools, so briefings reflect live tickets, plan items,
 * dispatches and work time rather than a client snapshot.
 */
const BriefingInput = z.object({
  kind: z.enum(["shift-start", "shift-end", "weekly-digest"]),
  signals: z.string().max(2000).optional(),
  style: z.string().max(600).optional(),
  nowIso: z.string().max(40).optional(),
});

const BRIEFING_GOAL: Record<z.infer<typeof BriefingInput>["kind"], string> = {
  "shift-start":
    "Write a SHIFT-START BRIEFING. Look up open/overdue tickets, waiting items, the night plan (including rolled-over items) and what was completed on the last shift. Output: one short orienting paragraph, then a bulleted 'Start here' list of at most 5 concrete next actions in priority order.",
  "shift-end":
    "Write an END-OF-SHIFT SUMMARY, copy-ready. Look up what was completed this shift, what is still open or waiting and on whom, night plan items not finished, and logged work time. Output sections: **Completed**, **Still open / waiting**, **Watch outs**, **Follow ups**. Bullets only, no filler.",
  "weekly-digest":
    "Write a WEEKLY PATTERN DIGEST. Look across tickets and account history for recurring issue clusters. Output: at most 6 bullets, each phrased as 'Account <number> (<name>) keeps hitting <pattern>' with ticket numbers as evidence, then one short 'Suggested follow-ups' list. Only report patterns backed by 2+ tickets.",
};

export const aiBriefing = createServerFn({ method: "POST" })
  .middleware([requireActiveAuthorizedUser])
  .inputValidator((input: unknown) => BriefingInput.parse(input))
  .handler(async ({ data, context }) => {
    const { aiRespondWithTools } = await import("./ai-client.server");
    const { COPILOT_TOOLS, runCopilotTool } = await import("./copilot-tools.server");
    await logAi(context, `briefing-${data.kind}`, "");

    const system = [
      "You are Intel Copilot briefing a night-shift support/programming operator in the Account Intel Hub.",
      "Use the read-only tools to gather the operator's real data before writing. Never invent tickets, accounts, or times.",
      "If a lookup returns nothing, say so plainly instead of padding.",
      "Short markdown only: bold labels and bullets, no preamble, no closing pleasantries.",
      data.nowIso ? `Current time (ISO): ${data.nowIso}.` : "",
      data.signals ? `Detected signals from the Hub:\n${data.signals}` : "",
      data.style ?? "",
    ]
      .filter(Boolean)
      .join("\n");

    return aiRespondWithTools({
      system,
      input: [
        {
          role: "user",
          content: [{ type: "input_text", text: BRIEFING_GOAL[data.kind] }],
        },
      ],
      tools: COPILOT_TOOLS,
      task: "pattern_analysis",
      maxSteps: 8,
      runTool: (name, args) => runCopilotTool(context.supabase, context.userId, name, args),
    });
  });

/**
 * Rolling operator profile. The model reads the operator's own Hub data and
 * writes a short set of durable facts (busiest accounts, recurring issue
 * types, shift rhythm, note style) that every later AI call is primed with.
 */
export const aiOperatorProfile = createServerFn({ method: "POST" })
  .middleware([requireActiveAuthorizedUser])
  .inputValidator(() => ({}))
  .handler(async ({ context }) => {
    const { aiRespondWithTools } = await import("./ai-client.server");
    const { COPILOT_TOOLS, runCopilotTool } = await import("./copilot-tools.server");
    await logAi(context, "operator-profile", "");

    return aiRespondWithTools({
      system: [
        "You build a compact operator profile for a night-shift support/programming operator.",
        "Use the read-only tools to inspect their tickets, accounts, night plan and work time.",
        "Output at most 8 short bullets of durable facts only: most-touched accounts (with numbers),",
        "recurring issue types, typical shift window and rhythm, common ticket classifications,",
        "and anything a assistant should always keep in mind. No advice, no filler, no headings.",
      ].join("\n"),
      input: [
        {
          role: "user",
          content: [{ type: "input_text", text: "Build my operator profile from my Hub data." }],
        },
      ],
      tools: COPILOT_TOOLS,
      task: "summary",
      maxSteps: 6,
      runTool: (name, args) => runCopilotTool(context.supabase, context.userId, name, args),
    });
  });

/**
 * "Polish this note" — tightens the operator's own wording without adding
 * facts. Returns plain text lines; the caller converts to HTML.
 */
export const aiPolishNote = createServerFn({ method: "POST" })
  .middleware([requireActiveAuthorizedUser])
  .inputValidator((d: unknown) =>
    z
      .object({
        text: z.string().min(1).max(8000),
        kind: z.enum(["work-note", "retest", "dispatch", "general"]).default("general"),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { aiComplete } = await import("./ai-client.server");
    await logAi(context, "polish-note", "");

    const res = await aiComplete({
      task: "rewrite",
      system: [
        "You clean up a support operator's internal note before it is pasted into a ticket.",
        "Rules: keep every fact exactly as written; never invent details, causes, or outcomes.",
        "Fix grammar, spelling and spacing. Use short declarative sentences.",
        "Use '- ' bullets when the note lists multiple actions. No headings, no preamble,",
        "no closing pleasantries, no markdown bold. Return only the cleaned note text.",
      ].join(" "),
      prompt: `Note type: ${data.kind}\n\n${data.text}`,
    });
    if (!res.ok) return { ok: false as const, error: res.error };
    return { ok: true as const, text: (res.text ?? "").trim() };
  });

/** Suggest a short, consistent subject line for an Additional Work item. */
export const aiSuggestSubject = createServerFn({ method: "POST" })
  .middleware([requireActiveAuthorizedUser])
  .inputValidator((d: unknown) =>
    z
      .object({
        text: z.string().min(1).max(6000),
        accountName: z.string().max(200).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { aiComplete } = await import("./ai-client.server");
    await logAi(context, "suggest-subject", "");

    const res = await aiComplete({
      task: "extraction",
      system: [
        "You write the subject line for an internal support work item.",
        "Return ONE line, 3-9 words, sentence case, no trailing period, no quotes,",
        "no ticket numbers unless present in the text. Lead with the action",
        "(e.g. 'Update holiday hours script'). Return only the subject.",
      ].join(" "),
      prompt: [data.accountName ? `Account: ${data.accountName}` : "", data.text]
        .filter(Boolean)
        .join("\n\n"),
    });
    if (!res.ok) return { ok: false as const, error: res.error };
    return {
      ok: true as const,
      subject: (res.text ?? "").trim().replace(/^["'\s]+|["'.\s]+$/g, "").slice(0, 120),
    };
  });

/**
 * Programming Status Email — concise work summaries.
 *
 * Takes bounded, already-documented work context for up to 40 items and
 * returns one short Issue / Changes Made / Other Notes summary per item.
 * Detailed records stay in the portal; this is the presentation layer only.
 */
export const aiWorkSummaries = createServerFn({ method: "POST" })
  .middleware([requireActiveAuthorizedUser])
  .inputValidator((d: unknown) =>
    z
      .object({
        items: z
          .array(
            z.object({
              key: z.string().max(120),
              kind: z.enum(["freshdesk", "additional", "dispatch"]),
              title: z.string().max(300),
              context: z.string().max(4000),
            }),
          )
          .min(1)
          .max(40),
        style: z.string().max(600).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { aiComplete } = await import("./ai-client.server");
    await logAi(context, "prog-email-summaries", "");

    const res = await aiComplete({
      task: "summary",
      json: true,
      system: [
        "You write a supervisor-facing programming status email for a night-shift support/programming operator.",
        "For EACH work item, produce a concise summary from ONLY the documented context.",
        "Fields:",
        "- issue: exactly ONE plain-language sentence describing the actual request/problem. Freshdesk items only; use \"\" for additional/dispatch items.",
        "- changes: ONE to TWO short sentences describing what was actually changed, completed, tested, or attempted. Focus on outcome, not steps.",
        "- notes: OPTIONAL single sentence, only when something meaningful remains (awaiting confirmation, further testing needed, unresolved, dependency, partial completion, limitation). Otherwise return \"\".",
        "Rules: never invent work; never claim testing passed unless the context says so; distinguish completed vs tested vs partially completed vs awaiting confirmation vs unresolved.",
        "Do not repeat the issue wording inside changes — the fields must complement each other.",
        "Do not quote customer messages, ticket conversations, or screenshot contents. Preserve account/client names and ticket numbers when relevant. Plain professional language.",
        data.style ?? "",
      ]
        .filter(Boolean)
        .join("\n"),
      prompt: [
        "Return json shaped exactly as: {\"summaries\":[{\"key\":string,\"issue\":string,\"changes\":string,\"notes\":string}]}",
        "One entry per item, keys echoed exactly.",
        "",
        ...data.items.map(
          (i) => `ITEM key=${i.key} kind=${i.kind}\nTitle: ${i.title}\n${i.context}\n---`,
        ),
      ].join("\n"),
    });
    if (!res.ok) return { ok: false as const, error: res.error };

    try {
      const parsed = JSON.parse(res.text ?? "{}") as {
        summaries?: { key?: string; issue?: string; changes?: string; notes?: string }[];
      };
      const summaries = (parsed.summaries ?? [])
        .filter((s) => typeof s.key === "string")
        .map((s) => ({
          key: s.key as string,
          issue: (s.issue ?? "").trim(),
          changes: (s.changes ?? "").trim(),
          notes: (s.notes ?? "").trim(),
        }));
      return { ok: true as const, summaries };
    } catch {
      return { ok: false as const, error: "AI returned malformed summaries." };
    }
  });

/**
 * Phase 4 — contextual script reasoning.
 *
 * Receives ONLY sanitized structural facts (counts, component names, edges,
 * diff/impact summaries) produced by the redaction-first ingestion pipeline.
 * Raw script source is never sent. Autonomy is capped at OBSERVE / EXPLAIN /
 * RECOMMEND / PREPARE — the model may not propose deployment or edits.
 */
const ScriptReasoningInput = z.object({
  title: z.string().trim().max(200).default(""),
  kind: z.string().trim().max(40).default("script"),
  coverage: z.number().min(0).max(1),
  facts: z.string().max(12000),
  question: z.string().trim().max(600).optional(),
});

export const aiScriptReasoning = createServerFn({ method: "POST" })
  .middleware([requireActiveAuthorizedUser])
  .inputValidator((input: unknown) => ScriptReasoningInput.parse(input))
  .handler(async ({ data, context }) => {
    const { aiComplete } = await import("./ai-client.server");
    await logAi(context, "script-reasoning", "");

    const res = await aiComplete({
      task: "analysis",
      json: true,
      system: [
        "You explain the STRUCTURE of an answering-service IS script to the operator who maintains it.",
        "You are given extracted structural facts only — never the script text. Reason strictly from those facts.",
        "Never claim a cause; describe structure, reachability and what changed. Use correlational language.",
        "You may OBSERVE, EXPLAIN, RECOMMEND and PREPARE checks. Never propose editing or deploying a script.",
        data.coverage < 0.6
          ? "Extraction coverage is LOW: state plainly that this reading is partial and may miss constructs."
          : "",
        'Return json shaped exactly as: {"summary":string,"observations":string[],"risks":string[],"checks":string[],"unknowns":string[]}',
        "summary: 1-2 sentences. Each array: at most 5 short entries, [] when nothing is supported by the facts.",
      ]
        .filter(Boolean)
        .join("\n"),
      prompt: [
        `SCRIPT: ${data.title || "(untitled)"} (kind: ${data.kind})`,
        `EXTRACTION COVERAGE: ${Math.round(data.coverage * 100)}%`,
        "",
        "STRUCTURAL FACTS:",
        data.facts,
        data.question ? `\nOPERATOR QUESTION: ${data.question}` : "",
      ].join("\n"),
    });
    if (!res.ok) return { ok: false as const, error: res.error };

    try {
      const parsed = JSON.parse(res.text ?? "{}") as Record<string, unknown>;
      const arr = (v: unknown) =>
        Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").slice(0, 5) : [];
      return {
        ok: true as const,
        reasoning: {
          summary: typeof parsed["summary"] === "string" ? parsed["summary"] : "",
          observations: arr(parsed["observations"]),
          risks: arr(parsed["risks"]),
          checks: arr(parsed["checks"]),
          unknowns: arr(parsed["unknowns"]),
        },
      };
    } catch {
      return { ok: false as const, error: "AI returned malformed script reasoning." };
    }
  });
