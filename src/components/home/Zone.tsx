import type { ReactNode } from "react";

export type ZoneTone = "now" | "outlook" | "radar" | "governed" | "ops";

/**
 * Command Center zone band.
 *
 * Presentation only. Gives every dashboard section a strong, consistent
 * identity (accent mark, uppercase title, hairline rule, optional hint and
 * trailing action) so the home surface reads as curated zones rather than a
 * flat pile of equal-weight cards.
 */
export function Zone({
  tone,
  label,
  hint,
  action,
  children,
}: {
  tone: ZoneTone;
  label: string;
  hint?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="cc-zone cc-rise" data-tone={tone} aria-label={label}>
      <div className="cc-zone__head">
        <span aria-hidden className="cc-zone__mark" />
        <h2 className="cc-zone__title">{label}</h2>
        {hint && (
          <span className="hidden text-[11px] text-muted-foreground sm:inline">{hint}</span>
        )}
        <span aria-hidden className="cc-zone__rule" />
        {action}
      </div>
      {children}
    </section>
  );
}
