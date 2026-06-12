import { useMemo, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { z } from "zod";
import {
  FileText, Ticket as TicketIcon, PhoneOutgoing, ClipboardList,
  Building2, Mail, AlertTriangle, ListChecks, ChevronDown, ChevronRight,
  Copy, Download, Send, RotateCcw, History, CheckCircle2, Search,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useTickets, ticketsStore, STATUS_LABEL, type IssueClassification } from "@/lib/tickets-store";
import { useDispatch, DISPATCH_STATUS_LABEL, computeReadiness, buildDispatchSummary } from "@/lib/dispatch-store";
import { useAdditionalWork, additionalWorkStore } from "@/lib/additional-work-store";
import { useAccounts, accountsStore } from "@/lib/accounts-store";
import { formatCentralShort } from "@/lib/shift";
import { currentShiftWindow, windowFromRange, shiftLabelFromKey, type ShiftWindow } from "@/lib/reports/shift-window";
import { buildEmail, getAttentionCandidates, SECTION_KEYS } from "@/lib/reports/prog-email-format";
import { progEmailStore, useProgEmail } from "@/lib/reports/programming-email-store";
import { useRecurringRows, recurringStore } from "@/lib/reports/recurring-issues";
import { nightPlanHistory, useNightPlanHistory } from "@/lib/reports/night-plan-history";

const reportSchema = z.object({
  r: z.enum(["ticket-history","dispatch-status","add-work","account-history","prog-email","recurring","night-plan"]).optional().catch(undefined),
  window: z.enum(["current","custom"]).optional().catch(undefined),
  from: z.string().optional().catch(undefined),
  to: z.string().optional().catch(undefined),
});

export const Route = createFileRoute("/_authenticated/reports")({
  head: () => ({ meta: [{ title: "Reports — Account Intel Hub" }] }),
  validateSearch: (s: Record<string, unknown>) => reportSchema.parse(s),
  component: ReportsPage,
});

type ReportKey = NonNullable<z.infer<typeof reportSchema>["r"]>;

const REPORTS: { key: ReportKey; title: string; purpose: string; icon: typeof TicketIcon; color: string }[] = [
  { key: "ticket-history",   title: "Freshdesk Ticket Work History", purpose: "Completed and worked Freshdesk tickets.",        icon: TicketIcon,    color: "var(--cyan-glow)" },
  { key: "dispatch-status",  title: "Contact Dispatch Testing Status", purpose: "Review Contact Dispatch testing sessions.",   icon: PhoneOutgoing, color: "var(--violet-glow)" },
  { key: "add-work",         title: "Additional Work History",       purpose: "Ad hoc, non-Freshdesk work history.",            icon: ClipboardList, color: "var(--gold-glow)" },
  { key: "account-history",  title: "Account History / Issues",      purpose: "All work tied to a single account.",             icon: Building2,     color: "var(--electric)" },
  { key: "prog-email",       title: "Programming Status Email",      purpose: "Generate the shift programming status email.",   icon: Mail,          color: "var(--cyan-glow)" },
  { key: "recurring",        title: "Recurring Issues — Last 6 mo",  purpose: "Accounts with recurring scripting issues.",      icon: AlertTriangle, color: "oklch(0.72 0.22 25)" },
  { key: "night-plan",       title: "Night Plan History",            purpose: "Past Night Plan items and shift history.",       icon: ListChecks,    color: "var(--green-glow)" },
];

function ReportsPage() {
  const search = Route.useSearch();
  const nav = useNavigate({ from: "/reports" });
  const active = search.r;

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-5">
      <Header />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {REPORTS.map((r) => (
          <ReportCard key={r.key} report={r} active={active === r.key}
            onOpen={() => nav({ search: () => ({ r: r.key }) })} />
        ))}
      </div>
      {active && <div className="mt-2"><ActiveReport reportKey={active} search={search} /></div>}
    </div>
  );
}

function Header() {
  return (
    <div className="glass-panel flex items-center gap-4 p-5">
      <div className="grid h-12 w-12 place-items-center rounded-2xl"
        style={{
          background: "linear-gradient(135deg, oklch(0.78 0.18 220 / 0.4), oklch(0.7 0.22 295 / 0.4))",
          boxShadow: "var(--shadow-glow-cyan)",
        }}>
        <FileText className="h-5 w-5 text-white" />
      </div>
      <div>
        <h1 className="text-xl font-semibold text-foreground">Reports</h1>
        <p className="text-sm text-muted-foreground">
          Review shift work, account history, recurring issues, and programming summaries.
        </p>
      </div>
    </div>
  );
}

function ReportCard({ report, active, onOpen }: { report: (typeof REPORTS)[number]; active: boolean; onOpen: () => void }) {
  const Icon = report.icon;
  return (
    <button onClick={onOpen}
      className="glass-panel relative flex flex-col gap-3 p-4 text-left transition hover:bg-white/[0.04]"
      style={active ? { boxShadow: `0 0 18px ${report.color}, inset 0 0 0 1px ${report.color}` } : undefined}>
      <div className="flex items-center gap-3">
        <div className="grid h-10 w-10 place-items-center rounded-xl"
          style={{ background: `linear-gradient(135deg, ${report.color}, oklch(0.4 0.18 290 / 0.7))`, boxShadow: `0 0 12px ${report.color}` }}>
          <Icon className="h-5 w-5 text-white" />
        </div>
        <div className="text-sm font-semibold text-foreground">{report.title}</div>
      </div>
      <div className="text-xs text-muted-foreground">{report.purpose}</div>
      <div className="mt-1 text-[11px] uppercase tracking-wider" style={{ color: report.color }}>
        {active ? "Open" : "Open Report →"}
      </div>
    </button>
  );
}

