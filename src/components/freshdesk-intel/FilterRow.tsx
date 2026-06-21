import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import type { IntelFilters } from "@/lib/api/freshdesk-search.functions";

const STATUSES: { value: number; label: string }[] = [
  { value: 2, label: "Open" },
  { value: 3, label: "Pending" },
  { value: 4, label: "Resolved" },
  { value: 5, label: "Closed" },
];
const PRIORITIES: { value: number; label: string }[] = [
  { value: 1, label: "Low" },
  { value: 2, label: "Medium" },
  { value: 3, label: "High" },
  { value: 4, label: "Urgent" },
];

function toggle<T>(arr: T[] | undefined, v: T): T[] {
  const set = new Set(arr ?? []);
  if (set.has(v)) set.delete(v); else set.add(v);
  return Array.from(set);
}

export function FilterRow({
  value,
  onChange,
}: {
  value: IntelFilters;
  onChange: (next: IntelFilters) => void;
}) {
  return (
    <div className="flex flex-wrap items-end gap-3 text-xs">
      <Field label="Account #">
        <Input
          className="h-8 w-28"
          value={value.accountNumber ?? ""}
          onChange={(e) => onChange({ ...value, accountNumber: e.target.value || undefined })}
          placeholder="1234"
        />
      </Field>
      <Field label="Status">
        <div className="flex flex-wrap gap-1">
          {STATUSES.map((s) => (
            <Chip
              key={s.value}
              active={value.statuses?.includes(s.value) ?? false}
              onClick={() => onChange({ ...value, statuses: toggle(value.statuses, s.value) })}
            >
              {s.label}
            </Chip>
          ))}
        </div>
      </Field>
      <Field label="Priority">
        <div className="flex flex-wrap gap-1">
          {PRIORITIES.map((p) => (
            <Chip
              key={p.value}
              active={value.priorities?.includes(p.value) ?? false}
              onClick={() => onChange({ ...value, priorities: toggle(value.priorities, p.value) })}
            >
              {p.label}
            </Chip>
          ))}
        </div>
      </Field>
      <Field label="Group ID">
        <Input
          className="h-8 w-24"
          inputMode="numeric"
          value={value.groupId ?? ""}
          onChange={(e) => {
            const n = Number(e.target.value);
            onChange({ ...value, groupId: Number.isFinite(n) && n > 0 ? n : undefined });
          }}
        />
      </Field>
      <Field label="Agent ID">
        <Input
          className="h-8 w-24"
          inputMode="numeric"
          value={value.agentId ?? ""}
          onChange={(e) => {
            const n = Number(e.target.value);
            onChange({ ...value, agentId: Number.isFinite(n) && n > 0 ? n : undefined });
          }}
        />
      </Field>
      <Field label="Updated after">
        <Input
          className="h-8 w-36"
          type="date"
          value={value.updatedAfter ?? ""}
          onChange={(e) => onChange({ ...value, updatedAfter: e.target.value || undefined })}
        />
      </Field>
      <Field label="Include closed">
        <div className="flex h-8 items-center">
          <Switch
            checked={!!value.includeClosed}
            onCheckedChange={(v) => onChange({ ...value, includeClosed: v })}
          />
        </div>
      </Field>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">{label}</div>
      {children}
    </div>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "rounded-full border px-2.5 py-1 text-[11px] transition " +
        (active
          ? "border-cyan-400/60 bg-cyan-400/15 text-cyan-100"
          : "border-white/10 bg-white/5 text-muted-foreground hover:text-foreground")
      }
    >
      {children}
    </button>
  );
}