import { createPersistedStore, useStoreValue } from "./_persist";
import { attachCloudSync } from "@/lib/cloud-sync/blob-sync";
import type { ReasonType } from "@/lib/dispatch-store";

export interface GlobalReasonTemplate {
  id: string;
  text: string;
  type: ReasonType;
  expectedFlow: string;
}

interface State {
  templates: GlobalReasonTemplate[];
}

const DEFAULT: State = {
  templates: [
    { id: "tpl-routine-message", text: "Routine — Take a message", type: "routine", expectedFlow: "Greet caller, capture name + callback + reason, confirm details, send as routine message." },
    { id: "tpl-urgent-oncall", text: "Urgent — Reach the on-call provider", type: "urgent", expectedFlow: "Verify urgent criteria, pull current on-call, page/call per saved instructions, document attempt + result." },
    { id: "tpl-appt-request", text: "Appointment request", type: "routine", expectedFlow: "Confirm patient identity, capture reason + preferred times, route to scheduling queue." },
  ],
};

export const reasonTemplatesStore = createPersistedStore<State>(
  "aih:settings:reason-templates:v1",
  DEFAULT,
);

export function useGlobalReasonTemplates(): GlobalReasonTemplate[] {
  return useStoreValue(reasonTemplatesStore, DEFAULT).templates;
}

export const reasonTemplatesActions = {
  add(t: Omit<GlobalReasonTemplate, "id">) {
    reasonTemplatesStore.update((s) => ({
      templates: [...s.templates, { ...t, id: `grt-${Date.now()}` }],
    }));
  },
  update(id: string, patch: Partial<GlobalReasonTemplate>) {
    reasonTemplatesStore.update((s) => ({
      templates: s.templates.map((t) => (t.id === id ? { ...t, ...patch } : t)),
    }));
  },
  remove(id: string) {
    reasonTemplatesStore.update((s) => ({
      templates: s.templates.filter((t) => t.id !== id),
    }));
  },
};

attachCloudSync<State>({
  storeKey: "settings:reason-templates",
  subscribe: reasonTemplatesStore.subscribe,
  getSnapshot: () => reasonTemplatesStore.get(),
  applyServerSnapshot: (next) => reasonTemplatesStore.applyServerSnapshot(next),
});