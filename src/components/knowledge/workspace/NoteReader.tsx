import DOMPurify from "dompurify";
import { cn } from "@/lib/utils";

/**
 * Calm, read-only presentation of a note's HTML. No editor chrome — this is
 * the surface Reader Mode, version previews, and Book Mode all share.
 */
export function NoteReader({
  html,
  className,
  compact = false,
}: {
  html: string;
  className?: string;
  compact?: boolean;
}) {
  const clean = DOMPurify.sanitize(html || "<p><em>This note is empty.</em></p>");
  return (
    <article
      data-slot="vault-reader"
      className={cn(
        "rich-text-content vault-reader mx-auto w-full text-foreground/90",
        compact ? "max-w-3xl text-[15px] leading-7" : "max-w-[68ch] text-[16px] leading-[1.85]",
        className,
      )}
      dangerouslySetInnerHTML={{ __html: clean }}
    />
  );
}
