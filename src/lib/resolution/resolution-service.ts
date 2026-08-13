/**
 * Resolution Memory service — the only write path used by the UI.
 *
 * Responsibilities: guard against repeated saves, keep supersession
 * consistent, emit exactly one Event Spine event per real transition, and
 * invalidate the Account Context cache. Storage authority stays server-side.
 */
import { eventSpine } from "@/lib/core/event-spine";
import { invalidateAccountContext } from "@/lib/core/account-context-service";
import {
  archiveResolutionMemory,
  createResolutionMemory,
  listResolutionMemories,
  updateResolutionMemory,
  type CreateResolutionResult,
} from "./resolution.functions";
import {
  rankResolutions,
  resolutionFingerprint,
  resolutionSourceKey,
  type ResolutionConfidence,
  type ResolutionDraft,
  type ResolutionMemory,
  type ResolutionStatus,
} from "./resolution-types";

export interface ResolutionApi {
  create: (input: unknown) => Promise<CreateResolutionResult>;
  update: (input: unknown) => Promise<ResolutionMemory>;
  archive: (input: unknown) => Promise<ResolutionMemory>;
  list: (input: unknown) => Promise<{ memories: ResolutionMemory[] }>;
}

const defaultApi: ResolutionApi = {
  create: (input) => createResolutionMemory({ data: input as never }),
  update: (input) => updateResolutionMemory({ data: input as never }),
  archive: (input) => archiveResolutionMemory({ data: input as never }),
  list: (input) => listResolutionMemories({ data: input as never }),
};

export interface FindResolutionQuery {
  accountNumber?: string;
  affectedArea?: string;
  confidence?: ResolutionConfidence;
  status?: ResolutionStatus;
  sourceTicketId?: string;
  includeInactive?: boolean;
  limit?: number;
}

export interface ResolutionService {
  save: (draft: ResolutionDraft) => Promise<CreateResolutionResult>;
  edit: (
    id: string,
    patch: Partial<Omit<ResolutionDraft, "source" | "supersedesId">>,
  ) => Promise<ResolutionMemory>;
  archive: (id: string) => Promise<ResolutionMemory>;
  find: (query?: FindResolutionQuery) => Promise<ResolutionMemory[]>;
}

export function createResolutionService(api: ResolutionApi = defaultApi): ResolutionService {
  /** Repeated Save clicks collapse onto one in-flight request. */
  const inflight = new Map<string, Promise<CreateResolutionResult>>();

  const save = (draft: ResolutionDraft): Promise<CreateResolutionResult> => {
    const key = `${resolutionSourceKey(draft.source)}::${resolutionFingerprint(
      draft.problem,
      draft.resolution,
    )}::${draft.supersedesId ?? ""}`;
    const existing = inflight.get(key);
    if (existing) return existing;

    const run = api
      .create({
        accountNumber: draft.accountNumber ?? "",
        accountName: draft.accountName ?? "",
        problem: draft.problem,
        rootCause: draft.rootCause ?? "",
        resolution: draft.resolution,
        testing: draft.testing ?? "",
        rollback: draft.rollback ?? "",
        affectedArea: draft.affectedArea ?? "",
        confidence: draft.confidence,
        source: draft.source ?? {},
        ...(draft.supersedesId ? { supersedesId: draft.supersedesId } : {}),
      })
      .then((result) => {
        // A duplicate is not a new fact — no event, no second record.
        if (!result.duplicate) {
          eventSpine.emit({
            type: "resolution.created",
            source: "resolution",
            ...(result.memory.accountNumber ? { accountId: result.memory.accountNumber } : {}),
            ...(result.memory.source.ticketId
              ? { ticketId: result.memory.source.ticketId }
              : {}),
            metadata: {
              resolutionId: result.memory.id,
              confidence: result.memory.confidence,
              sourceType: sourceTypeOf(result.memory),
            },
          });
          if (result.supersededId) {
            eventSpine.emit({
              type: "resolution.superseded",
              source: "resolution",
              ...(result.memory.accountNumber
                ? { accountId: result.memory.accountNumber }
                : {}),
              metadata: {
                resolutionId: result.supersededId,
                confidence: result.memory.confidence,
              },
            });
          }
        }
        invalidateAccountContext(result.memory.accountNumber || undefined);
        return result;
      })
      .finally(() => {
        inflight.delete(key);
      });

    inflight.set(key, run);
    return run;
  };

  return {
    save,
    async edit(id, patch) {
      const memory = await api.update({ id, ...patch });
      eventSpine.emit({
        type: "resolution.updated",
        source: "resolution",
        ...(memory.accountNumber ? { accountId: memory.accountNumber } : {}),
        metadata: { resolutionId: memory.id, confidence: memory.confidence },
      });
      invalidateAccountContext(memory.accountNumber || undefined);
      return memory;
    },
    async archive(id) {
      const memory = await api.archive({ id });
      eventSpine.emit({
        type: "resolution.archived",
        source: "resolution",
        ...(memory.accountNumber ? { accountId: memory.accountNumber } : {}),
        metadata: { resolutionId: memory.id },
      });
      invalidateAccountContext(memory.accountNumber || undefined);
      return memory;
    },
    async find(query = {}) {
      const { memories } = await api.list(query);
      return rankResolutions(memories, {
        ...(query.accountNumber ? { accountNumber: query.accountNumber } : {}),
      });
    },
  };
}

function sourceTypeOf(memory: ResolutionMemory): string {
  if (memory.source.ticketId) return "ticket";
  if (memory.source.changeRecordId) return "change_record";
  if (memory.source.dispatchId) return "dispatch";
  if (memory.source.workItemId) return "work_item";
  return "manual";
}

export const resolutionService = createResolutionService();

/** Deterministic lookup used by "Seen this before?" surfaces. */
export function findResolutionMemories(
  query: FindResolutionQuery = {},
): Promise<ResolutionMemory[]> {
  return resolutionService.find(query);
}
