import { useNavigate } from "@tanstack/react-router";
import { Timer, X } from "lucide-react";
import { awarenessStore } from "@/lib/core/awareness-store";
import { useAccountContext } from "@/lib/core/use-account-context";
import { NextBestActionCard } from "@/components/nba/NextBestActionCard";
import { WorkStateSection } from "@/components/nba/WorkStateSection";
import { GuardedPlanPanel } from "@/components/plan/GuardedPlanPanel";
import type { FocusAction, FocusItem, FocusWorkspaceState } from "@/lib/core/focus-workspace";

/**
 * Focus panel — a compact operational heads-up display over existing state.
 * Navigation and dismissal only; any future write must go through the
 * Phase 4 Safe Action Executor.
 */

const SEVERITY_CLASS: Record<string, string> = {
  critical: "focus-watch focus-watch--critical",
  warning: "focus-watch focus-watch--warning",
  info: "focus-watch focus-watch--info",
};

function ActionButtons({
  actions,
  onNavigate,
  onDone,
}: {
  actions: FocusAction[];
  onNavigate: (a: FocusAction) => void;
  onDone: () => void;
}) {
  if (!actions.length) return null;
  return (
    <div className="mt-1 flex flex-wrap gap-1">
      {actions.map((a) => (
        <button
          key={a.id}
          type="button"
          onClick={() => {
            if (a.kind === "dismiss" && a.dedupeKey) {
              awarenessStore.dismiss(a.dedupeKey);
              return;
            }
            onNavigate(a);
            onDone();
          }}
          className="rounded-full border border-border/40 px-2 py-0.5 text-[10px] text-muted-foreground transition hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          {a.label}
        </button>
      ))}
    </div>
  );
}

function Section({
  title,
  empty,
  children,
}: {
  title: string;
  empty?: string;
  children?: React.ReactNode;
}) {
  const has = Array.isArray(children) ? children.length > 0 : Boolean(children);
  return (
    <section aria-label={title} className="space-y-1">
      <h3 className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">{title}</h3>
      {has ? children : <p className="text-xs text-muted-foreground">{empty}</p>}
    </section>
  );
}

function AccountSummary({ accountNumber }: { accountNumber: string }) {
  // Bounded account facts only. Knowledge/hybrid retrieval stays query-driven.
  const { pack } = useAccountContext(accountNumber, {
    includeKnowledge: false,
    recentTicketLimit: 8,
  });
  if (!pack) return null;
  const activeTickets = pack.recentTickets.filter((t) => t.status !== "completed").length;
  const verified = pack.resolutions.filter(
    (r) => r.confidence === "verified" && r.status === "active",
  ).length;
  const coverage = pack.coverage?.onCallThrough
    ? `Coverage through ${pack.coverage.onCallThrough}`
    : undefined;
  return (
    <section aria-label="Account context" className="space-y-1">
      <h3 className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
        Account {pack.account.accountNumber}
      </h3>
      <ul className="space-y-0.5 text-xs text-muted-foreground">
        <li>{activeTickets} active ticket{activeTickets === 1 ? "" : "s"}</li>
        {verified > 0 && <li>{verified} verified resolution{verified === 1 ? "" : "s"} available</li>}
        {coverage && <li>{coverage}</li>}
      </ul>
    </section>
  );
}

export function FocusPanel({
  focus,
  onClose,
}: {
  focus: FocusWorkspaceState;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const go = (a: FocusAction) => {
    if (a.kind === "find_similar") {
      void navigate({ to: "/freshdesk-intelligence" });
      return;
    }
    if (!a.to) return;
    void navigate({ to: a.to as never, params: (a.params ?? {}) as never });
  };

  const row = (item: FocusItem) => (
    <div key={item.id} className={`rounded-md border border-border/30 p-2 ${SEVERITY_CLASS[item.severity]}`}>
      <p className="text-xs font-medium text-foreground">{item.label}</p>
      {item.detail && <p className="text-[11px] text-muted-foreground">{item.detail}</p>}
      {import.meta.env.DEV && (
        <p className="font-mono text-[9px] text-muted-foreground/50">
          {item.source} · {item.reason}
        </p>
      )}
      <ActionButtons actions={item.actions} onNavigate={go} onDone={onClose} />
    </div>
  );

  return (
    <div className="space-y-3">
      <Section title="Current work" empty="No tracked work active">
        {focus.current ? (
          <div className="focus-current rounded-md border border-border/40 p-2">
            <p className="flex items-center gap-1.5 text-xs font-medium text-foreground">
              <Timer className="h-3 w-3" aria-hidden />
              {focus.current.label}
            </p>
            <p className="text-[11px] text-muted-foreground">
              {focus.current.accountId ? `Account ${focus.current.accountId} · ` : ""}
              {focus.current.running ? "Active" : "Paused"} {focus.current.elapsedLabel}
            </p>
            <ActionButtons actions={focus.current.actions} onNavigate={go} onDone={onClose} />
          </div>
        ) : null}
      </Section>

      <Section title="Next work" empty="Nothing queued">
        {focus.next.map((item) => (
          <div
            key={item.id}
            className="focus-next rounded-md border border-border/30 p-2"
          >
            <p className="text-xs font-medium text-foreground">{item.label}</p>
            {item.detail && <p className="text-[11px] text-muted-foreground">{item.detail}</p>}
            <ActionButtons actions={item.actions} onNavigate={go} onDone={onClose} />
          </div>
        ))}
      </Section>

      <Section title="Items to watch" empty="Nothing needs attention">
        {focus.watch.map(row)}
      </Section>

      <Section title="Blocked work" empty="Nothing currently blocked">
        {focus.blocked.map((i) => (
          <div key={i.id} className="focus-blocked rounded-md border border-border/30 p-2">
            <p className="text-xs font-medium text-foreground">{i.label}</p>
            {i.detail && <p className="text-[11px] text-muted-foreground">{i.detail}</p>}
            <ActionButtons actions={i.actions} onNavigate={go} onDone={onClose} />
          </div>
        ))}
      </Section>

      {focus.current?.accountId && <AccountSummary accountNumber={focus.current.accountId} />}

      <WorkStateSection />
      <NextBestActionCard />
      <GuardedPlanPanel />

      <div className="flex justify-end">
        <button
          type="button"
          onClick={onClose}
          className="inline-flex items-center gap-1 rounded-full border border-border/40 px-2 py-0.5 text-[10px] text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          <X className="h-3 w-3" aria-hidden /> Close
        </button>
      </div>
    </div>
  );
}
