export type CompletedKind = "freshdesk" | "dispatch" | "additional";
export interface CompletedItem {
  id: string;
  kind: CompletedKind;
  title: string;
  reference: string;
  completedAt: Date;
}

interface MockCompletedSeed extends Omit<CompletedItem, "completedAt"> {
  minutesAgo: number;
}
const seeds: MockCompletedSeed[] = [
  { id: "c1", kind: "freshdesk", title: "Holiday hours adjustment", reference: "Ticket #30210", minutesAgo: 18 },
  { id: "c2", kind: "dispatch", title: "Cedar Oaks dispatch test", reference: "Account 4821", minutesAgo: 55 },
  { id: "c3", kind: "additional", title: "Reviewed protocol changes", reference: "Riverbend Family Clinic", minutesAgo: 120 },
  { id: "c4", kind: "freshdesk", title: "New on-call contact added", reference: "Ticket #30188", minutesAgo: 180 },
  { id: "c5", kind: "dispatch", title: "Harbor Dental dispatch test", reference: "Account 3401", minutesAgo: 240 },
  { id: "c6", kind: "additional", title: "Updated greeting script", reference: "Northstar Pediatrics", minutesAgo: 300 },
];

/** Built lazily from a stable base epoch so SSR and first client render agree. */
export function getMockCompleted(baseMs: number): CompletedItem[] {
  return seeds.map((s) => ({
    id: s.id,
    kind: s.kind,
    title: s.title,
    reference: s.reference,
    completedAt: new Date(baseMs - s.minutesAgo * 60_000),
  }));
}