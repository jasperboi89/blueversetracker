import { createFileRoute } from "@tanstack/react-router";
import { KnowledgeVault } from "@/components/knowledge/KnowledgeVault";

export const Route = createFileRoute("/_authenticated/knowledge-vault")({
  validateSearch: (s: Record<string, unknown>): { section?: "notes" | "is-scripts" } => ({
    section: s.section === "is-scripts" ? "is-scripts" : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Knowledge Vault — Account Command Center" },
      {
        name: "description",
        content: "A private BlueVerse workspace for training, work notes, prompts, and procedures.",
      },
      { property: "og:title", content: "Knowledge Vault — Account Command Center" },
      {
        property: "og:description",
        content: "Notes, runbooks and IS script intelligence for the AnSer night floor.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: KnowledgeVaultPage,
});

function KnowledgeVaultPage() {
  const { section } = Route.useSearch();
  return <KnowledgeVault initialSection={section ?? "notes"} />;
}
