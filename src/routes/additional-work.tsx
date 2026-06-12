import { createFileRoute } from "@tanstack/react-router";
import { PlaceholderPage } from "@/components/layout/PlaceholderPage";

export const Route = createFileRoute("/additional-work")({
  head: () => ({ meta: [{ title: "Additional Work — Account Intel Hub" }] }),
  component: () => <PlaceholderPage title="Additional Work" />,
});