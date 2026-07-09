import { useEffect } from "react";
import { toast } from "sonner";
import { ticketsStore } from "@/lib/tickets-store";
import { useActiveWork } from "@/lib/workspace/active-work-store";

/**
 * Paste an image anywhere in the app and it attaches as a snip to the active
 * ticket — no modal, no navigation. Skips editable fields and open dialogs so
 * it never hijacks a normal paste (the AddSnipModal keeps its own handler).
 */
export function GlobalSnipPaste() {
  const { current } = useActiveWork();

  useEffect(() => {
    if (!current || current.kind !== "ticket") return;
    const ticketId = current.id;
    const label = current.label;

    const handler = (e: ClipboardEvent) => {
      if (document.querySelector('[role="dialog"]')) return; // a modal is open
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const it of items) {
        if (!it.type.startsWith("image/")) continue;
        const file = it.getAsFile();
        if (!file) continue;
        e.preventDefault();
        const reader = new FileReader();
        reader.onload = () => {
          ticketsStore.addSnip(ticketId, {
            name: file.name || `Pasted ${new Date().toLocaleTimeString()}`,
            category: "Other",
            dataUrl: String(reader.result),
            isImage: true,
          });
          toast.success(`Snip added to ${label}.`);
        };
        reader.readAsDataURL(file);
        return;
      }
    };

    window.addEventListener("paste", handler);
    return () => window.removeEventListener("paste", handler);
  }, [current]);

  return null;
}
