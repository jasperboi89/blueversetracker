import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Cpu } from "lucide-react";
import { useIsAdmin, useHubIdentityOptional } from "@/lib/auth/role-context";
import type { PortalContextEnvelope } from "@/lib/core/portal-context";
import { resolveCapabilities } from "@/lib/capability/capability-resolver";
import { registryProblems } from "@/lib/capability/capability-registry";
import type { ResolvedCapability } from "@/lib/capability/capability-contract";

/**
 * Phase 16 — admin Capability Inspector.
 *
 * One place to see what the portal's intelligence is actually capable of:
 * every capability, its operation, risk, health, context match, confirmation
 * rule and how its result would be verified. No secrets, no payloads.
 */
export function CapabilityInspector({ envelope }: { envelope: PortalContextEnvelope }) {
  const isAdmin = useIsAdmin();
  const identity = useHubIdentityOptional();
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);

  const resolution = useMemo(
    () =>
      resolveCapabilities({
        envelope,
        operator: { role: identity?.role ?? null, ...(identity?.userId ? { userId: identity.userId } : {}) },
        includeRetired: true,
      }),
    [envelope, identity?.role, identity?.userId],
  );

  if (!isAdmin) return null;

  const detail = selected ? resolution.byId[selected] : null;
  const problems = registryProblems();

  return (
    <div className="rounded-md border border-border/30 bg-white/[0.02]">
      <button
        className="flex w-full items-center gap-1.5 px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground"
        onClick={() => setOpen((v) => !v)}
      >
        {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        <Cpu className="h-3 w-3" /> Capabilities
        <span className="ml-auto">
          {resolution.available.length} available · {resolution.unavailable.length} unavailable ·{" "}
          {resolution.blocked.length} blocked
        </span>
      </button>

      {open && (
        <div className="max-h-72 space-y-2 overflow-auto border-t border-border/30 p-2 text-[11px] text-muted-foreground">
          {problems.length > 0 && (
            <div className="text-destructive">
              Registry problems: {problems.map((p) => `${p.capabilityId}:${p.code}`).join(", ")}
            </div>
          )}
          {resolution.all.map((c) => (
            <CapabilityRow key={c.id} cap={c} onSelect={() => setSelected(c.id === selected ? null : c.id)} />
          ))}

          {detail && (
            <div className="space-y-1 rounded border border-border/30 p-2">
              <div className="font-medium text-foreground/80">
                {detail.id}@{detail.version} — {detail.name}
              </div>
              <div>{detail.description}</div>
              <div>
                Domain {detail.domain} · operation {detail.operation} · risk {detail.risk} · side effects{" "}
                {detail.sideEffects}
              </div>
              <div>
                Confirmation: {detail.confirmation} · Verification:{" "}
                {detail.verification.required
                  ? `${detail.verification.authority} / ${detail.verification.method}`
                  : "not required (read-only)"}
              </div>
              <div>
                AI: {detail.ai.discoverable ? "discoverable" : "hidden"} ·{" "}
                {detail.ai.callable ? "callable" : "proposal-only"} · exposure {detail.ai.exposure}
              </div>
              <div>Reasons: {detail.reasonCodes.join(", ")}</div>
              {detail.note && <div>{detail.note}</div>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function CapabilityRow({ cap, onSelect }: { cap: ResolvedCapability; onSelect: () => void }) {
  return (
    <button onClick={onSelect} className="block w-full truncate text-left hover:text-foreground">
      {cap.availability === "available" ? "✓" : cap.availability === "blocked" ? "✗" : "·"} {cap.id} ·{" "}
      {cap.operation.toUpperCase()} · {cap.risk} · {cap.availability} · {cap.health} ·{" "}
      {cap.confirmation === "none" ? "no confirmation" : cap.confirmation} ·{" "}
      {cap.verification.required ? cap.verification.authority : "read-only"}
    </button>
  );
}