function ActiveReport({ reportKey, search }: { reportKey: ReportKey; search: z.infer<typeof reportSchema> }) {
  switch (reportKey) {
    case "ticket-history":   return <FreshdeskHistoryReport />;
    case "dispatch-status":  return <DispatchStatusReport />;
    case "add-work":         return <AddWorkHistoryReport />;
    case "account-history":  return <AccountHistoryReport />;
    case "prog-email":       return <ProgEmailReport initialWindow={search.window} from={search.from} to={search.to} />;
    case "recurring":        return <RecurringIssuesReport />;
    case "night-plan":       return <NightPlanHistoryReport />;
  }
}

/* ----------------------- Shared bits ----------------------- */

function ReportShell({ title, children, actions }: { title: string; children: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className="glass-panel p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-foreground">{title}</h2>
        <div className="flex gap-2">{actions}</div>
      </div>
      {children}
    </div>
  );
}

function Chip({ children, color }: { children: React.ReactNode; color?: string }) {
  return (
    <span className="rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wider"
      style={{ borderColor: (color ?? "var(--cyan-glow)") + "55", color: color ?? "var(--cyan-glow)" }}>
      {children}
    </span>
  );
}

const STATUS_COLOR: Record<string, string> = {
  "Completed": "var(--green-glow)",
  "Currently Working On": "var(--cyan-glow)",
  "Waiting on Customer Service": "var(--gold-glow)",
  "Waiting on Programming": "var(--violet-glow)",
};

function copyText(text: string, label = "Copied") {
  navigator.clipboard.writeText(text).then(() => toast.success(label));
}

function exportPlaceholder() {
  toast.message("Export available in a later phase.");
}

/* ----------------------- Filter primitives ----------------------- */
function RangeFilter({ days, onChange }: { days: number; onChange: (d: number) => void }) {
  return (
    <div className="flex items-center gap-1">
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Range</span>
      {[7, 30, 90, 180].map((d) => (
        <button key={d} onClick={() => onChange(d)}
          className="rounded-md border border-border/40 px-2 py-1 text-xs"
          style={days === d ? { background: "oklch(0.78 0.18 220 / 0.18)", borderColor: "var(--cyan-glow)", color: "var(--cyan-glow)" } : undefined}>
          {d}d
        </button>
      ))}
    </div>
  );
}

