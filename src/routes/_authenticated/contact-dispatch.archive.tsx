import { createFileRoute } from "@tanstack/react-router";
import { Archive } from "lucide-react";
import { DispatchTabs } from "@/components/dispatch/DispatchTabs";
import { DispatchArchiveList } from "@/components/dispatch/DispatchArchiveList";
import { useDispatch } from "@/lib/dispatch-store";

export const Route = createFileRoute("/_authenticated/contact-dispatch/archive")({
  head: () => ({
    meta: [
      { title: "Contact Dispatch Archive — Account Intel Hub" },
      { name: "description", content: "Review activated Contact Dispatch sessions." },
    ],
  }),
  component: DispatchArchivePage,
});

function DispatchArchivePage() {
  const { sessions } = useDispatch();
  const archivedCount = sessions.filter((s) => s.status === "activated").length;

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-5">
      <header className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <div
            className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl"
            style={{
              background: "linear-gradient(135deg, oklch(0.7 0.22 295 / 0.4), oklch(0.78 0.18 220 / 0.4))",
              boxShadow: "0 0 22px var(--violet-glow), inset 0 1px 0 oklch(1 0 0 / 0.2)",
            }}
          >
            <Archive className="h-5 w-5 text-white" />
          </div>
          <div className="min-w-0">
            <h1 className="truncate text-xl font-semibold text-foreground">Contact Dispatch Archive</h1>
            <p className="text-xs text-muted-foreground">Activated sessions are kept here for reference.</p>
          </div>
        </div>
      </header>
      <DispatchTabs archivedCount={archivedCount} />
      <DispatchArchiveList />
    </div>
  );
}