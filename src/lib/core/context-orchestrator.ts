import { getShiftKey } from "@/lib/shift";
import type { ActiveWork, ActiveWorkState } from "@/lib/workspace/active-work-store";
import type { AwarenessItem } from "./awareness";
import type { ShiftWorkingContext } from "./shift-context";
import type { AccountContextPack } from "./account-context";
import { toCopilotAccountContext } from "./account-context-projection";
import { classifyFreshness } from "./context-reality";
import { prioritizeEvidence, activeEntityIds } from "./context-priority";
import {
  PORTAL_CONTEXT_VERSION,
  classifyLocation,
  type ContextActivity,
  type ContextAwarenessItem,
  type ContextBlocker,
  type ContextEvidence,
  type ContextMemory,
  type ContextWarning,
  type PortalContextEnvelope,
  type PortalEntityType,
  type PortalWorkState,
} from "./portal-context";
import type { PortalPresenceState } from "./portal-presence";

/**
 * Context Orchestrator (Phase 10).
 *
 * Assembles the Portal Context Envelope from the systems that already own the
 * truth. It is READ-ONLY: it subscribes and projects, never mutates, and it
 * never performs a production write. Core assembly is a pure function so the
 * continuity / isolation / shift-boundary / budget rules are testable without
 * React.
 */

export interface PortalContextInput {
  now?: number;
  pathname: string;
  shift: ShiftWorkingContext;
  activeWork?: Pick<ActiveWorkState, "current"> | null;
  presence: PortalPresenceState;
  awareness?: AwarenessItem[];
  accountPack?: AccountContextPack | null;
  /** Sources that failed while gathering — surfaced, never silently dropped. */
  failures?: Array<{ source: string; message: string }>;
  evidence?: ContextEvidence[];
  /** Phase 12 — relevant prior experience, already projected and bounded. */
  memory?: ContextMemory[];
}

const MAX_ACTIVITY = 8;
const MAX_AWARENESS = 8;
const MAX_BLOCKERS = 8;

function elapsedFor(work: ActiveWork | undefined | null, now: number): number | undefined {
  if (!work) return undefined;
  const base = work.accumulatedMs ?? 0;
  return work.running && work.startedAt ? base + Math.max(0, now - work.startedAt) : base;
}

/** Which entity ids the operator has unsaved edits on, flattened for the signal. */
function unsavedState(presence: PortalPresenceState): {
  unsavedChanges: boolean;
  unsavedEntities: PortalEntityType[];
} {
  const entities = (Object.keys(presence.unsaved) as PortalEntityType[]).filter(
    (k) => (presence.unsaved[k] ?? []).length > 0,
  );
  return { unsavedChanges: entities.length > 0, unsavedEntities: entities };
}

/**
 * Assemble the envelope. Pure: same input -> same output (apart from `now`).
 */
