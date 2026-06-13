import { createFileRoute } from "@tanstack/react-router";
import { CompletedWorkPage } from "@/components/completed-work/CompletedWorkPage";

export const Route = createFileRoute("/_authenticated/completed-work")({
  head: () => ({
    meta: [
      { title: "Completed Work — Account Intel Hub" },
      { name: "description", content: "Review and reopen completed Freshdesk, Contact Dispatch, and Additional Work." },
    ],
  }),
  component: CompletedWorkPage,
});