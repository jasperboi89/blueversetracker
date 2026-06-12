import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import {
  Plug, Sparkles, PhoneOutgoing, ListChecks, Clock, Eye, Database,
  TestTube2, Trash2, ShieldCheck, AlertCircle, Plus, Archive, RotateCcw, MoveUp, MoveDown, Lock,
} from "lucide-react";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { freshdeskTestConnection } from "@/lib/api/freshdesk.functions";
import {
  useFreshdeskConfig, markFreshdeskConnected, markFreshdeskError, clearFreshdeskConfig,
} from "@/lib/settings/freshdesk-config-store";
import {
  useAISettings, aiSettingsStore, DEFAULT_AI_SETTINGS,
  TONE_LABEL, LENGTH_LABEL, DETAIL_LABEL,
  type AITone, type AILength, type AIDetailLevel,
} from "@/lib/settings/ai-settings-store";
import {
  useDispatchTemplates, dispatchTemplatesActions, TEMPLATE_TYPE_LABEL,
  type DispatchTemplateType,
} from "@/lib/settings/dispatch-templates-store";
import {
  useDropdowns, dropdownsStore, DROPDOWN_LABEL,
  type DropdownGroup,
} from "@/lib/settings/dropdowns-store";
import { useShiftSettings, shiftSettingsStore, fmtHour } from "@/lib/settings/shift-settings-store";
import { useDisplayPrefs, displayPrefsStore } from "@/lib/settings/display-prefs-store";
import { useDemoMode, setDemoMode } from "@/lib/settings/demo-mode-store";
import { nightPlanHistory } from "@/lib/reports/night-plan-history";
import { useTickets } from "@/lib/tickets-store";
import { useAccounts } from "@/lib/accounts-store";
import { useDispatch } from "@/lib/dispatch-store";
import { useAdditionalWork } from "@/lib/additional-work-store";
import { ticketsStore } from "@/lib/tickets-store";
import { accountsStore } from "@/lib/accounts-store";
import { dispatchStore } from "@/lib/dispatch-store";
import { additionalWorkStore } from "@/lib/additional-work-store";
import { formatCentralExact } from "@/lib/shift";
import { useQuery } from "@tanstack/react-query";
import { adminGetAccessSummary } from "@/lib/auth/admin-users.functions";
import { INACTIVITY_LOGOUT_MS } from "@/lib/auth/inactivity-config";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({ meta: [{ title: "Settings — Account Intel Hub" }] }),
  component: SettingsPage,
});

const SECTIONS = [
  { id: "security",   title: "Security & Access",     icon: Lock },
  { id: "freshdesk",  title: "Freshdesk Integration", icon: Plug },
  { id: "ai",         title: "AI Summary Settings",   icon: Sparkles },
  { id: "templates",  title: "Contact Dispatch Templates", icon: PhoneOutgoing },
  { id: "dropdowns",  title: "Dropdown Management",   icon: ListChecks },
  { id: "shift",      title: "Shift Settings",        icon: Clock },
  { id: "display",    title: "Display Preferences",   icon: Eye },
  { id: "data",       title: "Data / Cleanup",        icon: Database },
] as const;

function SettingsPage() {
  return (
    <>
      <div className="mx-auto max-w-6xl space-y-4">
        <div className="glass-panel p-4 sm:p-5">
          <h1 className="text-xl font-semibold text-foreground">Settings</h1>
          <p className="mt-1 text-xs text-muted-foreground">
            Connection, templates, dropdowns, and shift configuration for the Account Intel Hub.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-[220px_1fr]">
          <nav className="glass-panel sticky top-4 h-fit p-2 text-sm">
            {SECTIONS.map((s) => {
              const Icon = s.icon;
              return (
                <a key={s.id} href={`#${s.id}`}
                   className="flex items-center gap-2 rounded-md px-3 py-2 text-muted-foreground transition hover:bg-white/5 hover:text-foreground">
                  <Icon className="h-4 w-4" /> {s.title}
                </a>
              );
            })}
          </nav>

          <div className="space-y-4">
            <SecurityAccessSection />
            <FreshdeskSection />
            <AISection />
            <TemplatesSection />
            <DropdownsSection />
            <ShiftSection />
            <DisplaySection />
            <DataSection />
          </div>
        </div>
      </div>
    </>
  );
}

