import { shiftContextStore } from "./shift-context";
import { awarenessStore } from "./awareness-store";
import { activeWorkStore } from "@/lib/workspace/active-work-store";
import { portalPresence } from "./portal-presence";
import { assemblePortalContext } from "./context-orchestrator";
import { evidenceFromAccountPack, evidenceFromRetrieval, evidenceQueryFor } from "./context-evidence";
import type { ContextEvidence, PortalContextEnvelope } from "./portal-context";

/**
 * Non-React access to the Portal Context Envelope.
 *
 * `snapshotPortalContext()` is cheap and synchronous (route + active entities +
 * work state + blockers + awareness). `buildPortalContextWithEvidence()` is the
 * ask-time path: it additionally pulls the Account Context Pack and retrieval
 * evidence. Nothing here runs on a timer — Portal Presence is context
 * availability, not background AI chatter.
 */

function currentPath(): string {
  return typeof window === "undefined" ? "/" : window.location.pathname;
}

export function snapshotPortalContext(pathname = currentPath()): PortalContextEnvelope {
  return assemblePortalContext({
    pathname,
    shift: shiftContextStore.get(),
    activeWork: activeWorkStore.get(),
    presence: portalPresence.get(),
    awareness: awarenessStore.get(),
  });
}

export interface EvidenceOptions {
  pathname?: string;
  /** Hard ceiling before router budgeting trims further. */
  maxEvidence?: number;
  includeRetrieval?: boolean;
}

/**
 * Ask-time envelope. Every source is individually guarded: a failure marks the
 * source unavailable and the rest of the context still reaches the model.
 */
export async function buildPortalContextWithEvidence(
  options: EvidenceOptions = {},
): Promise<PortalContextEnvelope> {
  const pathname = options.pathname ?? currentPath();
  const base = snapshotPortalContext(pathname);
  const failures: Array<{ source: string; message: string }> = [];
  const evidence: ContextEvidence[] = [];
  const accountId = base.active.account?.id;
  let pack = null;

  if (accountId) {
    try {
      const { getAccountContext } = await import("./account-context-service");
      pack = await getAccountContext(accountId);
      evidence.push(...evidenceFromAccountPack(pack));
    } catch (e) {
      failures.push({
        source: "account_context",
        message: e instanceof Error ? e.message : "assembly failed",
      });
    }
  }

  if (options.includeRetrieval !== false) {
    const query = evidenceQueryFor(base);
    if (query) {
      try {
        const { findKnowledge } = await import("@/lib/retrieval/retrieval-service");
        const res = await findKnowledge({
          query,
          ...(accountId ? { accountNumber: accountId } : {}),
          limit: 6,
        });
        evidence.push(...evidenceFromRetrieval(res.results));
        if (res.warnings.length) {
          failures.push({ source: "retrieval", message: res.warnings[0] ?? "degraded" });
        }
      } catch (e) {
        failures.push({
          source: "retrieval",
          message: e instanceof Error ? e.message : "search failed",
        });
      }
    }
  }

  const max = options.maxEvidence ?? 14;
  const full = assemblePortalContext({
    pathname,
    shift: shiftContextStore.get(),
    activeWork: activeWorkStore.get(),
    presence: portalPresence.get(),
    awareness: awarenessStore.get(),
    accountPack: pack,
    failures,
    evidence,
  });
  return { ...full, evidence: full.evidence.slice(0, max) };
}
