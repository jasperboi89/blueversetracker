export type CompletedKind = "freshdesk" | "dispatch" | "additional";
export interface CompletedItem {
  id: string;
  kind: CompletedKind;
  title: string;
  reference: string;
  completedAt: Date;
}
const now = Date.now();
export const mockCompleted: CompletedItem[] = [
  { id: "c1", kind: "freshdesk", title: "Holiday hours adjustment", reference: "Ticket #30210", completedAt: new Date(now - 18 * 60_000) },
  { id: "c2", kind: "dispatch", title: "Cedar Oaks dispatch test", reference: "Account 4821", completedAt: new Date(now - 55 * 60_000) },
  { id: "c3", kind: "additional", title: "Reviewed protocol changes", reference: "Riverbend Family Clinic", completedAt: new Date(now - 2 * 60 * 60_000) },
  { id: "c4", kind: "freshdesk", title: "New on-call contact added", reference: "Ticket #30188", completedAt: new Date(now - 3 * 60 * 60_000) },
  { id: "c5", kind: "dispatch", title: "Harbor Dental dispatch test", reference: "Account 3401", completedAt: new Date(now - 4 * 60 * 60_000) },
  { id: "c6", kind: "additional", title: "Updated greeting script", reference: "Northstar Pediatrics", completedAt: new Date(now - 5 * 60 * 60_000) },
];