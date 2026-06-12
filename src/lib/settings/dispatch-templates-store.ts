import { createPersistedStore, useStoreValue } from "./_persist";

export type DispatchTemplateType = "routine" | "urgent" | "blank";

export interface DispatchTemplate {
  id: string;
  name: string;
  type: DispatchTemplateType;
  expectedFlow: string;
  notes: string;
  archived: boolean;
  order: number;
}

export interface DispatchTemplatesState {
  templates: DispatchTemplate[];
}

const seed = (): DispatchTemplate[] => [
  {
    id: "tpl-routine-checkin",
    name: "Routine After-Hours Check-In",
    type: "routine",
    expectedFlow: "Greeting → Identify caller → Take message → Confirm callback time.",
    notes: "Default flow for routine accounts.",
    archived: false,
    order: 0,
  },
  {
    id: "tpl-urgent-escalation",
    name: "Urgent Medical Escalation",
    type: "urgent",
    expectedFlow: "Greeting → Confirm urgency → Page on-call → Stay on line until acknowledged.",
    notes: "Used for clinical urgent calls.",
    archived: false,
    order: 1,
  },
  {
    id: "tpl-blank",
    name: "Blank / Not Set",
    type: "blank",
    expectedFlow: "",
    notes: "Free-form testing.",
    archived: false,
    order: 2,
  },
];

export const dispatchTemplatesStore = createPersistedStore<DispatchTemplatesState>(
  "aih:settings:dispatch-templates:v1",
  { templates: seed() },
);

export function useDispatchTemplates(): DispatchTemplatesState {
  return useStoreValue(dispatchTemplatesStore, { templates: seed() });
}

export const TEMPLATE_TYPE_LABEL: Record<DispatchTemplateType, string> = {
  routine: "Routine",
  urgent: "Urgent",
  blank: "Blank / Not Set",
};

function newId() { return `tpl-${Math.random().toString(36).slice(2, 9)}`; }

export const dispatchTemplatesActions = {
  add(template: Omit<DispatchTemplate, "id" | "order" | "archived">) {
    dispatchTemplatesStore.update((s) => ({
      templates: [...s.templates, { ...template, id: newId(), archived: false, order: s.templates.length }],
    }));
  },
  update(id: string, patch: Partial<DispatchTemplate>) {
    dispatchTemplatesStore.update((s) => ({
      templates: s.templates.map((t) => (t.id === id ? { ...t, ...patch } : t)),
    }));
  },
  duplicate(id: string) {
    dispatchTemplatesStore.update((s) => {
      const src = s.templates.find((t) => t.id === id);
      if (!src) return s;
      return {
        templates: [
          ...s.templates,
          { ...src, id: newId(), name: `${src.name} (Copy)`, order: s.templates.length, archived: false },
        ],
      };
    });
  },
  archive(id: string) {
    dispatchTemplatesStore.update((s) => ({
      templates: s.templates.map((t) => (t.id === id ? { ...t, archived: true } : t)),
    }));
  },
  restore(id: string) {
    dispatchTemplatesStore.update((s) => ({
      templates: s.templates.map((t) => (t.id === id ? { ...t, archived: false } : t)),
    }));
  },
  move(id: string, dir: -1 | 1) {
    dispatchTemplatesStore.update((s) => {
      const sorted = [...s.templates].sort((a, b) => a.order - b.order);
      const idx = sorted.findIndex((t) => t.id === id);
      const target = idx + dir;
      if (idx === -1 || target < 0 || target >= sorted.length) return s;
      const a = sorted[idx], b = sorted[target];
      const aOrder = a.order, bOrder = b.order;
      return {
        templates: s.templates.map((t) =>
          t.id === a.id ? { ...t, order: bOrder } : t.id === b.id ? { ...t, order: aOrder } : t,
        ),
      };
    });
  },
};