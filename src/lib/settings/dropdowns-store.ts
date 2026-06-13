import { createPersistedStore, useStoreValue } from "./_persist";
import { attachCloudSync } from "@/lib/cloud-sync/blob-sync";

export type DropdownGroup =
  | "region"
  | "company"
  | "topic"
  | "type"
  | "priority"
  | "group"
  | "agent"
  | "issueClassification"
  | "snipCategory"
  | "sectionStatus"
  | "dispatchStatus"
  | "reasonType"
  | "checkResult"
  | "retestResult"
  | "dispatchSnipCategory"
  | "addworkSnipCategory"
  | "qbEventFrequency"
  | "qbParticleDensity";

export interface DropdownValue {
  id: string;
  label: string;
  archived: boolean;
  order: number;
}

export type DropdownState = Record<DropdownGroup, DropdownValue[]>;

const seedFor = (labels: string[]): DropdownValue[] =>
  labels.map((label, i) => ({
    id: `${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${i}`,
    label, archived: false, order: i,
  }));

const seedPairs = (pairs: [string, string][]): DropdownValue[] =>
  pairs.map(([id, label], i) => ({ id, label, archived: false, order: i }));

export const DEFAULT_DROPDOWNS: DropdownState = {
  region: seedFor(["Central", "Eastern", "Mountain", "Pacific"]),
  company: seedFor([]),
  topic: seedFor(["On-Call Schedule", "Dispatch List", "Scripting", "Greeting / Scripting", "Account Settings", "Other"]),
  type: seedFor(["Service Request", "Change Request", "Bug", "Question"]),
  priority: seedFor(["Low", "Medium", "High", "Urgent"]),
  group: seedFor(["Night Operations", "Customer Service", "Programming"]),
  agent: seedFor(["L. Park", "Night CS", "Programming", "Unassigned"]),
  issueClassification: seedFor(["Scripting Issue", "Client Change", "Other"]),
  snipCategory: seedFor(["Before Change", "After Change", "Testing Result", "Error / Issue", "Other"]),
  sectionStatus: seedPairs([
    ["not-tested", "Not Tested"],
    ["in-progress", "In Progress"],
    ["passed", "Passed"],
    ["failed", "Failed"],
    ["passed-retest", "Passed After Retest"],
    ["still-failed", "Still Failed"],
    ["waiting-review", "Waiting Review"],
    ["complete", "Complete"],
    ["na", "N/A"],
  ]),
  dispatchStatus: seedPairs([
    ["ready", "Ready for Activation"],
    ["waiting-cs", "Waiting on Review from Customer Service"],
    ["waiting-prog", "Waiting on Review from Programming"],
    ["not-ready", "Not Ready, Still Working on Ticket"],
  ]),
  reasonType: seedPairs([
    ["routine", "Routine"],
    ["urgent", "Urgent"],
    ["na", "N/A"],
    ["unsure", "Not Sure Yet"],
  ]),
  checkResult: seedPairs([
    ["passed", "Passed"],
    ["failed", "Failed"],
  ]),
  retestResult: seedPairs([
    ["passed", "Passed"],
    ["still-failed", "Still Failed"],
  ]),
  dispatchSnipCategory: seedFor([
    "Front-End Screen", "Backend Script Tree", "Routing / On-Call",
    "Message Summary", "Error / Issue", "Other",
  ]),
  addworkSnipCategory: seedFor([
    "Email / Request", "Before Change", "After Change",
    "Testing Result", "Error / Issue", "Other",
  ]),
  qbEventFrequency: seedPairs([
    ["off", "Off"], ["low", "Low"], ["normal", "Normal"], ["high", "High"],
  ]),
  qbParticleDensity: seedPairs([
    ["low", "Low"], ["medium", "Medium"], ["high", "High"],
  ]),
};

export const dropdownsStore = createPersistedStore<DropdownState>(
  "aih:settings:dropdowns:v1",
  DEFAULT_DROPDOWNS,
);

export function useDropdowns(): DropdownState {
  const cur = useStoreValue(dropdownsStore, DEFAULT_DROPDOWNS);
  // Backfill any groups added in later versions if user's saved snapshot is missing them.
  let patched = cur;
  for (const k of Object.keys(DEFAULT_DROPDOWNS) as DropdownGroup[]) {
    if (!Array.isArray(patched[k])) {
      patched = { ...patched, [k]: DEFAULT_DROPDOWNS[k] };
    }
  }
  return patched;
}

export function getActiveValues(group: DropdownGroup): DropdownValue[] {
  const raw = dropdownsStore.get()[group] ?? DEFAULT_DROPDOWNS[group] ?? [];
  return [...raw].filter((v) => !v.archived).sort((a, b) => a.order - b.order);
}

