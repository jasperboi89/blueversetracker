/**
 * Resolution Memory — shared contract.
 *
 * A Resolution Memory answers "what problem occurred, why, what solved it,
 * and how do we know" for one piece of completed work. It is deliberately
 * NOT a Change Record (what changed) and NOT a Knowledge Vault article
 * (broader documentation): it is operator-confirmed evidence from real work.
 *
 * Nothing in here is AI-authored. Confidence is an operator judgement.
 */

export const RESOLUTION_CONFIDENCES = ["verified", "probable", "unknown"] as const;
export type ResolutionConfidence = (typeof RESOLUTION_CONFIDENCES)[number];

export const RESOLUTION_STATUSES = ["active", "superseded", "archived"] as const;
export type ResolutionStatus = (typeof RESOLUTION_STATUSES)[number];

export interface ResolutionSourceRefs {
  ticketId?: string;
  ticketNumber?: string;
  changeRecordId?: string;
  workItemId?: string;
  dispatchId?: string;
}

export interface ResolutionMemory {
  id: string;
  accountNumber: string;
  accountName: string;
  problem: string;
  rootCause: string;
  resolution: string;
  testing: string;
  rollback: string;
  affectedArea: string;
  confidence: ResolutionConfidence;
  source: ResolutionSourceRefs;
  status: ResolutionStatus;
  supersedesId?: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Field caps. Enforced client-side for feedback and server-side (plus a
 * database CHECK) as the real boundary — Resolution Memory stores concise
 * operational knowledge, never ticket bodies or conversations.
 */
export const RESOLUTION_LIMITS = {
  problem: 400,
  rootCause: 400,
  resolution: 800,
  testing: 400,
  rollback: 400,
  affectedArea: 80,
  accountNumber: 40,
  accountName: 120,
  sourceId: 64,
} as const;

export const CONFIDENCE_LABEL: Record<ResolutionConfidence, string> = {
  verified: "Verified",
  probable: "Probable",
  unknown: "Unknown",
};

export const CONFIDENCE_HELP: Record<ResolutionConfidence, string> = {
  verified: "You performed the fix and testing supports the result.",
  probable: "Looks right, but it wasn't fully validated.",
  unknown: "Useful to remember, but cause or effectiveness is uncertain.",
};

export interface ResolutionDraft {
  accountNumber?: string;
  accountName?: string;
  problem: string;
  rootCause?: string;
  resolution: string;
  testing?: string;
  rollback?: string;
  affectedArea?: string;
  confidence: ResolutionConfidence;
  source?: ResolutionSourceRefs;
  supersedesId?: string;
}

/** Stable key for one source completion, used for capture-offer dedupe. */
export function resolutionSourceKey(source: ResolutionSourceRefs | undefined): string {
  if (!source) return "";
  return [
    source.ticketId ?? "",
    source.changeRecordId ?? "",
    source.workItemId ?? "",
    source.dispatchId ?? "",
  ].join("|");
}

/**
 * Content fingerprint for duplicate protection. Deterministic, order-stable,
 * and derived only from the normalized problem + resolution text.
 */
export function resolutionFingerprint(problem: string, resolution: string): string {
  const norm = `${problem.trim().toLowerCase().replace(/\s+/g, " ")}::${resolution
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")}`;
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < norm.length; i += 1) {
    const c = norm.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 16777619) >>> 0;
    h2 = Math.imul(h2 + c + i, 2246822519) >>> 0;
  }
  return `${h1.toString(36)}${h2.toString(36)}`;
}

const CONFIDENCE_RANK: Record<ResolutionConfidence, number> = {
  verified: 0,
  probable: 1,
  unknown: 2,
};
const STATUS_RANK: Record<ResolutionStatus, number> = {
  active: 0,
  superseded: 1,
  archived: 2,
};

/**
 * Deterministic ranking: same account first, then active before superseded,
 * verified before probable, then most recently updated.
 */
export function rankResolutions(
  rows: ResolutionMemory[],
  opts: { accountNumber?: string } = {},
): ResolutionMemory[] {
  const acct = opts.accountNumber?.trim();
  return rows.slice().sort((a, b) => {
    if (acct) {
      const am = a.accountNumber === acct ? 0 : 1;
      const bm = b.accountNumber === acct ? 0 : 1;
      if (am !== bm) return am - bm;
    }
    const st = STATUS_RANK[a.status] - STATUS_RANK[b.status];
    if (st !== 0) return st;
    const cf = CONFIDENCE_RANK[a.confidence] - CONFIDENCE_RANK[b.confidence];
    if (cf !== 0) return cf;
    return b.updatedAt.localeCompare(a.updatedAt);
  });
}

/** Short, safe one-line summary for context packs and list rows. */
export function summarizeResolution(memory: ResolutionMemory, max = 140): string {
  const text = memory.resolution.trim().replace(/\s+/g, " ");
  return text.length > max ? `${text.slice(0, max)}…` : text;
}
