/**
 * Phase 13 — promotion action payloads.
 *
 * Kept in their own module so the action contract can reference them without
 * pulling the handler implementations (and their server functions) into every
 * bundle that touches `actions.ts`.
 */

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
