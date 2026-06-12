import { createFileRoute } from "@tanstack/react-router";
import { PlaceholderPage } from "@/components/layout/PlaceholderPage";

export const Route = createFileRoute("/accounts")({
  head: () => ({ meta: [{ title: "Accounts — Account Intel Hub" }] }),
  component: () => <PlaceholderPage title="Accounts" />,
});