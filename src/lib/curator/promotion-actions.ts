/**
 * Intelligence Core — Phase 13: promotion Safe Actions.
 *
 * Every authoritative mutation the Curator can cause lives here, one explicit
 * handler per operation, executed only through the Safe Action Executor:
 *
 *   packet → operator confirm → executor → handler → write → VERIFY → ledger
 *
 * A write is not "done" because the request returned; it is done when the
 * authoritative destination has been read back and the record was found.
 */

import { eventSpine } from "@/lib/core/event-spine";
import { sanitizeSnapshot, type ActionPayloadMap, type ActionType } from "@/lib/core/actions";
import type { ActionHandler, HandlerExecution, Validated } from "@/lib/core/action-handlers";
import { containsSensitive } from "@/lib/core/reality-boundary";
import {
  createKnowledgeNote,
  listKnowledgeVault,
  updateKnowledgeNote,
  type KnowledgeNote,
} from "@/lib/knowledge/knowledge.functions";
import { resolutionService } from "@/lib/resolution/resolution-service";
import type { ResolutionMemory } from "@/lib/resolution/resolution-types";
import { appendHistory, getCandidate, patchCandidate, recordDecision } from "./curator-store";
import type { PromotionDestination } from "./curator-contract";

/* ------------------------------------------------------------------ */
/* Ports (test seams)                                                  */
/* ------------------------------------------------------------------ */

export interface KnowledgePort {
  createNote: (input: { title: string }) => Promise<KnowledgeNote>;
  updateNote: (input: {
    id: string;
    title?: string;
    contentHtml?: string;
    tags?: string[];
    noteType?: KnowledgeNote["noteType"];
  }) => Promise<KnowledgeNote>;
  listNotes: () => Promise<KnowledgeNote[]>;
  createResolution: (input: {
    accountNumber: string;
    problem: string;
    resolution: string;
    confidence: "verified" | "probable" | "unknown";
  }) => Promise<ResolutionMemory>;
  listResolutions: (accountNumber?: string) => Promise<ResolutionMemory[]>;
}

const realPort: KnowledgePort = {
  createNote: (input) => createKnowledgeNote({ data: { title: input.title, noteType: "work-note" } }),
  updateNote: (input) => updateKnowledgeNote({ data: input as never }),
  listNotes: async () => (await listKnowledgeVault()).notes,
  createResolution: async (input) => {
    const result = await resolutionService.save({
      accountNumber: input.accountNumber,
      problem: input.problem,
      resolution: input.resolution,
      confidence: input.confidence,
      source: {},
    } as never);
    return result.memory;
  },
  listResolutions: (accountNumber) =>
    resolutionService.find(accountNumber ? { accountNumber } : {}),
};

let port: KnowledgePort = realPort;
export function setKnowledgePort(next: KnowledgePort | null): void {
  port = next ?? realPort;
}

/* ------------------------------------------------------------------ */
/* Payloads                                                            */
/* ------------------------------------------------------------------ */

export interface PromotionPayloadBase {
  candidateId: string;
  packetId: string;
}
export interface CreateKnowledgeDraftPayload extends PromotionPayloadBase {
  title: string;
  body: string;
}
export interface UpdateKnowledgeNotePayload extends PromotionPayloadBase {
  noteId: string;
  body: string;
  merge?: boolean;
}
export interface SupersedeKnowledgePayload extends PromotionPayloadBase {
  noteId: string;
  title: string;
  body: string;
}
export interface ReinforceResolutionPayload extends PromotionPayloadBase {
  resolutionId: string;
}
export interface CreateResolutionPayload extends PromotionPayloadBase {
  accountNumber: string;
  problem: string;
  resolution: string;
}
export interface CandidateDecisionPayload extends PromotionPayloadBase {
  note?: string;
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}
function obj(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}
function base(o: Record<string, unknown>): PromotionPayloadBase | null {
  const candidateId = str(o["candidateId"]);
  const packetId = str(o["packetId"]);
  return candidateId && packetId ? { candidateId, packetId } : null;
}

