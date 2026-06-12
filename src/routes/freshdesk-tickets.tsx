import { createFileRoute, Outlet, useRouterState } from "@tanstack/react-router";
import { useState } from "react";
import { TicketLookupCard } from "@/components/freshdesk/TicketLookupCard";
import { ActiveTicketSections } from "@/components/freshdesk/ActiveTicketSections";
import { TicketPreviewDrawer } from "@/components/freshdesk/TicketPreviewDrawer";
import { ticketsStore, useTickets } from "@/lib/tickets-store";

export const Route = createFileRoute("/freshdesk-tickets")({
  head: () => ({
    meta: [
      { title: "Freshdesk Tickets — Account Intel Hub" },
      { name: "description", content: "Ticket command center for active Freshdesk work." },
    ],
  }),
  component: FreshdeskTicketsRoute,
});

function FreshdeskTicketsRoute() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  // If on a child route (workspace), only render the Outlet
  if (pathname !== "/freshdesk-tickets") {
    return <Outlet />;
  }
  return <FreshdeskTicketsIndex />;
}

function FreshdeskTicketsIndex() {
  const { tickets } = useTickets();
  const [previewId, setPreviewId] = useState<string | null>(null);
  const preview = previewId ? ticketsStore.getTicket(previewId) ?? null : null;

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-5">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Freshdesk Tickets</h1>
        <p className="text-xs text-muted-foreground">Active ticket work for the current shift.</p>
      </div>
      <TicketLookupCard onOpenPreview={(id) => setPreviewId(id)} />
      <ActiveTicketSections tickets={tickets} onOpenPreview={(id) => setPreviewId(id)} />
      <TicketPreviewDrawer
        ticket={preview}
        open={!!preview}
        onOpenChange={(v) => !v && setPreviewId(null)}
      />
    </div>
  );
}