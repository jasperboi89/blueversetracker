import { createFileRoute } from "@tanstack/react-router";
import { PlaceholderPage } from "@/components/layout/PlaceholderPage";

export const Route = createFileRoute("/contact-dispatch")({
  head: () => ({ meta: [{ title: "Contact Dispatch — Account Intel Hub" }] }),
  component: () => <PlaceholderPage title="Contact Dispatch" />,
});