export function assemblePortalContext(input: PortalContextInput): PortalContextEnvelope {
  const startedAt = Date.now();
  const now = input.now ?? Date.now();
  const nowIso = new Date(now).toISOString();
  const shiftKey = getShiftKey(new Date(now));
  const warnings: ContextWarning[] = [];

  const location = classifyLocation(input.pathname);

  // --- Shift boundary: last shift's working context must never bleed in.
  const shiftFresh = !input.shift.shiftKey || input.shift.shiftKey === shiftKey;
  const shift: ShiftWorkingContext = shiftFresh
    ? input.shift
    : { shiftKey, recentActivity: [], blockers: [], warnings: [] };
  if (!shiftFresh) {
    warnings.push({
      code: "shift_boundary",
      source: "shift_context",
      message: `Working context from shift ${input.shift.shiftKey} was dropped; this is shift ${shiftKey}.`,
    });
  }

  // --- Active entities. Continuity: supporting navigation (account page,
  // Knowledge Vault) does not erase the ticket the operator is working.
  const active: PortalContextEnvelope["active"] = {};

  const onScreenTicket = location.entityType === "ticket" ? location.entityId : undefined;
  const shiftTicket = shift.activeTicket;
  const mismatch = Boolean(onScreenTicket && shiftTicket && shiftTicket.id !== onScreenTicket);
  if (mismatch) {
    warnings.push({
      code: "entity_mismatch",
      source: "shift_context",
      message: `On-screen ticket ${onScreenTicket} differs from the shift's active ticket ${shiftTicket?.id}; the on-screen ticket wins.`,
    });
  }

  if (onScreenTicket) {
    const known = shiftTicket?.id === onScreenTicket ? shiftTicket : undefined;
    active.ticket = {
      id: onScreenTicket,
      ...(known?.label ? { label: known.label } : {}),
      ...(known?.accountId ? { accountId: known.accountId } : {}),
      ...(known?.openedAt ? { openedAt: known.openedAt } : {}),
      onScreen: true,
      origin: "observed",
    };
  } else if (shiftTicket) {
    active.ticket = {
      id: shiftTicket.id,
      ...(shiftTicket.label ? { label: shiftTicket.label } : {}),
      ...(shiftTicket.accountId ? { accountId: shiftTicket.accountId } : {}),
      ...(shiftTicket.openedAt ? { openedAt: shiftTicket.openedAt } : {}),
      onScreen: false,
      origin: "observed",
    };
  }

  const onScreenAccount = location.entityType === "account" ? location.entityId : undefined;
  const ticketAccount = active.ticket?.accountId;
  // Isolation: never carry a previous ticket's account onto an unrelated ticket.
  const carriedAccount =
    mismatch && !ticketAccount ? undefined : (ticketAccount ?? shift.activeAccount?.id);
  const accountId = onScreenAccount ?? carriedAccount;
  if (accountId) {
    const known = shift.activeAccount?.id === accountId ? shift.activeAccount : undefined;
    active.account = {
      id: accountId,
      ...(known?.name ? { name: known.name } : {}),
      onScreen: Boolean(onScreenAccount),
      origin: onScreenAccount || ticketAccount === accountId ? "observed" : "inferred",
    };
  }

  const onScreenWork = location.entityType === "work_item" ? location.entityId : undefined;
  const workItem = shift.activeWorkItem;
  if (onScreenWork || workItem) {
    const id = onScreenWork ?? workItem?.id;
    if (id) {
      const known = workItem?.id === id ? workItem : undefined;
      active.workItem = {
        id,
        ...(known?.title ? { title: known.title } : {}),
        ...(known?.startedAt ? { startedAt: known.startedAt } : {}),
        onScreen: Boolean(onScreenWork),
        origin: "observed",
      };
    }
  }

  const onScreenDispatch = location.entityType === "dispatch" ? location.entityId : undefined;
  const dispatchId = onScreenDispatch ?? shift.activeDispatch?.id;
  if (dispatchId) {
    active.dispatch = {
      id: dispatchId,
      onScreen: Boolean(onScreenDispatch),
      origin: "observed",
    };
  }

  const note = input.presence.knowledgeNote;
  if (note) {
    active.knowledgeNote = {
      id: note.id,
      ...(note.title ? { title: note.title } : {}),
      ...(note.collection ? { collection: note.collection } : {}),
      ...(note.noteType ? { noteType: note.noteType } : {}),
      ...(note.status ? { status: note.status } : {}),
      ...(note.updatedAt ? { updatedAt: note.updatedAt } : {}),
      ...(note.presentation ? { presentation: note.presentation } : {}),
      onScreen: location.area === "knowledge_vault",
      origin: "observed",
    };
  }

  // --- Work state (timer + unsaved signal; never draft content).
  const current = input.activeWork?.current ?? null;
  const { unsavedChanges, unsavedEntities } = unsavedState(input.presence);
  const workState: PortalWorkState = {
    running: Boolean(current?.running),
    ...(current ? { paused: !current.running } : {}),
    ...(current ? { elapsedMs: elapsedFor(current, now) } : {}),
    unsavedChanges,
    unsavedEntities,
    editMode: input.presence.editMode,
  };

  // --- Blockers / awareness / activity.
  const blockers: ContextBlocker[] = shift.blockers.slice(0, MAX_BLOCKERS).map((b) => ({
    id: b.id,
    type: b.type,
    label: b.label,
    since: b.since,
    ...(b.entity?.type ? { entityType: b.entity.type } : {}),
    ...(b.entity?.id ? { entityId: b.entity.id } : {}),
    origin: b.source === "operator" ? "operator_confirmed" : "observed",
  }));

  const awareness: ContextAwarenessItem[] = (input.awareness ?? [])
    .slice(0, MAX_AWARENESS)
    .map((a) => ({
      id: a.dedupeKey,
      severity: a.severity,
      message: a.message,
      origin: "observed" as const,
    }));

  const recentActivity: ContextActivity[] = shift.recentActivity.slice(0, MAX_ACTIVITY).map((a) => ({
    id: a.id,
    kind: a.kind,
    label: a.label,
    at: a.at,
    ...(a.complete ? { complete: true } : {}),
  }));

  // --- Bounded account context (projection only; the pack itself stays put).
  let accountContext: PortalContextEnvelope["accountContext"];
  const pack = input.accountPack;
  if (pack) {
    const unavailable = pack.errors.map((e) => e.source);
    accountContext = {
      accountNumber: pack.account.accountNumber,
      ...(pack.account.name ? { name: pack.account.name } : {}),
      generatedAt: pack.provenance.generatedAt,
      freshness: classifyFreshness(pack.provenance.generatedAt, now),
      counts: {
        recentTickets: pack.recentTickets.length,
        recentChanges: pack.recentChanges.length,
        knownFixes: pack.knownFixes.length,
        warnings: pack.warnings.length,
      },
      summary: toCopilotAccountContext(pack),
      unavailable,
      origin: "retrieved",
    };
    for (const err of pack.errors) {
      warnings.push({
        code: "source_unavailable",
        source: err.source,
        message: `${err.source} unavailable: ${err.message}. Treat it as unknown, not as "none".`,
      });
    }
  }

  for (const f of input.failures ?? []) {
    warnings.push({
      code: "source_unavailable",
      source: f.source,
      message: `${f.source} unavailable: ${f.message}. Treat it as unknown, not as "none".`,
    });
  }

  const envelope: PortalContextEnvelope = {
    version: PORTAL_CONTEXT_VERSION,
    generatedAt: nowIso,
    shiftKey,
    location,
    active,
    workState,
    blockers,
    awareness,
    recentActivity,
    ...(accountContext ? { accountContext } : {}),
    evidence: [],
    ...(input.memory?.length ? { memory: input.memory.slice(0, 5) } : {}),
    warnings,
    budget: { evidenceAvailable: 0 },
  };

  const evidence = (input.evidence ?? []).map((e) => ({
    ...e,
    freshness:
      e.freshness ??
      classifyFreshness(e.updatedAt ?? e.observedAt, now, {
        superseded: e.superseded,
        historical: e.historical,
      }),
  }));
  envelope.evidence = prioritizeEvidence(evidence, activeEntityIds(envelope));
  envelope.budget = {
    evidenceAvailable: envelope.evidence.length,
    assemblyMs: Date.now() - startedAt,
  };
  if (warnings.some((w) => w.code === "source_unavailable")) {
    envelope.warnings.push({
      code: "context_degraded",
      message: "Some context sources were unavailable; answer from what is present and say what is missing.",
    });
  }
  return envelope;
}