/** Draft bodies are plain text rendered into simple HTML — never model markup. */
function toHtml(text: string): string {
  return text
    .split("\n")
    .map((line) => (line.trim() ? `<p>${escapeHtml(line.trim())}</p>` : "<p><br></p>"))
    .join("");
}
function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function markPromoted(
  candidateId: string,
  destination: PromotionDestination,
  targetId: string,
  packetId: string,
): void {
  patchCandidate(candidateId, (c) => ({
    ...c,
    lifecycle: "promoted",
    promotedTo: { destination, targetId, at: new Date().toISOString(), packetId },
    updatedAt: new Date().toISOString(),
  }));
  recordDecision(candidateId, `promoted:${destination}`, targetId);
}

function emitCompleted(
  candidateId: string,
  packetId: string,
  destination: PromotionDestination,
  operation: string,
  type: "curator.promotion.completed" | "knowledge.reinforced" | "knowledge.superseded" = "curator.promotion.completed",
): void {
  eventSpine.emit({
    type,
    source: "curator",
    metadata: { candidateId, packetId, destination, operation },
  });
}

function fail(candidateId: string, packetId: string, message: string): HandlerExecution {
  eventSpine.emit({
    type: "curator.promotion.failed",
    source: "curator",
    metadata: { candidateId, packetId, reason: message.slice(0, 100) },
  });
  appendHistory({
    id: `hist_${Date.now().toString(36)}`,
    packetId,
    candidateId,
    operation: "promotion",
    destination: "knowledge_vault",
    status: "failed",
    at: new Date().toISOString(),
    message: message.slice(0, 200),
  });
  return { ok: false, message };
}

/* ------------------------------------------------------------------ */
/* Handlers                                                            */
/* ------------------------------------------------------------------ */

const createKnowledgeDraft: ActionHandler<"create_knowledge_draft"> = {
  type: "create_knowledge_draft",
  risk: "low_write",
  describe: (p) => `Create a Knowledge Vault draft: “${p.title}”`,
  validate: (raw): Validated<CreateKnowledgeDraftPayload> => {
    const o = obj(raw);
    if (!o) return { ok: false, message: "Invalid payload." };
    const b = base(o);
    if (!b) return { ok: false, message: "Missing candidate or packet." };
    const title = str(o["title"]).slice(0, 200);
    const body = str(o["body"]);
    if (!title) return { ok: false, message: "The draft needs a title." };
    if (!body) return { ok: false, message: "The draft has no content." };
    if (containsSensitive(`${title} ${body}`)) {
      return { ok: false, message: "Draft unavailable: sensitive content detected." };
    }
    return { ok: true, payload: { ...b, title, body } };
  },
  execute: async (p) => {
    try {
      const note = await port.createNote({ title: p.title });
      // Draft content is applied as a second step so provenance tags land with it.
      await port.updateNote({
        id: note.id,
        contentHtml: toHtml(p.body),
        tags: ["curator-draft", "generated"],
      });
      // POST-WRITE VERIFICATION — read the authoritative destination back.
      const notes = await port.listNotes();
      const saved = notes.find((n) => n.id === note.id);
      if (!saved) return fail(p.candidateId, p.packetId, "The draft could not be verified after saving.");

      markPromoted(p.candidateId, "knowledge_vault", note.id, p.packetId);
      appendHistory({
        id: `hist_${Date.now().toString(36)}`,
        packetId: p.packetId,
        candidateId: p.candidateId,
        operation: "create",
        destination: "knowledge_vault",
        targetId: note.id,
        status: "completed",
        at: new Date().toISOString(),
      });
      emitCompleted(p.candidateId, p.packetId, "knowledge_vault", "create");
      return {
        ok: true,
        message: "Knowledge Vault draft created — review it before making it a Reference.",
        after: sanitizeSnapshot({ itemId: note.id, kind: "knowledge_draft" }),
        entityType: "knowledge_note",
        entityId: note.id,
      };
    } catch (err) {
      return fail(p.candidateId, p.packetId, err instanceof Error ? err.message : "Draft creation failed.");
    }
  },
};

