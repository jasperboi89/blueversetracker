import * as React from "react";
import { cn } from "@/lib/utils";
import { sanitizeHtml, plainTextToHtml } from "@/lib/rich-text";

export interface RichTextProps extends React.HTMLAttributes<HTMLDivElement> {
  html: string | null | undefined;
  /** If true, an empty value renders nothing (default). Otherwise renders the fallback. */
  fallback?: React.ReactNode;
}

/**
 * View-only renderer for rich text. Sanitizes HTML and applies the same
 * typography styles used by the editor. Accepts legacy plain-text values.
 */
export function RichText({ html, fallback = null, className, ...rest }: RichTextProps) {
  const value = html ?? "";
  if (!value.trim()) return <>{fallback}</>;
  const asHtml = /<\/?[a-z][\s\S]*>/i.test(value) ? value : plainTextToHtml(value);
  const clean = sanitizeHtml(asHtml);
  return (
    <div
      className={cn("rich-text-content", className)}
      dangerouslySetInnerHTML={{ __html: clean }}
      {...rest}
    />
  );
}