/* ---------------- Freshdesk ---------------- */
function FreshdeskSection() {
  return <FreshdeskSectionImpl />;
}

function SecurityAccessSection() {
  const { data } = useQuery({
    queryKey: ["admin-access-summary"],
    queryFn: () => adminGetAccessSummary(),
  });
  const minutes = Math.round(INACTIVITY_LOGOUT_MS / 60000);
  return (
    <SectionCard id="security" title="Security & Access" icon={Lock}>
      <div className="grid gap-2 text-sm">
        <Row label="Authentication" value="Active" />
        <Row label="Authorized users" value={`${data?.active ?? "—"} active / ${data?.total ?? "—"} total`} />
        <Row label="Auto-logoff" value={`${minutes} minutes`} />
        <Row label="Roles enabled" value="Admin · Programmer · Viewer" />
        <Row label="Audit logging" value="Enabled" />
      </div>
      <p className="mt-3 text-[11px] text-muted-foreground">
        HIPAA-Safeguarded · Internal Use. User management UI is not enabled in this phase.
      </p>
    </SectionCard>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between border-b border-border/20 py-1.5 last:border-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-foreground">{value}</span>
    </div>
  );
}

function FreshdeskSectionImpl() {
  const cfg = useFreshdeskConfig();
  const [testing, setTesting] = useState(false);
  const [clearOpen, setClearOpen] = useState(false);
  const [domainInput, setDomainInput] = useState(cfg.domain);

  async function runTest() {
    setTesting(true);
    try {
      const res = await freshdeskTestConnection();
      if (res.ok) {
        markFreshdeskConnected(domainInput || cfg.domain || (res.domain ?? ""), "****", res.agentName);
        toast.success(`Connected to Freshdesk as ${res.agentName}`);
      } else {
        markFreshdeskError(res.error ?? "Unknown error");
        toast.error(res.error ?? "Could not connect to Freshdesk.");
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Network error.";
      markFreshdeskError(msg);
      toast.error(msg);
    } finally {
      setTesting(false);
    }
  }

  return (
    <SectionCard id="freshdesk" title="Freshdesk Integration" icon={Plug}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Freshdesk Domain / Subdomain">
          <Input
            value={domainInput}
            onChange={(e) => setDomainInput(e.target.value)}
            placeholder="acme  or  acme.freshdesk.com"
          />
        </Field>
        <Field label="API Key (secured)">
          <div className="flex items-center gap-2 rounded-md border border-border/40 bg-background/30 px-3 py-2 text-sm text-muted-foreground">
            <ShieldCheck className="h-4 w-4" />
            {cfg.apiKeyTail ? <code className="font-mono">{cfg.apiKeyTail}</code> : <span>Not set</span>}
          </div>
        </Field>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
        <StatusChip status={cfg.status} />
        {cfg.lastSuccessAt && (
          <span className="text-muted-foreground">
            Last successful test {formatCentralExact(cfg.lastSuccessAt)}
          </span>
        )}
        {cfg.lastErrorMessage && cfg.status === "error" && (
          <span className="inline-flex items-center gap-1 text-[color:oklch(0.72_0.22_25)]">
            <AlertCircle className="h-3 w-3" /> {cfg.lastErrorMessage}
          </span>
        )}
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <Button onClick={runTest} disabled={testing}>
          <TestTube2 className="mr-1.5 h-4 w-4" /> {testing ? "Testing…" : "Test Connection"}
        </Button>
        <Button variant="ghost" onClick={() => setClearOpen(true)}>
          <Trash2 className="mr-1.5 h-4 w-4" /> Clear Connection
        </Button>
      </div>

      <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
        API keys are stored as server-side project secrets and never exposed to the browser. To
        save or rotate your key, ask Lovable to <em>"add Freshdesk credentials"</em> — you'll
        enter the values in a secure prompt.
      </p>

      <ConfirmModal
        open={clearOpen}
        onOpenChange={setClearOpen}
        title="Clear Freshdesk connection?"
        description="This resets the connection status in the Hub. Your stored Freshdesk secrets are managed separately and need to be removed from project secrets to fully disconnect."
        confirmLabel="Clear"
        tone="danger"
        onConfirm={() => {
          clearFreshdeskConfig();
          setClearOpen(false);
          toast.success("Freshdesk connection cleared in Hub.");
        }}
      />
    </SectionCard>
  );
}

function StatusChip({ status }: { status: "not-connected" | "connected" | "error" }) {
  const map = {
    "not-connected": { label: "Not Connected", color: "var(--muted-foreground)" },
    connected:       { label: "Connected", color: "var(--green-glow)" },
    error:           { label: "Error", color: "oklch(0.72 0.22 25)" },
  } as const;
  const m = map[status];
  return (
    <span className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] uppercase tracking-wider"
      style={{ color: m.color, borderColor: `color-mix(in oklab, ${m.color} 50%, transparent)` }}>
      {m.label}
    </span>
  );
}

