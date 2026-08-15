import { useCallback, useDeferredValue, useMemo } from "react";
import { useRouterState } from "@tanstack/react-router";
import { useShiftContext } from "@/hooks/use-shift-context";
import { useActiveWork } from "@/lib/workspace/active-work-store";
import { useAwareness } from "@/lib/core/awareness-store";
import { usePortalPresence } from "@/lib/core/portal-presence";
import { assemblePortalContext } from "@/lib/core/context-orchestrator";
import {
  buildPortalContextWithEvidence,
  type EvidenceOptions,
} from "@/lib/core/portal-context-service";
import type { PortalContextEnvelope } from "@/lib/core/portal-context";

/**
 * React view of the Portal Context Envelope.
 *
 * The live envelope is recomputed only when a meaningful signal changes
 * (route, shift working context, timer, presence, awareness) — never per
 * render tick — and the evidence-bearing envelope is built on demand.
 */
export function usePortalContext(): {
  envelope: PortalContextEnvelope;
  withEvidence: (options?: EvidenceOptions) => Promise<PortalContextEnvelope>;
} {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const shift = useShiftContext();
  const activeWork = useActiveWork();
  const presence = usePortalPresence();
  const awareness = useAwareness();

  // Defer keeps context assembly off the interaction critical path.
  const deferredAwareness = useDeferredValue(awareness);

  const envelope = useMemo(
    () =>
      assemblePortalContext({
        pathname,
        shift,
        activeWork,
        presence,
        awareness: deferredAwareness,
      }),
    [pathname, shift, activeWork, presence, deferredAwareness],
  );

  const withEvidence = useCallback(
    (options: EvidenceOptions = {}) => buildPortalContextWithEvidence({ pathname, ...options }),
    [pathname],
  );

  return { envelope, withEvidence };
}