function ExpandableSection({ title, children, openByDefault = false }: { title: React.ReactNode; children: React.ReactNode; openByDefault?: boolean }) {
  const [open, setOpen] = useState(openByDefault);
  return (
    <div className="rounded-md border border-border/30 bg-white/[0.02]">
      <button onClick={() => setOpen((s) => !s)} className="flex w-full items-center justify-between gap-2 p-3 text-left">
        <div className="min-w-0 flex-1 text-sm">{title}</div>
        {open ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
      </button>
      {open && <div className="border-t border-border/30 p-3 text-sm">{children}</div>}
    </div>
  );
}

/* ----------------------- Report 1 ----------------------- */
function FreshdeskHistoryReport() {
  const { tickets } = useTickets();
  const [days, setDays] = useState(30);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<string>("all");
  const [cls, setCls] = useState<string>("all");
  const cutoff = Date.now() - days * 86_400_000;

  const rows = useMemo(() => {
    return tickets
      .filter((t) => (t.completedAt ?? t.updatedAt) >= cutoff)
      .filter((t) => status === "all" ? true : t.status === status)
      .filter((t) => cls === "all" ? true : (t.issueClassification ?? "") === cls)
      .filter((t) => {
        if (!q.trim()) return true;
        const s = q.toLowerCase();
        return t.number.includes(s) || t.accountNumber.includes(s) || t.accountName.toLowerCase().includes(s);
      })
      .sort((a, b) => (b.completedAt ?? b.updatedAt) - (a.completedAt ?? a.updatedAt));
  }, [tickets, cutoff, status, cls, q]);

  return (
    <ReportShell title="Freshdesk Ticket Work History"
      actions={<><Button size="sm" variant="ghost" onClick={() => copyText(rows.map(r => `#${r.number} ${r.accountNumber} ${r.accountName}`).join("\n"), "Report copied")}><Copy className="mr-1 h-3.5 w-3.5" />Copy</Button>
        <Button size="sm" variant="ghost" onClick={exportPlaceholder}><Download className="mr-1 h-3.5 w-3.5" />Export</Button></>}>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <RangeFilter days={days} onChange={setDays} />
        <select className="rounded-md border border-border/40 bg-background/50 px-2 py-1 text-xs" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="all">All statuses</option>
          <option value="working">Currently Working On</option>
          <option value="waiting-cs">Waiting on CS</option>
          <option value="waiting-prog">Waiting on Programming</option>
          <option value="completed">Completed</option>
        </select>
        <select className="rounded-md border border-border/40 bg-background/50 px-2 py-1 text-xs" value={cls} onChange={(e) => setCls(e.target.value)}>
          <option value="all">All classifications</option>
          <option value="Scripting Issue">Scripting Issue</option>
          <option value="Client Change">Client Change</option>
          <option value="Other">Other</option>
        </select>
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ticket # or account…" className="h-7 max-w-[200px] text-xs" />
        <span className="ml-auto text-xs text-muted-foreground">{rows.length} item{rows.length === 1 ? "" : "s"}</span>
      </div>
      <div className="space-y-2">
        {rows.length === 0 && <Empty label="No tickets match the current filters." />}
        {rows.map((t) => {
          const session = ticketsStore.getSession(t.id);
          return (
            <ExpandableSection key={t.id} title={
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium text-foreground tabular-nums">#{t.number}</span>
                <span className="text-muted-foreground">·</span>
                <span className="text-foreground">{t.accountNumber} {t.accountName}</span>
                <Chip color={STATUS_COLOR[STATUS_LABEL[t.status]]}>{STATUS_LABEL[t.status]}</Chip>
                {t.issueClassification && <Chip color="var(--violet-glow)">{t.issueClassification}</Chip>}
                <span className="ml-auto text-[11px] text-muted-foreground">
                  {t.completedAt ? `Completed ${formatCentralShort(new Date(t.completedAt))}` : `Updated ${formatCentralShort(new Date(t.updatedAt))}`}
                </span>
              </div>
            }>
              <div className="grid gap-2 text-xs">
                <Row label="Ticket Issue">{session.issueText || t.details.subject || "—"}</Row>
                <Row label="Changes Made">{session.changesText || "—"}</Row>
                <Row label="Result / Testing">{session.resultNotes || "—"}</Row>
                {session.failureReason && <Row label="Failure Reason">{session.failureReason}</Row>}
                {session.waitingReason && <Row label="Waiting Reason">{session.waitingReason}</Row>}
                {session.generatedNote && <Row label="Latest Generated Note"><pre className="whitespace-pre-wrap text-foreground/80">{session.generatedNote}</pre></Row>}
                {session.notePostedAt && <Row label="Posted">{formatCentralShort(new Date(session.notePostedAt))}</Row>}
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <Link to="/freshdesk-tickets/$ticketId/work" params={{ ticketId: t.id }}>
                  <Button size="sm" variant="ghost">Open Ticket</Button>
                </Link>
                <Link to="/accounts/$accountNumber" params={{ accountNumber: t.accountNumber }}>
                  <Button size="sm" variant="ghost">Open Account</Button>
                </Link>
                {session.generatedNote && (
                  <Button size="sm" variant="ghost" onClick={() => copyText(session.generatedNote, "Note copied")}>
                    <Copy className="mr-1 h-3.5 w-3.5" />Copy Generated Note
                  </Button>
                )}
              </div>
            </ExpandableSection>
          );
        })}
      </div>
    </ReportShell>
  );
}

/* ----------------------- Report 2 ----------------------- */
function DispatchStatusReport() {
  const { sessions } = useDispatch();
  const [days, setDays] = useState(30);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<string>("all");
  const cutoff = Date.now() - days * 86_400_000;

  const rows = useMemo(() => {
    return sessions
      .filter((s) => (s.completedAt ?? s.updatedAt) >= cutoff)
      .filter((s) => status === "all" ? true : (s.status ?? "") === status)
      .filter((s) => {
        if (!q.trim()) return true;
        const t = q.toLowerCase();
        return s.accountNumber.includes(t) || s.accountName.toLowerCase().includes(t) || (s.ticketNumber ?? "").includes(t);
      })
      .sort((a, b) => (b.completedAt ?? b.updatedAt) - (a.completedAt ?? a.updatedAt));
  }, [sessions, cutoff, status, q]);

  return (
    <ReportShell title="Contact Dispatch Testing Status"
      actions={<Button size="sm" variant="ghost" onClick={exportPlaceholder}><Download className="mr-1 h-3.5 w-3.5" />Export</Button>}>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <RangeFilter days={days} onChange={setDays} />
        <select className="rounded-md border border-border/40 bg-background/50 px-2 py-1 text-xs" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="all">All statuses</option>
          <option value="ready">Ready for Activation</option>
          <option value="waiting-cs">Waiting CS Review</option>
          <option value="waiting-prog">Waiting Programming Review</option>
          <option value="not-ready">Not Ready</option>
        </select>
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Account or ticket #…" className="h-7 max-w-[200px] text-xs" />
        <span className="ml-auto text-xs text-muted-foreground">{rows.length} session{rows.length === 1 ? "" : "s"}</span>
      </div>
      <div className="space-y-2">
        {rows.length === 0 && <Empty label="No dispatch sessions match." />}
        {rows.map((s) => {
          const r = computeReadiness(s);
          const last = s.summaryVersions[0];
          return (
            <ExpandableSection key={s.id} title={
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-foreground">{s.accountNumber} {s.accountName}</span>
                {s.status && <Chip color="var(--violet-glow)">{DISPATCH_STATUS_LABEL[s.status]}</Chip>}
                <Chip>{r.percent}%</Chip>
                {s.ticketNumber && <Chip color="var(--cyan-glow)">Ticket #{s.ticketNumber}</Chip>}
                <span className="ml-auto text-[11px] text-muted-foreground">
                  {s.completedAt ? `Completed ${formatCentralShort(new Date(s.completedAt))}` : `Updated ${formatCentralShort(new Date(s.updatedAt))}`}
                </span>
              </div>
            }>
              <div className="grid gap-2 text-xs">
                <Row label="Reasons">{s.reasons.map((r) => r.text || "(untitled)").join(" / ") || "—"}</Row>
                <Row label="Phone Field">{s.phone.status}</Row>
                <Row label="Repeat Caller">{s.repeat.status}</Row>
                <Row label="Save / Message Summary">{s.saveSummary.status}</Row>
                {s.statusReason && <Row label="Review / Not Ready Reason">{s.statusReason}</Row>}
                {last && <Row label="Latest Summary"><pre className="whitespace-pre-wrap text-foreground/80">{last.body}</pre></Row>}
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <Link to="/contact-dispatch/$sessionId/work" params={{ sessionId: s.id }}>
                  <Button size="sm" variant="ghost">Open Testing</Button>
                </Link>
                <Link to="/accounts/$accountNumber" params={{ accountNumber: s.accountNumber }}>
                  <Button size="sm" variant="ghost">Open Account</Button>
                </Link>
                {last && (
                  <Button size="sm" variant="ghost" onClick={() => copyText(buildDispatchSummary(s), "Summary copied")}>
                    <Copy className="mr-1 h-3.5 w-3.5" />Copy Summary
                  </Button>
                )}
              </div>
            </ExpandableSection>
          );
        })}
      </div>
    </ReportShell>
  );
}

/* ----------------------- Report 3 ----------------------- */
function AddWorkHistoryReport() {
  const { items } = useAdditionalWork();
  const [days, setDays] = useState(30);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<string>("all");
  const cutoff = Date.now() - days * 86_400_000;
  const rows = useMemo(() => {
    return items
      .filter((a) => (a.completedAt ?? a.updatedAt) >= cutoff)
      .filter((a) => status === "all" ? true : a.status === status)
      .filter((a) => {
        if (!q.trim()) return true;
        const t = q.toLowerCase();
        return a.title.toLowerCase().includes(t) || (a.accountNumber ?? "").includes(t) || (a.accountName ?? "").toLowerCase().includes(t);
      })
      .sort((a, b) => (b.completedAt ?? b.updatedAt) - (a.completedAt ?? a.updatedAt));
  }, [items, cutoff, status, q]);

  return (
    <ReportShell title="Additional Work History"
      actions={<Button size="sm" variant="ghost" onClick={exportPlaceholder}><Download className="mr-1 h-3.5 w-3.5" />Export</Button>}>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <RangeFilter days={days} onChange={setDays} />
        <select className="rounded-md border border-border/40 bg-background/50 px-2 py-1 text-xs" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="all">All statuses</option>
          <option value="working">Currently Working On</option>
          <option value="completed">Completed</option>
        </select>
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Title or account…" className="h-7 max-w-[200px] text-xs" />
        <span className="ml-auto text-xs text-muted-foreground">{rows.length} item{rows.length === 1 ? "" : "s"}</span>
      </div>
      <div className="space-y-2">
        {rows.length === 0 && <Empty label="No additional work matches." />}
        {rows.map((a) => (
          <ExpandableSection key={a.id} title={
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-foreground">{a.title}</span>
              {a.accountNumber && <Chip color="var(--cyan-glow)">{a.accountNumber} {a.accountName}</Chip>}
              <Chip color={a.status === "completed" ? "var(--green-glow)" : "var(--cyan-glow)"}>
                {a.status === "completed" ? "Completed" : "Currently Working On"}
              </Chip>
              {a.issueClassification && <Chip color="var(--violet-glow)">{a.issueClassification}</Chip>}
              <span className="ml-auto text-[11px] text-muted-foreground">
                {a.completedAt ? `Completed ${formatCentralShort(new Date(a.completedAt))}` : `Updated ${formatCentralShort(new Date(a.updatedAt))}`}
              </span>
            </div>
          }>
            <div className="grid gap-2 text-xs">
              <Row label="What needs done">{a.whatNeedsDone || "—"}</Row>
              {a.completionSummary && <Row label="Completion Summary">{a.completionSummary}</Row>}
              {a.notes && <Row label="Notes">{a.notes}</Row>}
              {a.programmingStatusNotes && <Row label="Programming Status Notes">{a.programmingStatusNotes}</Row>}
              {a.snips.length > 0 && <Row label="Snips">{a.snips.length}</Row>}
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <Link to="/additional-work/$workId/work" params={{ workId: a.id }}>
                <Button size="sm" variant="ghost">Open Work</Button>
              </Link>
              {a.accountNumber && (
                <Link to="/accounts/$accountNumber" params={{ accountNumber: a.accountNumber }}>
                  <Button size="sm" variant="ghost">Open Account</Button>
                </Link>
              )}
              {a.programmingStatusNotes && (
                <Button size="sm" variant="ghost" onClick={() => copyText(a.programmingStatusNotes, "Notes copied")}>
                  <Copy className="mr-1 h-3.5 w-3.5" />Copy Programming Status Notes
                </Button>
              )}
            </div>
          </ExpandableSection>
        ))}
      </div>
    </ReportShell>
  );
}

/* ----------------------- Report 4 ----------------------- */
function AccountHistoryReport() {
  useAccounts();
  const { tickets } = useTickets();
  const { sessions } = useDispatch();
  const { items: works } = useAdditionalWork();
  const [q, setQ] = useState("");
  const results = q.trim() ? accountsStore.search(q, { includeArchived: true }) : accountsStore.getRecent();

  return (
    <ReportShell title="Account History / Issues by Account">
      <div className="mb-3 flex items-center gap-2">
        <Search className="h-4 w-4 text-muted-foreground" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search account number or name…" className="h-8 max-w-[280px] text-xs" />
        <span className="ml-auto text-xs text-muted-foreground">{results.length} account{results.length === 1 ? "" : "s"}</span>
      </div>
      <div className="space-y-2">
        {results.length === 0 && <Empty label="No accounts. Search by number or name." />}
        {results.map((a) => {
          const fd = tickets.filter((t) => t.accountNumber === a.number);
          const cd = sessions.filter((s) => s.accountNumber === a.number);
          const aw = works.filter((w) => w.accountNumber === a.number);
          const notes = accountsStore.notesFor(a.number);
          const lastActivity = Math.max(
            ...fd.map((t) => t.updatedAt),
            ...cd.map((s) => s.updatedAt),
            ...aw.map((w) => w.updatedAt),
            ...notes.map((n) => n.createdAt),
            0,
          );
          return (
            <ExpandableSection key={a.number} title={
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium text-foreground">{a.number}</span>
                <span className="text-foreground">{a.name}</span>
                <Chip color={a.status === "active" ? "var(--green-glow)" : "var(--gold-glow)"}>{a.status}</Chip>
                <Chip color="var(--cyan-glow)">FD {fd.length}</Chip>
                <Chip color="var(--violet-glow)">CD {cd.length}</Chip>
                <Chip color="var(--gold-glow)">AW {aw.length}</Chip>
                <Chip>Notes {notes.length}</Chip>
                {lastActivity > 0 && <span className="ml-auto text-[11px] text-muted-foreground">Last activity {formatCentralShort(new Date(lastActivity))}</span>}
              </div>
            }>
              <Group title="Freshdesk">
                {fd.length === 0 && <Empty label="No Freshdesk tickets." compact />}
                {fd.map((t) => (
                  <RecordRow key={t.id} label={`#${t.number} — ${t.details.subject || t.accountName}`} when={t.updatedAt}>
                    <Link to="/freshdesk-tickets/$ticketId/work" params={{ ticketId: t.id }}><Button size="sm" variant="ghost">Open</Button></Link>
                  </RecordRow>
                ))}
              </Group>
              <Group title="Contact Dispatch">
                {cd.length === 0 && <Empty label="No dispatch sessions." compact />}
                {cd.map((s) => (
                  <RecordRow key={s.id} label={s.status ? DISPATCH_STATUS_LABEL[s.status] : "(in progress)"} when={s.updatedAt}>
                    <Link to="/contact-dispatch/$sessionId/work" params={{ sessionId: s.id }}><Button size="sm" variant="ghost">Open</Button></Link>
                  </RecordRow>
                ))}
              </Group>
              <Group title="Additional Work">
                {aw.length === 0 && <Empty label="No additional work." compact />}
                {aw.map((w) => (
                  <RecordRow key={w.id} label={w.title} when={w.updatedAt}>
                    <Link to="/additional-work/$workId/work" params={{ workId: w.id }}><Button size="sm" variant="ghost">Open</Button></Link>
                  </RecordRow>
                ))}
              </Group>
              <Group title="Account Notes">
                {notes.length === 0 && <Empty label="No account notes." compact />}
                {notes.map((n) => (
                  <div key={n.id} className="rounded-md border border-border/30 bg-white/[0.02] p-2 text-xs">
                    <div className="text-foreground/90">{n.text}</div>
                    <div className="mt-1 text-[10px] text-muted-foreground">{n.initials} · {formatCentralShort(new Date(n.createdAt))}</div>
                  </div>
                ))}
              </Group>
              <div className="mt-3 flex gap-2">
                <Link to="/accounts/$accountNumber" params={{ accountNumber: a.number }}><Button size="sm" variant="ghost">Open Account Profile</Button></Link>
                <Button size="sm" variant="ghost" onClick={exportPlaceholder}><Download className="mr-1 h-3.5 w-3.5" />Export Account History</Button>
              </div>
            </ExpandableSection>
          );
        })}
      </div>
    </ReportShell>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-3">
      <div className="mb-1 text-[10px] uppercase tracking-wider text-muted-foreground">{title}</div>
      <div className="space-y-1">{children}</div>
    </div>
  );
}
function RecordRow({ label, when, children }: { label: string; when: number; children?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-md border border-border/30 bg-white/[0.02] p-2 text-xs">
      <div className="min-w-0 flex-1 truncate text-foreground">{label}</div>
      <div className="text-[10px] text-muted-foreground">{formatCentralShort(new Date(when))}</div>
      {children}
    </div>
  );
}

/* ----------------------- Report 5: Programming Status Email ----------------------- */
function ProgEmailReport({ initialWindow, from, to }: { initialWindow?: string; from?: string; to?: string }) {
  useProgEmail();
  const [window, setWindow] = useState<ShiftWindow | null>(() => {
    if (initialWindow === "custom" && from && to) return windowFromRange(from, to);
    if (initialWindow === "current") return currentShiftWindow();
    return null;
  });
  const [setupOpen, setSetupOpen] = useState(window === null);
  const [body, setBody] = useState("");
  const [draftId, setDraftId] = useState<string | null>(null);
  const [versionsOpen, setVersionsOpen] = useState(false);
  const [markSentOpen, setMarkSentOpen] = useState(false);

  const candidates = useMemo(() => getAttentionCandidates(), []);
  const draft = draftId ? progEmailStore.get(draftId) : undefined;

  const attentionIds = draft?.attentionIds ?? [];
  const hiddenSections = draft?.hiddenSectionKeys ?? [];

  const regenerate = () => {
    if (!window) return;
    const d = draftId ? progEmailStore.get(draftId) : progEmailStore.findOrCreate(window);
    if (!d) return;
    setDraftId(d.id);
    const result = buildEmail({ window, attentionIds: d.attentionIds, hiddenSectionKeys: d.hiddenSectionKeys });
    setBody(result.body);
    progEmailStore.saveVersion(d.id, "Generated", result.body);
    if (result.warnings.length) {
      toast.warning(`${result.warnings.length} item(s) missing details — preview shows "(none documented)".`);
    }
  };

  const choose = (w: ShiftWindow) => {
    setWindow(w);
    const d = progEmailStore.findOrCreate(w);
    setDraftId(d.id);
    const result = buildEmail({ window: w, attentionIds: d.attentionIds, hiddenSectionKeys: d.hiddenSectionKeys });
    setBody(result.body);
    if (d.versions.length === 0) progEmailStore.saveVersion(d.id, "Generated", result.body);
    setSetupOpen(false);
  };

  const toggleAttention = (id: string) => {
    if (!draft) return;
    const has = attentionIds.includes(id);
    progEmailStore.setAttention(draft.id, has ? attentionIds.filter((x) => x !== id) : [...attentionIds, id]);
  };

  if (!window) {
    return (
      <ReportShell title="Programming Status Email Generator">
        <Empty label="Choose a shift window to begin." />
        <div className="mt-3"><Button onClick={() => setSetupOpen(true)} variant="ghost">Open Setup</Button></div>
        <SetupModal open={setupOpen} onOpenChange={setSetupOpen} onChoose={choose} />
      </ReportShell>
    );
  }

  return (
    <ReportShell title="Programming Status Email Generator" actions={
      <>
        <Button size="sm" variant="ghost" onClick={() => setSetupOpen(true)}><RotateCcw className="mr-1 h-3.5 w-3.5" />Change Window</Button>
        <Button size="sm" variant="ghost" onClick={() => setVersionsOpen(true)}><History className="mr-1 h-3.5 w-3.5" />History ({draft?.versions.length ?? 0})</Button>
      </>
    }>
      <div className="mb-3 rounded-md border border-border/40 bg-white/[0.02] p-3 text-xs">
        <div className="font-medium text-foreground">Shift: {window.label}</div>
        <div className="text-muted-foreground">Window: {window.timeLabel}</div>
      </div>

      <div className="grid gap-4 md:grid-cols-[1fr_2fr]">
        <div className="space-y-3">
          <div>
            <div className="mb-1 text-[10px] uppercase tracking-wider text-muted-foreground">Sections</div>
            <div className="space-y-1">
              {(Object.entries(SECTION_KEYS) as [keyof typeof SECTION_KEYS, string][]).map(([k, v]) => (
                <label key={k} className="flex items-center gap-2 rounded-md border border-border/30 bg-white/[0.02] p-2 text-xs">
                  <input type="checkbox" checked={!hiddenSections.includes(k)}
                    onChange={() => draft && progEmailStore.toggleSectionHidden(draft.id, k)} />
                  <span className="text-foreground">{v}</span>
                </label>
              ))}
            </div>
          </div>
          <div>
            <div className="mb-1 text-[10px] uppercase tracking-wider text-muted-foreground">Items Needing Attention</div>
            <div className="max-h-72 space-y-1 overflow-y-auto pr-1">
              {candidates.length === 0 && <Empty label="No active items to flag." compact />}
              {candidates.map((c) => (
                <label key={c.id} className="flex items-start gap-2 rounded-md border border-border/30 bg-white/[0.02] p-2 text-xs">
                  <input type="checkbox" className="mt-0.5" checked={attentionIds.includes(c.id)} onChange={() => toggleAttention(c.id)} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-foreground">{c.label}</div>
                    <div className="truncate text-[10px] text-muted-foreground">{c.sub}</div>
                  </div>
                </label>
              ))}
            </div>
            <div className="mt-1 text-[10px] text-muted-foreground">
              Selecting a Night Plan item places it under Additional Work and does not convert it.
            </div>
          </div>
          <Button size="sm" variant="ghost" onClick={regenerate} className="w-full">
            <RotateCcw className="mr-1 h-3.5 w-3.5" />Regenerate
          </Button>
        </div>

        <div>
          <Textarea rows={26} value={body} onChange={(e) => {
            setBody(e.target.value);
            if (draft) progEmailStore.saveVersion(draft.id, "User Edited", e.target.value);
          }} className="font-mono text-xs" />
          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" variant="ghost" onClick={() => copyText(body, "Email copied")}><Copy className="mr-1 h-3.5 w-3.5" />Copy Email</Button>
            <Button size="sm" variant="ghost" onClick={() => copyText(body.replace(/\u00a0/g, " "), "Plain text copied")}><Copy className="mr-1 h-3.5 w-3.5" />Copy Plain Text</Button>
            <Button size="sm" variant="ghost" onClick={() => { if (draft) { progEmailStore.saveVersion(draft.id, "User Edited", body); toast.success("Draft saved."); } }}>
              Save Draft in Hub
            </Button>
            <Button size="sm" onClick={() => setMarkSentOpen(true)}
              style={{ background: "linear-gradient(110deg, oklch(0.4 0.16 240 / 0.7), oklch(0.4 0.18 290 / 0.55))", border: "1px solid oklch(0.78 0.18 220 / 0.5)" }}>
              <Send className="mr-1 h-3.5 w-3.5" />Mark Sent Manually
            </Button>
          </div>
        </div>
      </div>

      <SetupModal open={setupOpen} onOpenChange={setSetupOpen} onChoose={choose} />

      <Sheet open={versionsOpen} onOpenChange={setVersionsOpen}>
        <SheetContent side="right" className="glass-panel border-0 w-[460px] sm:max-w-[460px]">
          <SheetHeader><SheetTitle>Email Version History</SheetTitle></SheetHeader>
          <div className="mt-3 space-y-2">
            {draft?.versions.length === 0 && <Empty label="No versions yet." compact />}
            {draft?.versions.map((v) => (
              <div key={v.id} className="rounded-md border border-border/30 bg-white/[0.02] p-2 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-foreground">{v.label}</span>
                  <span className="text-[10px] text-muted-foreground">{formatCentralShort(new Date(v.createdAt))}</span>
                </div>
                <pre className="mt-2 max-h-32 overflow-y-auto whitespace-pre-wrap text-foreground/80">{v.body}</pre>
                <div className="mt-2 flex gap-2">
                  <Button size="sm" variant="ghost" onClick={() => { setBody(v.body); toast.success("Restored."); }}>Restore</Button>
                  <Button size="sm" variant="ghost" onClick={() => copyText(v.body, "Version copied")}><Copy className="mr-1 h-3.5 w-3.5" />Copy</Button>
                </div>
              </div>
            ))}
          </div>
        </SheetContent>
      </Sheet>

      <Dialog open={markSentOpen} onOpenChange={setMarkSentOpen}>
        <DialogContent className="glass-panel border-0 sm:max-w-md">
          <DialogHeader><DialogTitle>Mark this programming status email as sent manually?</DialogTitle></DialogHeader>
          <div className="space-y-2 text-sm text-muted-foreground">
            <p>This will:</p>
            <ul className="ml-4 list-disc space-y-1 text-xs">
              <li>mark the current email version as sent</li>
              <li>save sent timestamp in Central</li>
              <li>record initials as LTP</li>
              <li>keep version history inside the portal</li>
              <li>not send an email automatically</li>
            </ul>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setMarkSentOpen(false)}>Cancel</Button>
            <Button onClick={() => {
              if (draft) { progEmailStore.markSent(draft.id, body); toast.success("Marked sent."); setMarkSentOpen(false); }
            }}>Mark Sent</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ReportShell>
  );
}

function SetupModal({ open, onOpenChange, onChoose }: { open: boolean; onOpenChange: (v: boolean) => void; onChoose: (w: ShiftWindow) => void }) {
  const current = currentShiftWindow();
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="glass-panel border-0 sm:max-w-md">
        <DialogHeader><DialogTitle>Choose Email Window</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <button onClick={() => onChoose(current)} className="w-full rounded-lg border border-border/40 bg-white/[0.03] p-3 text-left hover:border-cyan-glow">
            <div className="text-sm font-medium text-foreground">Use Current Shift</div>
            <div className="text-xs text-muted-foreground">Shift: {current.label}</div>
            <div className="text-xs text-muted-foreground">Window: {current.timeLabel}</div>
          </button>
          <div className="rounded-lg border border-border/40 bg-white/[0.03] p-3">
            <div className="text-sm font-medium text-foreground">Custom Range</div>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <Input type="datetime-local" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="text-xs" />
              <Input type="datetime-local" value={toDate} onChange={(e) => setToDate(e.target.value)} className="text-xs" />
            </div>
            <Button size="sm" className="mt-2 w-full" variant="ghost"
              disabled={!fromDate || !toDate}
              onClick={() => onChoose(windowFromRange(new Date(fromDate).toISOString(), new Date(toDate).toISOString()))}>
              Use Custom Range
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ----------------------- Report 6 ----------------------- */
function RecurringIssuesReport() {
  const rows = useRecurringRows();
  return (
    <ReportShell title="Recurring Issues — Last 6 Months">
      <div className="space-y-2">
        {rows.length === 0 && <Empty label="No scripting issues recorded in the last 6 months." />}
        {rows.map((r) => {
          const critical = r.active;
          return (
            <ExpandableSection key={r.accountNumber} title={
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium text-foreground">{r.accountNumber}</span>
                <span className="text-foreground">{r.accountName}</span>
                <Chip color={critical ? "oklch(0.72 0.22 25)" : "var(--cyan-glow)"}>
                  {r.sixMonthCount} scripting · rolling {r.rollingCount}/30d
                </Chip>
                {critical && <Chip color="oklch(0.72 0.22 25)">Recurring Alert</Chip>}
                <span className="ml-auto text-[11px] text-muted-foreground">Last issue {formatCentralShort(new Date(r.lastIssueAt))}</span>
              </div>
            }>
              <div className="space-y-1">
                {r.tickets.map((t) => (
                  <RecordRow key={t.id} label={`#${t.number} — ${t.details.subject || "(no subject)"}  · ${t.issueClassification ?? ""}`} when={t.completedAt ?? t.updatedAt}>
                    <Link to="/freshdesk-tickets/$ticketId/work" params={{ ticketId: t.id }}><Button size="sm" variant="ghost">Open</Button></Link>
                  </RecordRow>
                ))}
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <Link to="/accounts/$accountNumber" params={{ accountNumber: r.accountNumber }}>
                  <Button size="sm" variant="ghost">Open Account Profile</Button>
                </Link>
                {critical && (
                  <Button size="sm" variant="ghost" onClick={() => { recurringStore.markReviewed(r.accountNumber); toast.success("Marked reviewed."); }}>
                    <CheckCircle2 className="mr-1 h-3.5 w-3.5" />Dismiss / Mark Reviewed
                  </Button>
                )}
              </div>
            </ExpandableSection>
          );
        })}
      </div>
    </ReportShell>
  );
}

/* ----------------------- Report 7 ----------------------- */
function NightPlanHistoryReport() {
  const items = useNightPlanHistory();
  const [filter, setFilter] = useState<"all"|"done"|"carried"|"dismissed"|"converted"|"archived">("all");
  const [q, setQ] = useState("");
  const [cleanupOpen, setCleanupOpen] = useState(false);

  const view = useMemo(() => {
    let list = items;
    if (filter === "archived") list = nightPlanHistory.archived();
    else if (filter !== "all") list = items.filter((i) => i.status === filter);
    else list = nightPlanHistory.recent();
    if (q.trim()) {
      const t = q.toLowerCase();
      list = list.filter((i) => i.task.toLowerCase().includes(t) || (i.notes ?? "").toLowerCase().includes(t));
      // when searching: flat list, annotate shift
      return { mode: "flat" as const, items: list };
    }
    return { mode: "grouped" as const, groups: nightPlanHistory.groupByShift(list) };
  }, [items, filter, q]);

  const cleanupCount = nightPlanHistory.readyForCleanup().length;

  return (
    <ReportShell title="Night Plan History" actions={
      cleanupCount > 0 ? <Button size="sm" variant="ghost" onClick={() => setCleanupOpen(true)}>Review Cleanup ({cleanupCount})</Button> : undefined
    }>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {(["all","done","carried","dismissed","converted","archived"] as const).map((f) => (
          <button key={f} onClick={() => setFilter(f)}
            className="rounded-md border border-border/40 px-2 py-1 text-xs capitalize"
            style={filter === f ? { background: "oklch(0.78 0.18 220 / 0.18)", borderColor: "var(--cyan-glow)", color: "var(--cyan-glow)" } : undefined}>
            {f === "carried" ? "Carried Over" : f === "converted" ? "Converted" : f}
          </button>
        ))}
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search past items…" className="h-7 max-w-[220px] text-xs" />
      </div>

      {view.mode === "grouped" ? (
        <div className="space-y-3">
          {view.groups.length === 0 && <Empty label="No Night Plan items in this view." />}
          {view.groups.map((g) => (
            <div key={g.shiftKey}>
              <div className="mb-1 text-[10px] uppercase tracking-wider text-muted-foreground">{shiftLabelFromKey(g.shiftKey)}</div>
              <div className="space-y-1">
                {g.items.map((i) => <NPItemRow key={i.id} item={i} />)}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-1">
          {view.items.length === 0 && <Empty label="No matches." />}
          {view.items.map((i) => (
            <div key={i.id}>
              <div className="mb-1 text-[10px] uppercase tracking-wider text-muted-foreground">{shiftLabelFromKey(i.shiftKey)}</div>
              <NPItemRow item={i} />
            </div>
          ))}
        </div>
      )}

      <Dialog open={cleanupOpen} onOpenChange={setCleanupOpen}>
        <DialogContent className="glass-panel border-0 sm:max-w-md">
          <DialogHeader><DialogTitle>Review Night Plan Cleanup</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">{cleanupCount} Night Plan item(s) are older than 3 months and ready for cleanup. Deleting only removes Night Plan history — Freshdesk, Contact Dispatch, Additional Work, and Account Timeline records are kept.</p>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCleanupOpen(false)}>Cancel</Button>
            <Button onClick={() => {
              nightPlanHistory.delete(nightPlanHistory.readyForCleanup().map((i) => i.id));
              toast.success("Old Night Plan history removed.");
              setCleanupOpen(false);
            }}>Delete {cleanupCount}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ReportShell>
  );
}

function NPItemRow({ item }: { item: ReturnType<typeof nightPlanHistory.getAll>[number] }) {
  const statusColor =
    item.status === "done" ? "var(--green-glow)" :
    item.status === "dismissed" ? "var(--gold-glow)" :
    item.status === "carried" ? "var(--cyan-glow)" : "var(--violet-glow)";
  return (
    <div className="rounded-md border border-border/30 bg-white/[0.02] p-2 text-xs">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-foreground">{item.task}</span>
        <Chip color={statusColor}>{item.status === "carried" ? "Carried Over" : item.status}</Chip>
        {item.status === "done" && item.completedAt && (
          <span className="text-[10px] text-muted-foreground">Completed {formatCentralShort(new Date(item.completedAt))}</span>
        )}
        {item.status === "carried" && item.carryTrail && (
          <span className="text-[10px] text-muted-foreground">{item.carryTrail.map(shiftLabelFromKey).join(" → ")}</span>
        )}
        {item.additionalWorkId && (
          <Link to="/additional-work/$workId/work" params={{ workId: item.additionalWorkId }} className="ml-auto">
            <Button size="sm" variant="ghost">Open Additional Work</Button>
          </Link>
        )}
      </div>
      {item.notes && <div className="mt-1 text-muted-foreground">{item.notes}</div>}
      <div className="mt-1 text-[10px] text-muted-foreground">Created {formatCentralShort(new Date(item.createdAt))}</div>
    </div>
  );
}

/* ----------------------- Misc ----------------------- */
function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[140px_1fr] gap-2">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="text-foreground/90">{children}</div>
    </div>
  );
}
function Empty({ label, compact }: { label: string; compact?: boolean }) {
  return (
    <div className={"rounded-md border border-dashed border-border/40 text-center text-xs text-muted-foreground " + (compact ? "p-2" : "p-6")}>
      {label}
    </div>
  );
}