/**
 * Activation 7 — Script Twin normalized screen model.
 *
 * A source-INDEPENDENT description of an Amtelco Infinity-style screen, so the
 * renderer never depends on where the screen came from. A screen may be sourced
 * from a screenshot, a PDF, a manual mapping, a supported structured import, or
 * a future documented decoder — never from guessing the proprietary binary IIF
 * (Activation 5: the genuine export is binary and unsupported; this model does
 * NOT decode it).
 *
 * Two hard rules keep the Twin honest:
 *   1. Every element and behaviour carries PROVENANCE (where it came from) and
 *      an EVIDENCE STATE (how sure we are). Nothing is presented as fact unless
 *      it is genuinely verified.
 *   2. This is a digital twin only. The model has no capability to read from or
 *      write to a live Amtelco system. Rendering or simulating it changes
 *      nothing operational.
 */

import type { EvidenceState } from "./evidence-state";

/** Where a reconstructed element or behaviour came from. */
export const TWIN_SOURCES = [
  "SCREENSHOT",
  "PDF",
  "MANUAL",
  "STRUCTURAL_IMPORT",
  "INFERRED",
] as const;
export type TwinSource = (typeof TWIN_SOURCES)[number];

/** Provenance for one reconstructed fact (an element, an option, a branch). */
export interface TwinProvenance {
  source: TwinSource;
  evidence: EvidenceState;
  /** Optional free-form note, e.g. "from onboarding PDF p.3". Redacted/safe. */
  note?: string;
}

/**
 * Element kinds mirror the Infinity classic grammar the operator recognises.
 * The renderer maps each to a concrete control; the model stays presentation
 * neutral.
 */
export const TWIN_ELEMENT_TYPES = [
  "prompt", // italic caller-facing prompt text
  "instruction", // green operator guidance text
  "guidance_panel", // emphasis/instruction block
  "text", // single-line text input
  "textarea", // multi-line input
  "list", // list box
  "combo", // combo/select
  "readonly", // display-only value
  "name_pair", // first/last name pair
  "phone_pair", // phone + extension pair
  "review_panel", // proofread/review block
  "action", // action button (e.g. red Save)
  "navigation", // Back / navigation control
] as const;
export type TwinElementType = (typeof TWIN_ELEMENT_TYPES)[number];

/** A selectable option for a list/combo element. */
export interface TwinOption {
  value: string;
  label: string;
  provenance: TwinProvenance;
}

/**
 * A conditional-visibility rule. The element is shown only when the referenced
 * element currently holds one of `equals`. Progressive reveal is expressed
 * here, and — crucially — the rule itself carries provenance, so the UI can say
 * "this reveal behaviour is INFERRED / MANUAL, not verified from Amtelco".
 */
export interface TwinVisibilityRule {
  whenElementId: string;
  equals: string[];
  provenance: TwinProvenance;
}

export interface TwinElement {
  id: string;
  type: TwinElementType;
  label: string;
  /** Italic prompt / green instruction text where the type carries copy. */
  text?: string;
  /** Read-only display value or a default; simulation values live elsewhere. */
  value?: string;
  options?: TwinOption[];
  readOnly?: boolean;
  /** Absent = always visible. Present = progressive-reveal controlled. */
  visibility?: TwinVisibilityRule;
  /** Paired-field sub-labels (name_pair / phone_pair). */
  subLabels?: [string, string];
  /** Where this element and its label came from, and how sure we are. */
  provenance: TwinProvenance;
  /** Ordering hint within the screen (ascending). */
  order: number;
}

/** A navigable link between screens (a Back button, a branch, a next screen). */
export interface TwinNavigation {
  id: string;
  label: string;
  toScreenId: string;
  provenance: TwinProvenance;
}

export interface TwinScreen {
  id: string;
  title: string;
  elements: TwinElement[];
  navigation: TwinNavigation[];
  /** Screen-level provenance (how the whole screen was reconstructed). */
  provenance: TwinProvenance;
}

export interface TwinScriptModel {
  scriptId: string;
  /** Version this twin was built from, when known. */
  versionId?: string;
  title: string;
  screens: TwinScreen[];
  /** Id of the screen a simulation starts on. */
  entryScreenId: string;
  /**
   * The single source of truth for "did a real export validate this?". Mirrors
   * `iif-contract`'s flag and stays FALSE unless a genuine, supported export
   * exercised the reconstruction. The Twin never sets it true on its own.
   */
  validatedAgainstRealExport: boolean;
}

/* ---------------------------------------------------------------- */
/* Bounded builders — keep every element well-formed and provenanced */
/* ---------------------------------------------------------------- */

export const TWIN_LIMITS = {
  maxScreens: 200,
  maxElementsPerScreen: 300,
  maxOptionsPerElement: 200,
  labelMax: 160,
  valueMax: 2000,
} as const;

function cap(s: string | undefined, max: number): string | undefined {
  if (s == null) return s;
  return s.length > max ? s.slice(0, max) : s;
}

/** Normalize an element, enforcing caps and ordering. Never throws on caps. */
export function normalizeElement(el: TwinElement): TwinElement {
  return {
    ...el,
    label: cap(el.label, TWIN_LIMITS.labelMax) ?? "",
    text: cap(el.text, TWIN_LIMITS.valueMax),
    value: cap(el.value, TWIN_LIMITS.valueMax),
    options: el.options?.slice(0, TWIN_LIMITS.maxOptionsPerElement),
  };
}

export function normalizeScreen(screen: TwinScreen): TwinScreen {
  return {
    ...screen,
    title: cap(screen.title, TWIN_LIMITS.labelMax) ?? "",
    elements: screen.elements
      .slice(0, TWIN_LIMITS.maxElementsPerScreen)
      .map(normalizeElement)
      .sort((a, b) => a.order - b.order),
  };
}

export function normalizeModel(model: TwinScriptModel): TwinScriptModel {
  return {
    ...model,
    screens: model.screens.slice(0, TWIN_LIMITS.maxScreens).map(normalizeScreen),
    // The Twin can never assert real-export validation on its own.
    validatedAgainstRealExport: model.validatedAgainstRealExport === true ? true : false,
  };
}

/** All distinct evidence states present in a screen (for a screen-level badge). */
export function screenEvidenceStates(screen: TwinScreen): EvidenceState[] {
  const set = new Set<EvidenceState>();
  set.add(screen.provenance.evidence);
  for (const el of screen.elements) {
    set.add(el.provenance.evidence);
    if (el.visibility) set.add(el.visibility.provenance.evidence);
    for (const o of el.options ?? []) set.add(o.provenance.evidence);
  }
  return [...set];
}
