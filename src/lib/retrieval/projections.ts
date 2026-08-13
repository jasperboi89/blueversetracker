/**
 * Per-source retrieval projections.
 *
 * These are the ONLY way a record becomes an indexed document. Arbitrary
 * objects can never be embedded: each projection picks named, bounded fields
 * and runs them through the same privacy scrub used everywhere else in the
 * Intelligence Core.
 */
import type { ResolutionMemory } from "@/lib/resolution/resolution-types";
import type { AccountChangeRecord } from "@/lib/changes/changes.functions";
import type { KnowledgeNote } from "@/lib/knowledge/knowledge.functions";
import type { RetrievalDocumentInput } from "./retrieval-types";
import { approveSemanticText } from "./semantic-guard";

const SEMANTIC_MAX = 1500;
const LEXICAL_MAX = 4000;
export const KNOWLEDGE_CHUNK_SIZE = 1200;
export const KNOWLEDGE_CHUNK_OVERLAP = 150;

/** Deterministic 64-bit-ish content hash (same family as resolutionFingerprint). */
export function contentHash(...parts: string[]): string {
  const norm = parts.join("\u0001").trim().toLowerCase().replace(/\s+/g, " ");
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < norm.length; i += 1) {
    const c = norm.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 16777619) >>> 0;
    h2 = Math.imul(h2 + c + i, 2246822519) >>> 0;
  }
  return `${h1.toString(36)}${h2.toString(36)}`;
}

export function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/[ \t]+/g, " ")
    .trim();
}

const EMAIL_RE = /[\w.+-]+@[\w-]+\.[\w.-]+/g;
const PHONE_RE = /(\+?\d[\d().-]{7,}\d)/g;
/** Conversation / message markers: their presence means raw thread content. */
const CONVERSATION_RE =
  /^\s*(from|to|cc|bcc|sent|subject|caller|patient|on .* wrote|>)\s*:/gim;

/**
 * Scrub + bound text before it can ever reach an embedding provider.
 * Emails, phone numbers and quoted message headers are removed rather than
 * "trusted to be harmless once vectorized".
 */
export function safeSemanticText(parts: Array<string | undefined>): string {
  const joined = parts
    .map((p) => (p ?? "").trim())
    .filter(Boolean)
    .join("\n");
  return joined
    .replace(EMAIL_RE, " ")
    .replace(PHONE_RE, " ")
    .replace(CONVERSATION_RE, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, SEMANTIC_MAX);
}

function lexical(parts: Array<string | undefined>): string {
  return parts
    .map((p) => (p ?? "").trim())
    .filter(Boolean)
    .join(" \u2014 ")
    .replace(/\s+/g, " ")
    .slice(0, LEXICAL_MAX);
}

/* ------------------------------------------------------------------ */
/* Resolution Memory — the strongest semantic source                   */
/* ------------------------------------------------------------------ */

export function resolutionToRetrievalDocument(m: ResolutionMemory): RetrievalDocumentInput {
  const semanticText = safeSemanticText([
    m.problem,
    m.rootCause,
    m.resolution,
    m.testing,
    m.affectedArea,
  ]);
  const lexicalText = lexical([
    m.problem,
    m.rootCause,
    m.resolution,
    m.testing,
    m.affectedArea,
    m.accountNumber,
    m.accountName,
    m.source.ticketId,
  ]);
  return {
    sourceType: "resolution",
    sourceId: m.id,
    chunkId: "",
    accountNumber: m.accountNumber,
    title: m.problem.slice(0, 200),
    lexicalText,
    semanticText,
    semanticApproval: approveSemanticText("resolution", semanticText),
    sourceStatus: m.status,
    confidence: m.confidence,
    ...(m.createdAt ? { sourceCreatedAt: m.createdAt } : {}),
    ...(m.updatedAt ? { sourceUpdatedAt: m.updatedAt } : {}),
    contentHash: contentHash(semanticText, m.status, m.confidence),
  };
}

/* ------------------------------------------------------------------ */
/* Change Records — concise structured fields only                     */
/* ------------------------------------------------------------------ */