/* ---------------- AI ---------------- */
function AISection() {
  const s = useAISettings();
  const [preview, setPreview] = useState<string>("");

  function genPreview() {
    const lines = [
      `Tone: ${TONE_LABEL[s.tone]}  ·  Length: ${LENGTH_LABEL[s.length]}  ·  Detail: ${DETAIL_LABEL[s.technicalLevel]}`,
      "",
      "— Freshdesk Note —",
      sample("Updated on-call rotation per CS request. Dr. Cole moved to Mon/Wed overnight.", s),
      "",
      "— Contact Dispatch Summary —",
      sample("Routine after-hours test: greeting clean, dispatch flow correct, callback timing accurate.", s),
      "",
      "— Additional Work —",
      sample("Audited holiday scripting; flagged two accounts for CS review tomorrow.", s),
      "",
      "— Programming Status Email Item —",
      sample("Lakeside Cardiology — after-hours auto-routing escalated to programming; waiting on script fix.", s),
    ];
    setPreview(lines.join("\n"));
  }

  return (
    <SectionCard id="ai" title="AI Summary Settings" icon={Sparkles}>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Writing Tone">
          <Select value={s.tone} onValueChange={(v) => aiSettingsStore.update((c) => ({ ...c, tone: v as AITone }))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {(Object.keys(TONE_LABEL) as AITone[]).map((k) => (
                <SelectItem key={k} value={k}>{TONE_LABEL[k]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Summary Length">
          <Select value={s.length} onValueChange={(v) => aiSettingsStore.update((c) => ({ ...c, length: v as AILength }))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {(Object.keys(LENGTH_LABEL) as AILength[]).map((k) => (
                <SelectItem key={k} value={k}>{LENGTH_LABEL[k]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Technical Detail">
          <Select value={s.technicalLevel} onValueChange={(v) => aiSettingsStore.update((c) => ({ ...c, technicalLevel: v as AIDetailLevel }))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {(Object.keys(DETAIL_LABEL) as AIDetailLevel[]).map((k) => (
                <SelectItem key={k} value={k}>{DETAIL_LABEL[k]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </div>

      <div className="mt-3 flex items-start gap-3 rounded-md border border-border/40 p-3">
        <Switch checked={s.smartDetailOverride}
                onCheckedChange={(v) => aiSettingsStore.update((c) => ({ ...c, smartDetailOverride: v }))} />
        <div className="text-xs">
          <div className="font-medium text-foreground">Smart Detail Override</div>
          <div className="text-muted-foreground">Failed / Waiting / Not Ready items get extra detail automatically even when Length is Short.</div>
        </div>
      </div>

      <Field label="Custom Prompt Instructions" className="mt-3">
        <Textarea
          rows={3}
          value={s.customInstructions}
          onChange={(e) => aiSettingsStore.update((c) => ({ ...c, customInstructions: e.target.value }))}
          placeholder="e.g. Always say 'after-hours' (not 'overnight'). Never invent ticket numbers."
        />
      </Field>

      <div className="mt-3 flex flex-wrap gap-2">
        <Button onClick={genPreview}><Sparkles className="mr-1.5 h-4 w-4" /> Generate Preview</Button>
        <Button variant="ghost" onClick={() => { aiSettingsStore.set(DEFAULT_AI_SETTINGS); setPreview(""); toast.success("AI settings reset to default."); }}>
          <RotateCcw className="mr-1.5 h-4 w-4" /> Reset to Default
        </Button>
      </div>

      {preview && (
        <pre className="mt-3 max-h-72 overflow-auto rounded-md border border-border/40 bg-background/30 p-3 text-[11px] leading-relaxed text-foreground whitespace-pre-wrap">{preview}</pre>
      )}
    </SectionCard>
  );
}

function sample(text: string, s: ReturnType<typeof useAISettings>): string {
  const tonePrefix =
    s.tone === "short-direct" ? "" :
    s.tone === "programming-focused" ? "[tech] " :
    s.tone === "customer-service-friendly" ? "Hi team — " :
    s.tone === "detailed" ? "Update: " : "Quick note: ";
  const out = `${tonePrefix}${text}`;
  if (s.length === "short") return out;
  if (s.length === "detailed")
    return `${out}\n  • Details: account confirmed, no script changes pending.\n  • Next: monitor through end of shift.`;
  return `${out}\n  • No follow-up needed unless customer re-opens.`;
}

/* ---------------- Dispatch Templates ---------------- */
function TemplatesSection() {
  const { templates } = useDispatchTemplates();
  const [showArchived, setShowArchived] = useState(false);
  const [editing, setEditing] = useState<null | string>(null);
  const [draft, setDraft] = useState({ name: "", type: "routine" as DispatchTemplateType, expectedFlow: "", notes: "" });

  const visible = [...templates].sort((a, b) => a.order - b.order).filter((t) => showArchived || !t.archived);

  return (
    <SectionCard id="templates" title="Contact Dispatch Templates" icon={PhoneOutgoing}>
      <div className="mb-3 flex items-center justify-between text-xs">
        <span className="text-muted-foreground">Global templates appear in Contact Dispatch Testing.</span>
        <label className="flex items-center gap-2">
          <Switch checked={showArchived} onCheckedChange={setShowArchived} />
          Show Archived
        </label>
      </div>

      <div className="space-y-2">
        {visible.map((t) => (
          <div key={t.id} className="rounded-md border border-border/40 p-3 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="font-medium text-foreground">{t.name} {t.archived && <span className="ml-1 text-[10px] uppercase tracking-wider text-muted-foreground">archived</span>}</div>
                <div className="text-xs text-muted-foreground">{TEMPLATE_TYPE_LABEL[t.type]}</div>
              </div>
              <div className="flex flex-wrap gap-1">
                <Button size="sm" variant="ghost" onClick={() => dispatchTemplatesActions.move(t.id, -1)} aria-label="Move up"><MoveUp className="h-3.5 w-3.5" /></Button>
                <Button size="sm" variant="ghost" onClick={() => dispatchTemplatesActions.move(t.id, 1)} aria-label="Move down"><MoveDown className="h-3.5 w-3.5" /></Button>
                <Button size="sm" variant="ghost" onClick={() => dispatchTemplatesActions.duplicate(t.id)}>Duplicate</Button>
                {t.archived
                  ? <Button size="sm" variant="ghost" onClick={() => dispatchTemplatesActions.restore(t.id)}>Restore</Button>
                  : <Button size="sm" variant="ghost" onClick={() => dispatchTemplatesActions.archive(t.id)}><Archive className="mr-1 h-3.5 w-3.5" />Archive</Button>}
              </div>
            </div>
            {t.expectedFlow && <div className="mt-1 text-xs text-muted-foreground"><strong>Flow:</strong> {t.expectedFlow}</div>}
            {t.notes && <div className="mt-1 text-xs text-muted-foreground"><strong>Notes:</strong> {t.notes}</div>}
          </div>
        ))}
      </div>

      <div className="mt-4 grid gap-2 rounded-md border border-border/40 p-3 sm:grid-cols-2">
        <Field label="New Template Name">
          <Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="e.g. After-Hours Vet Triage" />
        </Field>
        <Field label="Type">
          <Select value={draft.type} onValueChange={(v) => setDraft({ ...draft, type: v as DispatchTemplateType })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {(["routine","urgent","blank"] as DispatchTemplateType[]).map((k) => <SelectItem key={k} value={k}>{TEMPLATE_TYPE_LABEL[k]}</SelectItem>)}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Expected Flow" className="sm:col-span-2">
          <Textarea rows={2} value={draft.expectedFlow} onChange={(e) => setDraft({ ...draft, expectedFlow: e.target.value })} />
        </Field>
        <Field label="Notes" className="sm:col-span-2">
          <Textarea rows={2} value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} />
        </Field>
        <div className="sm:col-span-2">
          <Button onClick={() => {
            if (!draft.name.trim()) { toast.error("Name required."); return; }
            dispatchTemplatesActions.add(draft);
            setDraft({ name: "", type: "routine", expectedFlow: "", notes: "" });
            toast.success("Template added.");
          }}><Plus className="mr-1.5 h-4 w-4" /> Add Template</Button>
        </div>
      </div>
    </SectionCard>
  );
}

/* ---------------- Dropdowns ---------------- */
function DropdownsSection() {
  const state = useDropdowns();
  const [group, setGroup] = useState<DropdownGroup>("region");
  const [showArchived, setShowArchived] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const values = [...state[group]].sort((a, b) => a.order - b.order).filter((v) => showArchived || !v.archived);

  return (
    <SectionCard id="dropdowns" title="Dropdown Management" icon={ListChecks}>
      <div className="mb-3 grid gap-2 sm:grid-cols-[1fr_auto]">
        <Select value={group} onValueChange={(v) => setGroup(v as DropdownGroup)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {(Object.keys(DROPDOWN_LABEL) as DropdownGroup[]).map((g) => <SelectItem key={g} value={g}>{DROPDOWN_LABEL[g]}</SelectItem>)}
          </SelectContent>
        </Select>
        <label className="flex items-center gap-2 text-xs"><Switch checked={showArchived} onCheckedChange={setShowArchived} /> Show Archived</label>
      </div>

      <div className="space-y-1">
        {values.length === 0 && <div className="text-xs text-muted-foreground">No values.</div>}
        {values.map((v) => (
          <div key={v.id} className="flex items-center justify-between rounded-md border border-border/40 px-3 py-1.5 text-sm">
            <span className={v.archived ? "text-muted-foreground line-through" : "text-foreground"}>{v.label}</span>
            <div className="flex gap-1">
              {v.archived
                ? <Button size="sm" variant="ghost" onClick={() => dropdownsStore.update((s) => ({ ...s, [group]: s[group].map((x) => x.id === v.id ? { ...x, archived: false } : x) }))}>Restore</Button>
                : <Button size="sm" variant="ghost" onClick={() => dropdownsStore.update((s) => ({ ...s, [group]: s[group].map((x) => x.id === v.id ? { ...x, archived: true } : x) }))}><Archive className="h-3.5 w-3.5" /></Button>}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-3 flex gap-2">
        <Input value={newLabel} onChange={(e) => setNewLabel(e.target.value)} placeholder={`Add to ${DROPDOWN_LABEL[group]}`} />
        <Button onClick={() => {
          const label = newLabel.trim();
          if (!label) return;
          dropdownsStore.update((s) => ({
            ...s,
            [group]: [...s[group], { id: `${group}-${Date.now()}`, label, archived: false, order: s[group].length }],
          }));
          setNewLabel("");
          toast.success("Value added.");
        }}><Plus className="mr-1.5 h-4 w-4" /> Add</Button>
      </div>
      <p className="mt-2 text-[11px] text-muted-foreground">Used values can be archived, not deleted, so historical records stay readable.</p>
    </SectionCard>
  );
}

/* ---------------- Shift Settings ---------------- */
function ShiftSection() {
  const s = useShiftSettings();
  const [draft, setDraft] = useState(s);
  const [confirmOpen, setConfirmOpen] = useState(false);

  return (
    <SectionCard id="shift" title="Shift Settings" icon={Clock}>
      <div className="grid gap-3 sm:grid-cols-3">
        <TimeInput label="Shift Start" hour={draft.startHour} minute={draft.startMinute}
                   onChange={(h, m) => setDraft({ ...draft, startHour: h, startMinute: m })} />
        <TimeInput label="Shift End" hour={draft.endHour} minute={draft.endMinute}
                   onChange={(h, m) => setDraft({ ...draft, endHour: h, endMinute: m })} />
        <TimeInput label="Final Hour Start" hour={draft.finalHour} minute={draft.finalMinute}
                   onChange={(h, m) => setDraft({ ...draft, finalHour: h, finalMinute: m })} />
      </div>
      <div className="mt-2 text-xs text-muted-foreground">
        Current: {fmtHour(s.startHour, s.startMinute)} – {fmtHour(s.endHour, s.endMinute)} Central · Final hour at {fmtHour(s.finalHour, s.finalMinute)}.
      </div>
      <div className="mt-3 flex gap-2">
        <Button onClick={() => setConfirmOpen(true)}>Save Shift Settings</Button>
        <Button variant="ghost" onClick={() => setDraft(s)}>Reset</Button>
      </div>

      <ConfirmModal
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Save shift settings?"
        description="Changes affect the Date/Time Shift Card, Due Today window, Night Plan reset, Shift Summary, and final-hour reminders going forward. Historical shift keys are not rewritten."
        confirmLabel="Save"
        onConfirm={() => {
          shiftSettingsStore.set(draft);
          setConfirmOpen(false);
          toast.success("Shift settings saved.");
        }}
      />
    </SectionCard>
  );
}

function TimeInput({ label, hour, minute, onChange }: { label: string; hour: number; minute: number; onChange: (h: number, m: number) => void }) {
  return (
    <Field label={label}>
      <div className="flex gap-2">
        <Input type="number" min={0} max={23} value={hour} onChange={(e) => onChange(Math.max(0, Math.min(23, +e.target.value || 0)), minute)} />
        <Input type="number" min={0} max={59} value={minute} onChange={(e) => onChange(hour, Math.max(0, Math.min(59, +e.target.value || 0)))} />
      </div>
    </Field>
  );
}

/* ---------------- Display Preferences ---------------- */
function DisplaySection() {
  const p = useDisplayPrefs();
  return (
    <SectionCard id="display" title="Display Preferences" icon={Eye}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Shift Progress Display">
          <Select value={p.shiftProgress} onValueChange={(v) => displayPrefsStore.update((c) => ({ ...c, shiftProgress: v as typeof p.shiftProgress }))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ring">Ring</SelectItem>
              <SelectItem value="bar">Bar</SelectItem>
              <SelectItem value="both">Both</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field label="Sidebar Default">
          <Select value={p.sidebar} onValueChange={(v) => displayPrefsStore.update((c) => ({ ...c, sidebar: v as typeof p.sidebar }))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="expanded">Expanded</SelectItem>
              <SelectItem value="collapsed">Collapsed</SelectItem>
            </SelectContent>
          </Select>
        </Field>
      </div>
      <ToggleRow label="Freshdesk — Show Due Times by default" checked={p.freshdeskShowDueTimes}
                 onChange={(v) => displayPrefsStore.update((c) => ({ ...c, freshdeskShowDueTimes: v }))} />
      <ToggleRow label="Freshdesk — Show Priority by default" checked={p.freshdeskShowPriority}
                 onChange={(v) => displayPrefsStore.update((c) => ({ ...c, freshdeskShowPriority: v }))} />
      <ToggleRow
        label="Reduced Motion"
        description="Reduces particles, floating, and celebration intensity. Keeps the BlueVerse style."
        checked={p.motion === "reduced"}
        onChange={(v) => displayPrefsStore.update((c) => ({ ...c, motion: v ? "reduced" : "full" }))}
      />
    </SectionCard>
  );
}

function ToggleRow({ label, description, checked, onChange }: { label: string; description?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="mt-3 flex items-start gap-3 rounded-md border border-border/40 p-3">
      <Switch checked={checked} onCheckedChange={onChange} />
      <div className="text-xs">
        <div className="font-medium text-foreground">{label}</div>
        {description && <div className="text-muted-foreground">{description}</div>}
      </div>
    </div>
  );
}

/* ---------------- Data / Cleanup ---------------- */
function DataSection() {
  const demo = useDemoMode();
  const { tickets } = useTickets();
  const { sessions } = useDispatch();
  const { items: work } = useAdditionalWork();
  const { accounts } = useAccounts();
  const archived = nightPlanHistory.archived().length;
  const cleanup = nightPlanHistory.readyForCleanup().length;
  const [cleanupOpen, setCleanupOpen] = useState(false);

  return (
    <SectionCard id="data" title="Data / Cleanup Settings" icon={Database}>
      <ToggleRow
        label="Demo Mode"
        description="Show seeded demo records (Freshdesk tickets, accounts, dispatch sessions, etc). Real Freshdesk pulls are never hidden."
        checked={demo}
        onChange={setDemoMode}
      />

      <div className="mt-4 rounded-md border border-border/40 p-3">
        <div className="text-sm font-medium text-foreground">Night Plan Archive</div>
        <div className="mt-1 grid grid-cols-2 gap-2 text-xs text-muted-foreground">
          <div>Archived items (older than 30 days)<br /><span className="text-foreground">{archived}</span></div>
          <div>Ready for cleanup (older than 3 months)<br /><span className="text-foreground">{cleanup}</span></div>
        </div>
        <Button className="mt-2" variant="ghost" size="sm" disabled={cleanup === 0} onClick={() => setCleanupOpen(true)}>
          Review Night Plan Cleanup
        </Button>
      </div>

      <div className="mt-4 rounded-md border border-border/40 p-3">
        <div className="text-sm font-medium text-foreground">Hub Data Counts</div>
        <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-muted-foreground sm:grid-cols-3">
          <Count k="Freshdesk Tickets" v={tickets.length} />
          <Count k="Contact Dispatch Sessions" v={sessions.length} />
          <Count k="Additional Work" v={work.length} />
          <Count k="Accounts" v={accounts.length} />
          <Count k="Night Plan Archived" v={archived} />
        </div>
      </div>

      <ConfirmModal
        open={cleanupOpen}
        onOpenChange={setCleanupOpen}
        title="Delete archived Night Plan items?"
        description={`Permanently removes ${cleanup} Night Plan items older than 3 months. This does not affect Freshdesk, Contact Dispatch, Additional Work, or Account Timeline.`}
        confirmLabel={`Delete ${cleanup}`}
        tone="danger"
        onConfirm={() => {
          const ids = nightPlanHistory.readyForCleanup().map((i) => i.id);
          nightPlanHistory.delete(ids);
          setCleanupOpen(false);
          toast.success(`Removed ${ids.length} archived Night Plan items.`);
        }}
      />
    </SectionCard>
  );
}

function Count({ k, v }: { k: string; v: number }) {
  return <div><span className="text-foreground tabular-nums">{v}</span> {k}</div>;
}

/* ---------------- helpers ---------------- */
function SectionCard({ id, title, icon: Icon, children }: { id: string; title: string; icon: typeof Plug; children: React.ReactNode }) {
  return (
    <section id={id} className="glass-panel p-4 sm:p-5 scroll-mt-20">
      <div className="mb-3 flex items-center gap-2">
        <span className="grid h-8 w-8 place-items-center rounded-lg"
          style={{ background: "linear-gradient(135deg, var(--cyan-glow), var(--electric))", boxShadow: "var(--shadow-glow-cyan)" }}>
          <Icon className="h-4 w-4 text-background" />
        </span>
        <h2 className="text-base font-semibold text-foreground">{title}</h2>
      </div>
      {children}
    </section>
  );
}

function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={`block text-xs ${className ?? ""}`}>
      <span className="mb-1 block text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}