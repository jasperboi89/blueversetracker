import { createFileRoute } from "@tanstack/react-router";
import { PlaceholderPage } from "@/components/layout/PlaceholderPage";

export const Route = createFileRoute("/freshdesk-tickets")({
  head: () => ({ meta: [{ title: "Freshdesk Tickets — Account Intel Hub" }] }),
  component: () => <PlaceholderPage title="Freshdesk Tickets" />,
});