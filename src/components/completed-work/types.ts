export type CompletedKind = "freshdesk" | "dispatch" | "additional";

export interface CompletedRecord {
  id: string;
  kind: CompletedKind;
  title: string;
  accountNumber?: string;
  accountName?: string;
  ticketNumber?: string;
  completedAt: number;
  /** id of the source record (ticket id / session id / work id) */
  sourceId: string;
}