import { createFileRoute, Link, useNavigate, useParams } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { setActiveWork, leaveActiveWork } from "@/lib/workspace/active-work-store";
import { eventSpine } from "@/lib/core/event-spine";
import { InlineWorkTimer } from "@/components/workspace/InlineWorkTimer";
import { Archive, ArrowLeft, Building2, CheckCircle2, ExternalLink, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  canMarkReady,
  dispatchStore,
  DISPATCH_STATUS_LABEL,
  PHONE_CHECKS,
  REPEAT_CHECKS,
  SAVE_CHECKS,
  buildDispatchSummary,
  useDispatch,
  reasonCardStatus,
} from "@/lib/dispatch-store";
import { ReadinessTracker } from "@/components/dispatch/ReadinessTracker";
import { SectionCard } from "@/components/dispatch/SectionCard";
import { ReasonFlowSection } from "@/components/dispatch/ReasonFlowSection";
import { ChecksSection } from "@/components/dispatch/ChecksSection";
import { OverallResultSection } from "@/components/dispatch/OverallResultSection";
import { SummaryNotesSection } from "@/components/dispatch/SummaryNotesSection";
import { MarkReadyModal } from "@/components/dispatch/MarkReadyModal";
import { MarkPostedModal } from "@/components/dispatch/MarkPostedModal";
import { MarkActivatedModal } from "@/components/dispatch/MarkActivatedModal";
import { formatCentralShort } from "@/lib/shift";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/contact-dispatch/$sessionId/work")({
  head: () => ({ meta: [{ title: "Contact Dispatch Testing Workspace — Account Intel Hub" }] }),
  component: Workspace,
});