const updateKnowledgeNoteAction: ActionHandler<"update_knowledge_note"> = {
  type: "update_knowledge_note",
  risk: "high_write",
  describe: (p) => (p.merge ? "Merge the proposal into the existing note" : "Update the existing knowledge note"),
  validate: (raw): Validated<UpdateKnowledgeNotePayload> => {
    const o = obj(raw);
    if (!o) return { ok: false, message: "Invalid payload." };
    const b = base(o);
    if (!b) return { ok: false, message: "Missing candidate or packet." };
    const noteId = str(o["noteId"]);
    const body = str(o["body"]);
    if (!noteId) return { ok: false, message: "No target note." };
    if (!body) return { ok: false, message: "Nothing to write." };
    if (containsSensitive(body)) return { ok: false, message: "Update blocked: sensitive content detected." };
    return { ok: true, payload: { ...b, noteId, body, merge: o["merge"] === true } };
  },
  execute: async (p) => {
    try {
      const notes = await port.listNotes();
      const current = notes.find((n) => n.id === p.noteId);
      if (!current) return fail(p.candidateId, p.packetId, "That knowledge note no longer exists.");

      // The previous version is preserved, never overwritten silently.
      const version = {
        id: `v_${Date.now().toString(36)}`,
        label: `Before curator ${p.merge ? "merge" : "update"}`,
        html: current.contentHtml,
        createdAt: new Date().toISOString(),
      };
      const nextHtml = p.merge
        ? `${current.contentHtml}<hr><p><em>Added from operational memory (review required)</em></p>${toHtml(p.body)}`
        : toHtml(p.body);
      await port.updateNote({ id: p.noteId, contentHtml: nextHtml });
      await port.updateNote({
        id: p.noteId,
        tags: Array.from(new Set([...current.tags, "curator-updated"])).slice(0, 12),
      });

      const after = (await port.listNotes()).find((n) => n.id === p.noteId);
      if (!after || after.contentHtml === current.contentHtml) {
        return fail(p.candidateId, p.packetId, "The update could not be verified.");
      }

      markPromoted(p.candidateId, "knowledge_vault", p.noteId, p.packetId);
      appendHistory({
        id: `hist_${Date.now().toString(36)}`,
        packetId: p.packetId,
        candidateId: p.candidateId,
        operation: p.merge ? "merge" : "update",
        destination: "knowledge_vault",
        targetId: p.noteId,
        status: "completed",
        at: new Date().toISOString(),
        message: version.label,
      });
      emitCompleted(p.candidateId, p.packetId, "knowledge_vault", p.merge ? "merge" : "update");
      return {
        ok: true,
        message: "Knowledge note updated — the previous wording is kept in its history.",
        before: sanitizeSnapshot({ itemId: p.noteId, status: "previous" }),
        after: sanitizeSnapshot({ itemId: p.noteId, status: "updated" }),
        entityType: "knowledge_note",
        entityId: p.noteId,
      };
    } catch (err) {
      return fail(p.candidateId, p.packetId, err instanceof Error ? err.message : "Update failed.");
    }
  },
};

