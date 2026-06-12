import { createPersistedStore, useStoreValue } from "./_persist";

export type DropdownGroup =
  | "region"
  | "company"
  | "topic"
  | "type"
  | "priority"
  | "group"
  | "agent"
  | "issueClassification"
  | "snipCategory";

export interface DropdownValue {
  id: string;
  label: string;
  archived: boolean;
  order: number;
}

export type DropdownState = Record<DropdownGroup, DropdownValue[]>;

const seedFor = (labels: string[]): DropdownValue[] =>
  labels.map((label, i) => ({ id: `${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${i}`, label, archived: false, order: i }));

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
};

export const dropdownsStore = createPersistedStore<DropdownState>(
  "aih:settings:dropdowns:v1",
  DEFAULT_DROPDOWNS,
);

export function useDropdowns(): DropdownState {
  return useStoreValue(dropdownsStore, DEFAULT_DROPDOWNS);
}

export function getActiveValues(group: DropdownGroup): DropdownValue[] {
  return [...(dropdownsStore.get()[group] ?? [])]
    .filter((v) => !v.archived)
    .sort((a, b) => a.order - b.order);
}

export const DROPDOWN_LABEL: Record<DropdownGroup, string> = {
  region: "Region",
  company: "Company",
  topic: "Topic",
  type: "Type",
  priority: "Freshdesk Priority",
  group: "Freshdesk Group",
  agent: "Freshdesk Agent",
  issueClassification: "Issue Classification",
  snipCategory: "Snip Categories",
};