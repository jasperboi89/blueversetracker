import { Link } from "@tanstack/react-router";
import { ArrowRight, Boxes, TerminalSquare } from "lucide-react";

/**
 * Script Intelligence entry tile.
 *
 * Discoverability only — the Script Twin workspace itself is unchanged. This
 * surfaces it as a first-class capability from the Command Center instead of
 * leaving it buried inside a Knowledge Vault tab.
 */
export function ScriptTwinTile() {
  return (
    <Link
      to="/knowledge-vault"
      search={{ section: "is-scripts" }}
      className="cc-tile group p-5 sm:p-6"
      style={{ ["--cc-accent" as string]: "var(--electric)" }}
    >
      <span aria-hidden className="cc-tile__sweep" />
      <div className="relative flex items-start gap-4">
        <span
          aria-hidden
          className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl"
          style={{
            background:
              "linear-gradient(135deg, color-mix(in oklab, var(--electric) 45%, transparent), color-mix(in oklab, var(--violet-glow) 40%, transparent))",
            boxShadow: "var(--shadow-glow-cyan)",
          }}
        >
          <TerminalSquare className="h-5 w-5 text-white" />
        </span>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="font-display text-base font-semibold text-foreground">
              Enter Script Twin
            </h3>
            <ArrowRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-1" />
          </div>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
            Step through an account's IS script exactly as the floor sees it — Classic grammar or
            Enhanced view with provenance and evidence badges on every claim.
          </p>
          <div className="mt-3 flex flex-wrap gap-1.5">
            <span className="cc-pill" data-tone="info">
              <Boxes className="h-3.5 w-3.5" aria-hidden />
              Classic + Enhanced views
            </span>
            <span className="cc-pill" data-tone="muted">
              Evidence-labelled · not validated against a real export
            </span>
          </div>
        </div>
      </div>
    </Link>
  );
}