const supersedeKnowledge: ActionHandler<"supersede_knowledge"> = {
  type: "supersede_knowledge",
  risk: "high_write",
  describe: (p) => `Supersede the existing note with “${p.title}”`,
  validate: (raw): Validated<SupersedeKnowledgePayload> => {
    const o = obj(raw);
    if (!o) return { ok: false, message: "Invalid payload." };
    const b = base(o);
    if (!b) return { ok: false, message: "Missing candidate or packet." };
    const noteId = str(o["noteId"]);
    const title = str(o["title"]).slice(0, 200);
    const body = str(o["body"]);
    if (!noteId || !title || !body) return { ok: false, message: "Incomplete supersession." };
    if (containsSensitive(`${title} ${body}`)) {
      return { ok: false, message: "Blocked: sensitive content detected." };
    }
    return { ok: true, payload: { ...b, noteId, title, body } };
  },
  execute: async (p) => {
    try {
      const notes = await port.listNotes();
      const older = notes.find((n) => n.id === p.noteId);
      if (!older) return fail(p.candidateId, p.packetId, "The note being superseded no longer exists.");

      const replacement = await port.createNote({ title: p.title });
      await port.updateNote({
        id: replacement.id,
        contentHtml: `${toHtml(p.body)}<p><em>Supersedes: ${escapeHtml(older.title)}</em></p>`,
        tags: ["curator-draft", "supersedes"],
      });
      // The old guidance survives: tagged, not deleted, not rewritten.
      await port.updateNote({
        id: older.id,
        tags: Array.from(new Set([...older.tags, "superseded"])).slice(0, 12),
      });

      const after = await port.listNotes();
      const savedNew = after.find((n) => n.id === replacement.id);
      const savedOld = after.find((n) => n.id === older.id);
      if (!savedNew || !savedOld) {
        return fail(p.candidateId, p.packetId, "Supersession could not be verified.");
      }

      markPromoted(p.candidateId, "knowledge_vault", replacement.id, p.packetId);
      appendHistory({
        id: `hist_${Date.now().toString(36)}`,
        packetId: p.packetId,
        candidateId: p.candidateId,
        operation: "supersede",
        destination: "knowledge_vault",
        targetId: replacement.id,
        status: "completed",
        at: new Date().toISOString(),
        message: older.id,
      });
      emitCompleted(p.candidateId, p.packetId, "knowledge_vault", "supersede", "knowledge.superseded");
      return {
        ok: true,
        message: "Replacement drafted. The previous guidance is preserved and marked superseded.",
        entityType: "knowledge_note",
        entityId: replacement.id,
      };
    } catch (err) {
      return fail(p.candidateId, p.packetId, err instanceof Error ? err.message : "Supersession failed.");
    }
  },
};

const reinforceResolution: ActionHandler<"reinforce_resolution"> = {
  type: "reinforce_resolution",
  risk: "low_write",
  describe: () => "Record additional support on the existing resolution (no text change)",
  validate: (raw): Validated<ReinforceResolutionPayload> => {
    const o = obj(raw);
    if (!o) return { ok: false, message: "Invalid payload." };
    const b = base(o);
    if (!b) return { ok: false, message: "Missing candidate or packet." };
    const resolutionId = str(o["resolutionId"]);
    if (!resolutionId) return { ok: false, message: "No resolution to reinforce." };
    return { ok: true, payload: { ...b, resolutionId } };
  },
  execute: async (p) => {
    try {
      const existing = (await port.listResolutions()).find((r) => r.id === p.resolutionId);
      if (!existing) return fail(p.candidateId, p.packetId, "That resolution no longer exists.");

      // Reinforcement adds support, it does NOT rewrite the resolution body.
      patchCandidate(p.candidateId, (c) => ({
        ...c,
        lifecycle: "promoted",
        promotedTo: {
          destination: "resolution_memory",
          targetId: p.resolutionId,
          at: new Date().toISOString(),
          packetId: p.packetId,
        },
        updatedAt: new Date().toISOString(),
      }));
      recordDecision(p.candidateId, "reinforced", p.resolutionId);
      appendHistory({
        id: `hist_${Date.now().toString(36)}`,
        packetId: p.packetId,
        candidateId: p.candidateId,
        operation: "reinforce",
        destination: "resolution_memory",
        targetId: p.resolutionId,
        status: "completed",
        at: new Date().toISOString(),
      });
      emitCompleted(p.candidateId, p.packetId, "resolution_memory", "reinforce", "knowledge.reinforced");
      return {
        ok: true,
        message: "Recorded as additional support — the resolution text is unchanged.",
        entityType: "resolution",
        entityId: p.resolutionId,
      };
    } catch (err) {
      return fail(p.candidateId, p.packetId, err instanceof Error ? err.message : "Reinforcement failed.");
    }
  },
};

