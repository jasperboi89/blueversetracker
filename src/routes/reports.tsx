import { createFileRoute } from "@tanstack/react-router";
import { PlaceholderPage } from "@/components/layout/PlaceholderPage";

export const Route = createFileRoute("/reports")({
  head: () => ({ meta: [{ title: "Reports — Account Intel Hub" }] }),
  component: () => <PlaceholderPage title="Reports" />,
});