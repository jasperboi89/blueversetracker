import { createFileRoute } from "@tanstack/react-router";
import { AssignedInboxPage } from "@/components/assigned-inbox/AssignedInboxPage";

export const Route = createFileRoute("/_authenticated/assigned-to-me")({
  head: () => ({
    meta: [
      { title: "Assigned to Me — Account Intel Hub" },
      {
        name: "description",
        content: "Freshdesk tickets currently assigned to you, auto-synced in the background.",
      },
    ],
  }),
  component: AssignedInboxPage,
});