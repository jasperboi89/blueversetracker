import type {
  ResolutionConfidence,
  ResolutionMemory,
  ResolutionStatus,
} from "./resolution-types";

export const SELECT_COLUMNS =
  "id,account_number,account_name,problem,root_cause,resolution,testing,rollback,affected_area,confidence,source_ticket_id,source_change_record_id,source_work_item_id,source_dispatch_id,status,supersedes_id,created_at,updated_at";

export function mapResolutionRow(row: Record<string, unknown>): ResolutionMemory {
  const str = (v: unknown) => (typeof v === "string" ? v : "");
  return {
    id: row.id as string,
    accountNumber: str(row.account_number),
    accountName: str(row.account_name),
    problem: str(row.problem),
    rootCause: str(row.root_cause),
    resolution: str(row.resolution),
    testing: str(row.testing),
    rollback: str(row.rollback),
    affectedArea: str(row.affected_area),
    confidence: (str(row.confidence) || "unknown") as ResolutionConfidence,
    source: {
      ...(str(row.source_ticket_id) ? { ticketId: str(row.source_ticket_id) } : {}),
      ...(row.source_change_record_id
        ? { changeRecordId: row.source_change_record_id as string }
        : {}),
      ...(str(row.source_work_item_id) ? { workItemId: str(row.source_work_item_id) } : {}),
      ...(str(row.source_dispatch_id) ? { dispatchId: str(row.source_dispatch_id) } : {}),
    },
    status: (str(row.status) || "active") as ResolutionStatus,
    ...(row.supersedes_id ? { supersedesId: row.supersedes_id as string } : {}),
    createdAt: str(row.created_at),
    updatedAt: str(row.updated_at),
  };
}