function Workspace() {
  const { sessionId } = useParams({ from: "/_authenticated/contact-dispatch/$sessionId/work" });
  const navigate = useNavigate();
  const { sessions } = useDispatch();
  const session = sessions.find((s) => s.id === sessionId);

  const [open, setOpen] = useState<Record<string, boolean>>({ reasons: true });
  const [readyOpen, setReadyOpen] = useState(false);
  const [postedOpen, setPostedOpen] = useState(false);
  const [activatedOpen, setActivatedOpen] = useState(false);

  useEffect(() => {
    if (!session) return;
    eventSpine.emit({
      type: "dispatch.started",
      source: "route",
      dispatchId: sessionId,
      accountId: session.accountNumber || undefined,
      metadata: {
        label: `Dispatch ${session.accountNumber || session.accountName || ""}`.trim(),
        accountName: session.accountName,
      },
    });
    setActiveWork({
      kind: "dispatch",
      id: sessionId,
      label: `Dispatch ${session.accountNumber || session.accountName || ""}`.trim(),
      to: "/contact-dispatch/$sessionId/work",
      params: { sessionId },
      accountNumber: session.accountNumber || "",
      accountName: session.accountName,
    });
    return () => leaveActiveWork(sessionId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, session?.accountNumber, session?.accountName]);

  if (!session) {
    return (
      <div className="mx-auto max-w-2xl pt-16 text-center">
        <div className="glass-panel p-8">
          <p className="text-sm text-muted-foreground">Testing session not found.</p>
          <Button asChild className="mt-4">
            <Link to="/contact-dispatch">Back to Contact Dispatch</Link>
          </Button>
        </div>
      </div>
    );
  }

  const toggle = (k: string) => setOpen((o) => ({ ...o, [k]: !o[k] }));
  const reasonStat =
    session.reasons.length === 0
      ? ("not-tested" as const)
      : session.reasons.every((r) => {
            const st = reasonCardStatus(r);
            return st === "passed" || st === "passed-retest";
          })
        ? session.reasons.some((r) => r.retests.length)
          ? "passed-retest"
          : "passed"
        : session.reasons.some(
              (r) => r.result === "failed" && !r.retests.some((x) => x.result === "passed"),
            )
          ? "still-failed"
          : "in-progress";

  const ready = canMarkReady(session);
  const canActivate = session.status === "ready";
  const isActivated = session.status === "activated";

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4">
      {/* Header */}
      <div className="glass-panel p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
              Contact Dispatch Testing
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <h1 className="truncate text-lg font-semibold text-foreground">
                {session.accountName}
              </h1>
              <InlineWorkTimer id={sessionId} />
            </div>
            <div className="text-[11px] text-muted-foreground">
              Account {session.accountNumber}
              {session.ticketNumber ? ` · Ticket #${session.ticketNumber}` : ""}
              {session.status ? ` · ${DISPATCH_STATUS_LABEL[session.status]}` : ""}
              {` · Updated ${formatCentralShort(new Date(session.updatedAt))}`}
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <Button size="sm" variant="ghost" asChild>
              <Link to="/contact-dispatch">
                <ArrowLeft className="mr-1 h-3.5 w-3.5" /> Back to Contact Dispatch
              </Link>
            </Button>
            <Button size="sm" variant="ghost" asChild>
              <Link to="/accounts/$accountNumber" params={{ accountNumber: session.accountNumber }}>
                <Building2 className="mr-1 h-3.5 w-3.5" /> Open Account
              </Link>
            </Button>
            {session.ticketNumber && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => toast.info(`Freshdesk ticket #${session.ticketNumber} (mock).`)}
              >
                <ExternalLink className="mr-1 h-3.5 w-3.5" /> Open Freshdesk Ticket
              </Button>
            )}
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setOpen((o) => ({ ...o, summary: true }))}
            >
              <Wand2 className="mr-1 h-3.5 w-3.5" /> Generate Summary Note
            </Button>
            <Button
              size="sm"
              disabled={!ready}
              onClick={() => setReadyOpen(true)}
              style={
                ready
                  ? {
                      background:
                        "linear-gradient(110deg, oklch(0.82 0.18 155 / 0.5), oklch(0.4 0.18 290 / 0.5))",
                      border: "1px solid oklch(0.82 0.18 155 / 0.55)",
                      boxShadow: "0 0 16px oklch(0.82 0.18 155 / 0.4)",
                    }
                  : undefined
              }
            >
              <CheckCircle2 className="mr-1 h-3.5 w-3.5" /> Mark Ready for Activation
            </Button>
            <Button
              size="sm"
              disabled={!canActivate}
              onClick={() => setActivatedOpen(true)}
              title={
                isActivated
                  ? "Already activated — see Archive"
                  : canActivate
                    ? "Mark this account Activated and move to Archive"
                    : "Mark Ready for Activation first"
              }
              style={
                canActivate
                  ? {
                      background:
                        "linear-gradient(110deg, oklch(0.7 0.22 295 / 0.55), oklch(0.4 0.18 240 / 0.55))",
                      border: "1px solid oklch(0.7 0.22 295 / 0.55)",
                      boxShadow: "0 0 16px var(--violet-glow)",
                    }
                  : undefined
              }
            >
              <Archive className="mr-1 h-3.5 w-3.5" />{" "}
              {isActivated ? "Activated" : "Mark Activated"}
            </Button>
          </div>
        </div>
      </div>

      <ReadinessTracker session={session} />

      <SectionCard
        title="Reason for Call Flow"
        status={reasonStat}
        open={!!open.reasons}
        onToggle={() => toggle("reasons")}
        badge={`${session.reasons.length} reasons`}
      >
        <ReasonFlowSection session={session} />
      </SectionCard>

      <SectionCard
        title="Phone Number Field Check"
        status={session.phone.status}
        open={!!open.phone}
        onToggle={() => toggle("phone")}
      >
        <ChecksSection session={session} sectionKey="phone" checks={PHONE_CHECKS} />
      </SectionCard>

      <SectionCard
        title="Repeat Caller Button Check"
        status={session.repeat.status}
        open={!!open.repeat}
        onToggle={() => toggle("repeat")}
        required
      >
        <ChecksSection session={session} sectionKey="repeat" checks={REPEAT_CHECKS} />
      </SectionCard>

      <SectionCard
        title="Save / Message Summary"
        status={session.saveSummary.status}
        open={!!open.save}
        onToggle={() => toggle("save")}
      >
        <ChecksSection session={session} sectionKey="saveSummary" checks={SAVE_CHECKS} allowNA />
      </SectionCard>

      <SectionCard
        title="Overall Result"
        status={
          session.status === "ready"
            ? "complete"
            : session.status === "not-ready"
              ? "still-failed"
              : session.status === "waiting-cs" || session.status === "waiting-prog"
                ? "waiting-review"
                : "not-tested"
        }
        open={!!open.overall}
        onToggle={() => toggle("overall")}
      >
        <OverallResultSection session={session} />
      </SectionCard>

      <SectionCard
        title="Summary Notes"
        status={session.summaryVersions.length > 0 ? "complete" : "not-tested"}
        open={!!open.summary}
        onToggle={() => toggle("summary")}
        badge={`${session.summaryVersions.length} versions`}
      >
        <SummaryNotesSection session={session} onMarkPostedRequest={() => setPostedOpen(true)} />
      </SectionCard>

      <MarkReadyModal
        open={readyOpen}
        onOpenChange={setReadyOpen}
        onConfirm={(alsoGenerate) => {
          dispatchStore.markReady(session.id);
          if (alsoGenerate) {
            const body = buildDispatchSummary({
              ...session,
              status: "ready",
              completedAt: Date.now(),
            });
            dispatchStore.addSummaryVersion(session.id, "Generated", body);
          }
          toast.success(`${session.accountName} marked Ready for Activation.`);
          setTimeout(() => navigate({ to: "/contact-dispatch" }), 900);
        }}
      />
      <MarkPostedModal
        open={postedOpen}
        onOpenChange={setPostedOpen}
        onConfirm={() => {
          dispatchStore.markPosted(session.id);
          toast.success("Summary note marked posted.");
        }}
      />
      <MarkActivatedModal
        open={activatedOpen}
        onOpenChange={setActivatedOpen}
        onConfirm={() => {
          dispatchStore.markActivated(session.id);
          toast.success(`${session.accountName} archived as Activated.`);
          setTimeout(() => navigate({ to: "/contact-dispatch" }), 700);
        }}
      />
    </div>
  );
}
