import { useState } from "react";
import { Link, createFileRoute } from "@tanstack/react-router";
import { ClipboardList, Plus, CheckCircle2, Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CreateAdditionalWorkModal } from "@/components/additional-work/CreateAdditionalWorkModal";
import { useAdditionalWork } from "@/lib/additional-work-store";
import { DeleteWorkButton } from "@/components/additional-work/DeleteWorkButton";
import { formatCentralShort } from "@/lib/shift";

export const Route = createFileRoute("/_authenticated/additional-work/")({
  head: () => ({ meta: [{ title: "Additional Work — Account Intel Hub" }] }),
  component: AdditionalWorkPage,
});

function AdditionalWorkPage() {
  const [createOpen, setCreateOpen] = useState(false);
  const { items } = useAdditionalWork();
  const active = items
    .filter((i) => i.status === "working")
    .sort((a, b) => a.updatedAt - b.updatedAt);
  const completed = items
    .filter((i) => i.status === "completed")
    .sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0))
    .slice(0, 8);

  const empty = active.length === 0 && completed.length === 0;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <Header onCreate={() => setCreateOpen(true)} />

      {empty ? (
        <div className="glass-panel p-10 text-center">
          <p className="text-sm text-muted-foreground">
            No additional work tracked yet.
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Use Create Additional Work to start an ad hoc task or follow-up.
          </p>
          <Button
            onClick={() => setCreateOpen(true)}
            className="mt-4"
            style={{ background: "linear-gradient(110deg, oklch(0.4 0.16 240 / 0.7), oklch(0.4 0.18 290 / 0.55))", border: "1px solid oklch(0.78 0.18 220 / 0.45)" }}
          >
            <Plus className="mr-1.5 h-4 w-4" /> Create Additional Work
          </Button>
        </div>
      ) : (
        <>
          <section>
            <SectionTitle label="Active Additional Work" count={active.length} />
            {active.length === 0 ? (
              <div className="glass-panel p-6 text-sm text-muted-foreground">
                Nothing active right now.
              </div>
            ) : (
              <div className="grid gap-3 md:grid-cols-2">
                {active.map((w) => <ActiveCard key={w.id} w={w} />)}
              </div>
            )}
          </section>

          {completed.length > 0 && (
            <section>
              <SectionTitle label="Recently Completed Additional Work" count={completed.length} />
              <div className="grid gap-2 md:grid-cols-2">
                {completed.map((w) => <CompletedCard key={w.id} w={w} />)}
              </div>
            </section>
          )}
        </>
      )}

      <CreateAdditionalWorkModal open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  );
}

function Header({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="glass-panel shimmer relative overflow-hidden p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-4">
          <div
            className="grid h-12 w-12 place-items-center rounded-2xl"
            style={{
              background: "linear-gradient(135deg, oklch(0.78 0.18 220 / 0.45), oklch(0.7 0.22 295 / 0.4))",
              boxShadow: "var(--shadow-glow-cyan), inset 0 1px 0 oklch(1 0 0 / 0.18)",
            }}
          >
            <ClipboardList className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-foreground">Additional Work</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Track ad hoc work, follow-ups, and non-Freshdesk tasks.
            </p>
          </div>
        </div>
        <Button
          onClick={onCreate}
          style={{
            background: "linear-gradient(110deg, oklch(0.4 0.16 240 / 0.7), oklch(0.4 0.18 290 / 0.55))",
            border: "1px solid oklch(0.78 0.18 220 / 0.45)",
            boxShadow: "0 0 16px oklch(0.78 0.18 220 / 0.3)",
          }}
        >
          <Plus className="mr-1.5 h-4 w-4" /> Create Additional Work
        </Button>
      </div>
    </div>
  );
}

function SectionTitle({ label, count }: { label: string; count: number }) {
  return (
    <div className="mb-2 flex items-center gap-2">
      <h2 className="text-sm font-semibold text-foreground">{label}</h2>
      <span className="rounded-full border border-border/40 px-2 py-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">
        {count}
      </span>
    </div>
  );
}

function ActiveCard({ w }: { w: ReturnType<typeof useAdditionalWork>["items"][number] }) {
  return (
    <div className="glass-panel p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-foreground">{w.title}</div>
          <div className="mt-0.5 text-xs text-muted-foreground">
            {w.accountNumber ? (
              <span>
                <span className="tabular-nums">{w.accountNumber}</span> · {w.accountName}
              </span>
            ) : (
              <span>No account linked</span>
            )}
          </div>
        </div>
        <span className="shrink-0 rounded-full border border-cyan-glow/40 px-2 py-0.5 text-[10px] uppercase tracking-wider" style={{ color: "var(--cyan-glow)" }}>
          Currently Working On
        </span>
      </div>
      {w.notes && (
        <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">{w.notes}</p>
      )}
      <div className="mt-3 flex items-center justify-between">
        <span className="text-[11px] text-muted-foreground">
          Updated {formatCentralShort(new Date(w.updatedAt))}
        </span>
        <div className="flex gap-2">
          {w.accountNumber && (
            <Link to="/accounts/$accountNumber" params={{ accountNumber: w.accountNumber }}>
              <Button size="sm" variant="ghost" className="text-xs">
                <Building2 className="mr-1 h-3 w-3" /> Open Account
              </Button>
            </Link>
          )}
          <DeleteWorkButton workId={w.id} title={w.title} />
          <Link to="/additional-work/$workId/work" params={{ workId: w.id }}>
            <Button size="sm" className="text-xs"
              style={{ background: "linear-gradient(110deg, oklch(0.4 0.16 240 / 0.7), oklch(0.4 0.18 290 / 0.55))", border: "1px solid oklch(0.78 0.18 220 / 0.45)" }}
            >
              Open Work
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}

function CompletedCard({ w }: { w: ReturnType<typeof useAdditionalWork>["items"][number] }) {
  return (
    <div className="glass-panel p-3">
      <div className="flex items-center gap-3">
        <CheckCircle2 className="h-4 w-4" style={{ color: "var(--green-glow)" }} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm text-foreground">{w.title}</div>
          <div className="text-[11px] text-muted-foreground">
            {w.accountNumber ? `${w.accountNumber} · ${w.accountName} · ` : ""}
            {w.completedAt ? formatCentralShort(new Date(w.completedAt)) : ""}
          </div>
        </div>
        <Link to="/additional-work/$workId/work" params={{ workId: w.id }}>
          <Button size="sm" variant="ghost" className="text-xs">Open Record</Button>
        </Link>
        <DeleteWorkButton workId={w.id} title={w.title} />
      </div>
    </div>
  );
}