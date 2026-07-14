import { createFileRoute } from "@tanstack/react-router";
import { KnowledgeVault } from "@/components/knowledge/KnowledgeVault";

export const Route = createFileRoute("/_authenticated/knowledge-vault")({
  head: () => ({
    meta: [
      { title: "Knowledge Vault — Account Intel Hub" },
      {
        name: "description",
        content: "A private BlueVerse workspace for training, work notes, prompts, and procedures.",
      },
    ],
  }),
  component: KnowledgeVaultPage,
});

function KnowledgeVaultPage() {
  return <KnowledgeVault />;
}
