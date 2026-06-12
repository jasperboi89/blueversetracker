import { createFileRoute } from "@tanstack/react-router";
import { PlaceholderPage } from "@/components/layout/PlaceholderPage";

export const Route = createFileRoute("/settings")({
  head: () => ({ meta: [{ title: "Settings — Account Intel Hub" }] }),
  component: () => <PlaceholderPage title="Settings" />,
});