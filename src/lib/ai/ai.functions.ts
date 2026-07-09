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
    });
    return res;
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