export function changeRecordToRetrievalDocument(
  c: AccountChangeRecord,
): RetrievalDocumentInput {
  // Deliberately excluded: beforeText / afterText / notes / requester.
  // Those are unrestricted operational blobs and never enter the index.
  const semanticText = safeSemanticText([c.title, c.changeType, c.rollbackNote]);
  const lexicalText = lexical([
    c.title,
    c.changeType,
    c.risk,
    c.status,
    c.accountNumber,
    c.accountName,
    c.ticketNumber ? `ticket ${c.ticketNumber}` : "",
  ]);
  return {
    sourceType: "change_record",
    sourceId: c.id,
    chunkId: "",
    accountNumber: c.accountNumber,
    title: c.title.slice(0, 200),
    lexicalText,
    semanticText,
    semanticApproval: approveSemanticText("change_record", semanticText),
    sourceStatus: c.status,
    confidence: c.status === "verified" ? "verified" : "unknown",
    ...(c.createdAt ? { sourceCreatedAt: c.createdAt } : {}),
    ...(c.updatedAt ? { sourceUpdatedAt: c.updatedAt } : {}),
    contentHash: contentHash(semanticText, c.status),
  };
}

/* ------------------------------------------------------------------ */
/* Knowledge Vault — bounded chunks, references not duplicates          */
/* ------------------------------------------------------------------ */

/** Note types whose content is already intended for operational search. */
const SEMANTIC_NOTE_TYPES = new Set(["procedure", "reference", "training"]);

export function chunkText(text: string, size = KNOWLEDGE_CHUNK_SIZE): string[] {
  const clean = text.trim();
  if (clean.length <= size) return clean ? [clean] : [];
  const chunks: string[] = [];
  let at = 0;
  while (at < clean.length) {
    chunks.push(clean.slice(at, at + size));
    at += size - KNOWLEDGE_CHUNK_OVERLAP;
    if (chunks.length >= 12) break;
  }
  return chunks;
}

export function knowledgeToRetrievalDocuments(
  note: KnowledgeNote,
): RetrievalDocumentInput[] {
  if (note.isArchived) return [];
  const body = stripHtml(note.contentHtml);
  const chunks = chunkText(body);
  const semanticAllowed = SEMANTIC_NOTE_TYPES.has(note.noteType);
  const sourceType = note.noteType === "procedure" ? "runbook" : "knowledge";
  if (chunks.length === 0) return [];
  return chunks.map((chunk, i) => {
    const semanticText = semanticAllowed ? safeSemanticText([note.title, chunk]) : "";
    return {
      sourceType,
      sourceId: note.id,
      chunkId: chunks.length > 1 ? `c${i}` : "",
      accountNumber: "",
      title: note.title.slice(0, 200),
      lexicalText: lexical([note.title, note.tags.join(" "), chunk]),
      semanticText,
      ...(semanticText ? { semanticApproval: approveSemanticText("knowledge_note", semanticText) } : {}),
      sourceStatus: note.isArchived ? "archived" : "active",
      confidence: "" as const,
      ...(note.createdAt ? { sourceCreatedAt: note.createdAt } : {}),
      ...(note.updatedAt ? { sourceUpdatedAt: note.updatedAt } : {}),
      contentHash: contentHash(note.title, chunk, String(i)),
    };
  });
}

/* ------------------------------------------------------------------ */
/* Freshdesk tickets — lexical reference only                          */
/* ------------------------------------------------------------------ */

export interface SafeTicketProjectionInput {
  ticketNumber: string;
  subject: string;
  accountNumber?: string;
  accountName?: string;
  classification?: string;
  status?: string;
  updatedAt?: string;
}

/**
 * Freshdesk stays lexical-only in Phase 7: no conversations, bodies, notes,
 * caller or patient details are projected, and semanticText is always empty
 * so nothing here can reach an embedding provider.
 */
export function ticketToSafeRetrievalDocument(
  t: SafeTicketProjectionInput,
): RetrievalDocumentInput {
  const lexicalText = lexical([
    t.subject,
    t.classification,
    t.accountNumber,
    t.accountName,
    `ticket ${t.ticketNumber}`,
  ]);
  return {
    sourceType: "freshdesk_ticket",
    sourceId: t.ticketNumber,
    chunkId: "",
    accountNumber: t.accountNumber ?? "",
    title: (t.subject || `Ticket ${t.ticketNumber}`).slice(0, 200),
    lexicalText,
    semanticText: "",
    sourceStatus: t.status ?? "active",
    confidence: "" as const,
    ...(t.updatedAt ? { sourceUpdatedAt: t.updatedAt } : {}),
    contentHash: contentHash(lexicalText),
  };
}
