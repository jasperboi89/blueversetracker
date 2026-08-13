/**
 * Semantic input boundary.
 *
 * Only text produced by an explicitly approved projection function may reach
 * the embedding provider for DOCUMENT INDEXING. Callers cannot hand arbitrary
 * strings (Freshdesk bodies, conversations, AI prompts/responses, raw account
 * instructions, client input) to the index: unapproved semantic text is
 * rejected at this boundary before any vector is ever produced.
 *
 * Scrubbing in projections.ts remains defense-in-depth, not the guarantee.
 *
 * NOTE: user search QUERY embeddings are a separate path (searchKnowledge)
 * and are never persisted into the retrieval index.
 */
import type { RetrievalSourceType } from "./retrieval-types";

/** Projections allowed to contribute embedded text. Freshdesk is absent by design. */
export const APPROVED_SEMANTIC_PROJECTIONS = [
  "resolution",
  "change_record",
  "knowledge_note",
] as const;
export type ApprovedSemanticProjection = (typeof APPROVED_SEMANTIC_PROJECTIONS)[number];

/** Source types that may ever carry semantic text into the index. */
export const SEMANTIC_ALLOWED_SOURCE_TYPES: readonly RetrievalSourceType[] = [
  "resolution",
  "change_record",
  "knowledge",
  "runbook",
];

const APPROVAL = Symbol("lovable.retrieval.approved-semantic-text");

export interface ApprovedSemanticText {
  readonly [APPROVAL]: true;
  readonly projection: ApprovedSemanticProjection;
  readonly text: string;
}

export class SemanticBoundaryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SemanticBoundaryError";
  }
}

/** Called only from projections.ts. Stamps text as embeddable. */
export function approveSemanticText(
  projection: ApprovedSemanticProjection,
  text: string,
): ApprovedSemanticText {
  return { [APPROVAL]: true, projection, text };
}

export function isApprovedSemanticText(value: unknown): value is ApprovedSemanticText {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as Record<symbol, unknown>)[APPROVAL] === true
  );
}

/**
 * Resolve the semantic text that may be persisted for a document.
 * Returns "" for lexical-only documents; throws when a caller tries to sneak
 * unapproved text through document indexing.
 */
export function resolveSemanticText(doc: {
  sourceType: RetrievalSourceType;
  sourceId: string;
  semanticText: string;
  semanticApproval?: ApprovedSemanticText | undefined;
}): string {
  const text = (doc.semanticText ?? "").trim();
  if (!text) return "";

  if (!SEMANTIC_ALLOWED_SOURCE_TYPES.includes(doc.sourceType)) {
    throw new SemanticBoundaryError(
      `Semantic indexing is not permitted for source type "${doc.sourceType}".`,
    );
  }
  const approval = doc.semanticApproval;
  if (!isApprovedSemanticText(approval)) {
    throw new SemanticBoundaryError(
      `Semantic text for ${doc.sourceType}:${doc.sourceId} did not come from an approved projection.`,
    );
  }
  if (!APPROVED_SEMANTIC_PROJECTIONS.includes(approval.projection)) {
    throw new SemanticBoundaryError(`Unknown semantic projection "${approval.projection}".`);
  }
  if (approval.text !== doc.semanticText) {
    throw new SemanticBoundaryError(
      `Semantic text for ${doc.sourceType}:${doc.sourceId} was modified after projection.`,
    );
  }
  return text;
}
