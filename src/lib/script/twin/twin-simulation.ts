/**
 * Activation 7 — Script Twin bounded simulation.
 *
 * A pure, deterministic sandbox over a `TwinScriptModel`. It lets an operator
 * enter test values, choose options, reveal conditionally-visible controls, and
 * navigate between DEFINED screens — and nothing more.
 *
 * SAFETY (non-negotiable, enforced by construction):
 *   - Simulation state is a plain value held by the caller. It is NOT the live
 *     portal state, NOT Amtelco state, and has no I/O of any kind.
 *   - There is NO function here that writes to Amtelco, deploys a script, or
 *     performs any capability. `applyValue`/`navigate` return a NEW state object;
 *     they cannot reach the network or a store. This is a digital twin only.
 *   - The model is never mutated. Every transition is a pure function.
 *
 * BEHAVIOURAL HONESTY:
 *   - Progressive reveal follows ONLY the visibility rules declared on the
 *     model, each of which carries its own provenance. The simulator never
 *     invents a reveal, and never claims a reveal came from Amtelco — the UI
 *     reads the rule's provenance to label it.
 */

import type { EvidenceState } from "./evidence-state";
import type { TwinElement, TwinScreen, TwinScriptModel } from "./twin-model";

/** Immutable-by-convention simulation state. Held by the caller/UI, not global. */
export interface TwinSimState {
  scriptId: string;
  currentScreenId: string;
  /** elementId → entered/selected value. */
  values: Readonly<Record<string, string>>;
  /** Ordered screen ids the operator has visited (a navigation trace). */
  trace: readonly string[];
}

export function createSimState(model: TwinScriptModel): TwinSimState {
  return {
    scriptId: model.scriptId,
    currentScreenId: model.entryScreenId,
    values: {},
    trace: [model.entryScreenId],
  };
}

function screenById(model: TwinScriptModel, id: string): TwinScreen | undefined {
  return model.screens.find((s) => s.id === id);
}

/**
 * Is an element currently visible given the entered values? An element with no
 * visibility rule is always visible; otherwise the referenced element's current
 * value must be one of the rule's `equals`.
 */
export function isElementVisible(el: TwinElement, values: Record<string, string>): boolean {
  if (!el.visibility) return true;
  const current = values[el.visibility.whenElementId];
  if (current == null) return false;
  return el.visibility.equals.includes(current);
}

/** The elements visible on the current screen, in order — what the UI renders. */
export function visibleElements(model: TwinScriptModel, state: TwinSimState): TwinElement[] {
  const screen = screenById(model, state.currentScreenId);
  if (!screen) return [];
  return screen.elements.filter((el) => isElementVisible(el, state.values));
}

/**
 * Elements that are NOT yet visible but whose reveal depends on the current
 * screen — so the UI can honestly show "1 more control will appear when …".
 */
export function pendingReveals(model: TwinScriptModel, state: TwinSimState): TwinElement[] {
  const screen = screenById(model, state.currentScreenId);
  if (!screen) return [];
  return screen.elements.filter((el) => !isElementVisible(el, state.values) && !!el.visibility);
}

/**
 * Apply a test value to an element. Returns a NEW state. A value for an element
 * that is not currently visible is ignored (you cannot fill a hidden field),
 * which keeps progressive reveal consistent. Read-only elements never accept a
 * value.
 */
export function applyValue(
  model: TwinScriptModel,
  state: TwinSimState,
  elementId: string,
  value: string,
): TwinSimState {
  const screen = screenById(model, state.currentScreenId);
  const el = screen?.elements.find((e) => e.id === elementId);
  if (!el || el.readOnly) return state;
  if (!isElementVisible(el, state.values)) return state;
  return { ...state, values: { ...state.values, [elementId]: value } };
}

/** Clear a single element's value (e.g. operator resets a field). New state. */
export function clearValue(state: TwinSimState, elementId: string): TwinSimState {
  if (!(elementId in state.values)) return state;
  const next = { ...state.values };
  delete next[elementId];
  return { ...state, values: next };
}

/**
 * Navigate to another DEFINED screen via a declared navigation link on the
 * current screen. Navigation to an undefined screen, or via a link that does
 * not exist on the current screen, is refused (returns the same state) — the
 * twin never invents a destination.
 */
export function navigate(
  model: TwinScriptModel,
  state: TwinSimState,
  navigationId: string,
): TwinSimState {
  const screen = screenById(model, state.currentScreenId);
  const link = screen?.navigation.find((n) => n.id === navigationId);
  if (!link) return state;
  if (!screenById(model, link.toScreenId)) return state;
  return {
    ...state,
    currentScreenId: link.toScreenId,
    trace: [...state.trace, link.toScreenId],
  };
}

/** Reset to the entry screen, discarding all test values. New state. */
export function resetSim(model: TwinScriptModel): TwinSimState {
  return createSimState(model);
}

/** A safe, human-readable summary of the current simulated state (no writes). */
export interface TwinSimSummary {
  currentScreenId: string;
  currentScreenTitle: string;
  visibleCount: number;
  pendingRevealCount: number;
  filledCount: number;
  visitedScreens: number;
  /** Weakest evidence among the currently-visible elements — honesty for the UI. */
  screenEvidence: EvidenceState;
}

export function summarizeSim(model: TwinScriptModel, state: TwinSimState): TwinSimSummary {
  const screen = screenById(model, state.currentScreenId);
  const visible = visibleElements(model, state);
  const evidences = visible.map((e) => e.provenance.evidence);
  // Local copy of "weakest" to avoid a cross-module import cycle in hot paths.
  const rank: Record<EvidenceState, number> = {
    verified: 0,
    observed: 1,
    partial: 2,
    inferred: 3,
    insufficient_history: 4,
    unknown: 5,
    unsupported: 6,
  };
  const screenEvidence = evidences.length
    ? evidences.reduce((w, s) => (rank[s] > rank[w] ? s : w))
    : "unknown";
  return {
    currentScreenId: state.currentScreenId,
    currentScreenTitle: screen?.title ?? "",
    visibleCount: visible.length,
    pendingRevealCount: pendingReveals(model, state).length,
    filledCount: Object.keys(state.values).length,
    visitedScreens: new Set(state.trace).size,
    screenEvidence,
  };
}