/** Reactive ordered active values for a group. */
export function useDropdownGroup(group: DropdownGroup): DropdownValue[] {
  const state = useDropdowns();
  const arr = state[group] ?? DEFAULT_DROPDOWNS[group] ?? [];
  return [...arr].filter((v) => !v.archived).sort((a, b) => a.order - b.order);
}

/** Reactive label lookup; falls back to id then to provided default. */
export function useDropdownLabel(group: DropdownGroup, id: string | null | undefined, fallback?: string): string {
  const state = useDropdowns();
  if (!id) return fallback ?? "";
  const found = (state[group] ?? []).find((v) => v.id === id);
  return found?.label ?? fallback ?? id;
}

export const dropdownsActions = {
  add(group: DropdownGroup, label: string) {
    const trimmed = label.trim();
    if (!trimmed) return;
    dropdownsStore.update((s) => {
      const cur = s[group] ?? [];
      return {
        ...s,
        [group]: [...cur, {
          id: `${group}-${Date.now()}`,
          label: trimmed, archived: false, order: cur.length,
        }],
      };
    });
  },
  rename(group: DropdownGroup, id: string, label: string) {
    const trimmed = label.trim();
    if (!trimmed) return;
    dropdownsStore.update((s) => ({
      ...s,
      [group]: (s[group] ?? []).map((v) => v.id === id ? { ...v, label: trimmed } : v),
    }));
  },
  remove(group: DropdownGroup, id: string) {
    dropdownsStore.update((s) => ({
      ...s,
      [group]: (s[group] ?? []).filter((v) => v.id !== id).map((v, i) => ({ ...v, order: i })),
    }));
  },
  setArchived(group: DropdownGroup, id: string, archived: boolean) {
    dropdownsStore.update((s) => ({
      ...s,
      [group]: (s[group] ?? []).map((v) => v.id === id ? { ...v, archived } : v),
    }));
  },
  move(group: DropdownGroup, id: string, dir: -1 | 1) {
    dropdownsStore.update((s) => {
      const list = [...(s[group] ?? [])].sort((a, b) => a.order - b.order);
      const idx = list.findIndex((v) => v.id === id);
      if (idx < 0) return s;
      const swap = idx + dir;
      if (swap < 0 || swap >= list.length) return s;
      [list[idx], list[swap]] = [list[swap], list[idx]];
      return { ...s, [group]: list.map((v, i) => ({ ...v, order: i })) };
    });
  },
  reset(group: DropdownGroup) {
    dropdownsStore.update((s) => ({ ...s, [group]: DEFAULT_DROPDOWNS[group] }));
  },
};

export const DROPDOWN_LABEL: Record<DropdownGroup, string> = {
  region: "Region",
  company: "Company",
  topic: "Topic",
  type: "Type",
  priority: "Freshdesk Priority",
  group: "Freshdesk Group",
  agent: "Freshdesk Agent",
  issueClassification: "Issue Classification (Additional Work)",
  snipCategory: "Snip Categories (Freshdesk Ticket)",
  sectionStatus: "Section Status (Dispatch Sections)",
  dispatchStatus: "Overall Dispatch Status",
  reasonType: "Reason Urgency (Dispatch)",
  checkResult: "Check Result (Dispatch)",
  retestResult: "Retest Result",
  dispatchSnipCategory: "Snip Categories (Dispatch)",
  addworkSnipCategory: "Snip Categories (Additional Work)",
  qbEventFrequency: "Quantum Bloom — Event Frequency",
  qbParticleDensity: "Quantum Bloom — Particle Density",
};

/** Stable groupings for the Settings editor UI. */
export const DROPDOWN_GROUP_SECTIONS: { title: string; groups: DropdownGroup[] }[] = [
  {
    title: "Tickets",
    groups: ["snipCategory", "issueClassification"],
  },
  {
    title: "Dispatch Testing",
    groups: ["sectionStatus", "dispatchStatus", "reasonType", "checkResult", "retestResult", "dispatchSnipCategory"],
  },
  {
    title: "Additional Work",
    groups: ["addworkSnipCategory"],
  },
  {
    title: "Account Metadata",
    groups: ["region", "company", "topic", "type", "priority", "group", "agent"],
  },
  {
    title: "Quantum Bloom",
    groups: ["qbEventFrequency", "qbParticleDensity"],
  },
];
attachCloudSync<DropdownState>({
  storeKey: "settings:dropdowns",
  subscribe: dropdownsStore.subscribe,
  getSnapshot: () => dropdownsStore.get(),
  applyServerSnapshot: (next) => dropdownsStore.applyServerSnapshot(next),
});