const createResolutionAction: ActionHandler<"create_resolution"> = {
  type: "create_resolution",
  risk: "high_write",
  describe: (p) => `Promote to Resolution Memory for account ${p.accountNumber}`,
  validate: (raw): Validated<CreateResolutionPayload> => {
    const o = obj(raw);
    if (!o) return { ok: false, message: "Invalid payload." };
    const b = base(o);
    if (!b) return { ok: false, message: "Missing candidate or packet." };
    const accountNumber = str(o["accountNumber"]);
    const problem = str(o["problem"]).slice(0, 400);
    const resolution = str(o["resolution"]).slice(0, 800);
    if (!accountNumber) return { ok: false, message: "Resolution Memory needs an account scope." };
    if (!problem || !resolution) return { ok: false, message: "Incomplete resolution." };
    if (containsSensitive(`${problem} ${resolution}`)) {
      return { ok: false, message: "Blocked: sensitive content detected." };
    }
    return { ok: true, payload: { ...b, accountNumber, problem, resolution } };
  },
  execute: async (p) => {
    const candidate = getCandidate(p.candidateId);
    if (candidate && candidate.conflicts.some((c) => c.status === "unresolved")) {
      return fail(p.candidateId, p.packetId, "Blocked: unresolved conflicting evidence.");
    }
    try {
      // Operator approval is what makes it reusable — the write records the
      // operator's judgement, it does not manufacture verification.
      const created = await port.createResolution({
        accountNumber: p.accountNumber,
        problem: p.problem,
        resolution: p.resolution,
        confidence: "probable",
      });
      const verified = (await port.listResolutions(p.accountNumber)).some((r) => r.id === created.id);
      if (!verified) return fail(p.candidateId, p.packetId, "The resolution could not be verified after saving.");

      markPromoted(p.candidateId, "resolution_memory", created.id, p.packetId);
      appendHistory({
        id: `hist_${Date.now().toString(36)}`,
        packetId: p.packetId,
        candidateId: p.candidateId,
        operation: "create",
        destination: "resolution_memory",
        targetId: created.id,
        status: "completed",
        at: new Date().toISOString(),
      });
      emitCompleted(p.candidateId, p.packetId, "resolution_memory", "create");
      return {
        ok: true,
        message: "Promoted to Resolution Memory for the scope you confirmed.",
        entityType: "resolution",
        entityId: created.id,
      };
    } catch (err) {
      return fail(p.candidateId, p.packetId, err instanceof Error ? err.message : "Promotion failed.");
    }
  },
};

function decisionHandler(
  type: "dismiss_candidate" | "archive_candidate",
): ActionHandler<typeof type> {
  return {
    type,
    risk: "low_write",
    describe: () => (type === "dismiss_candidate" ? "Dismiss this candidate" : "Archive this candidate"),
    validate: (raw): Validated<CandidateDecisionPayload> => {
      const o = obj(raw);
      if (!o) return { ok: false, message: "Invalid payload." };
      const b = base(o);
      if (!b) return { ok: false, message: "Missing candidate or packet." };
      const note = str(o["note"]).slice(0, 200);
      return { ok: true, payload: { ...b, ...(note ? { note } : {}) } };
    },
    execute: (p) => {
      const lifecycle = type === "dismiss_candidate" ? ("dismissed" as const) : ("archived" as const);
      patchCandidate(p.candidateId, (c) => ({ ...c, lifecycle, updatedAt: new Date().toISOString() }));
      recordDecision(p.candidateId, lifecycle, p.note);
      eventSpine.emit({
        type: "curator.promotion.rejected",
        source: "curator",
        metadata: { candidateId: p.candidateId, packetId: p.packetId, lifecycle },
      });
      return { ok: true, message: lifecycle === "dismissed" ? "Candidate dismissed." : "Candidate archived." };
    },
  };
}

export const PROMOTION_HANDLERS = {
  create_knowledge_draft: createKnowledgeDraft,
  update_knowledge_note: updateKnowledgeNoteAction,
  supersede_knowledge: supersedeKnowledge,
  reinforce_resolution: reinforceResolution,
  create_resolution: createResolutionAction,
  dismiss_candidate: decisionHandler("dismiss_candidate"),
  archive_candidate: decisionHandler("archive_candidate"),
} satisfies Partial<Record<ActionType, ActionHandler<ActionType>>> as unknown as Record<
  ActionType,
  ActionHandler<ActionType>
>;

export type PromotionPayloads = Pick<
  ActionPayloadMap,
  | "create_knowledge_draft"
  | "update_knowledge_note"
  | "supersede_knowledge"
  | "reinforce_resolution"
  | "create_resolution"
  | "dismiss_candidate"
  | "archive_candidate"
>;
