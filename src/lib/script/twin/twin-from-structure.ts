/**
 * Activation 7 — build a Script Twin screen model from a recognized
 * `ScriptStructure` (source: STRUCTURAL_IMPORT).
 *
 * This is the one honest, automatic data path the Twin has today: it projects
 * the components the text extractor already recognised into a renderable screen
 * model. It does NOT decode binary IIF, invent screens, or fabricate branch
 * behaviour — anything the extractor did not establish is carried as an honest
 * evidence state (`observed` for what was seen, `unknown` for unresolved
 * targets) so the renderer can never imply certainty the structure lacks.
 *
 * Sections become screens; prompts/fields/branches become elements. When there
 * are no sections, a single screen holds the recognised elements. The result is
 * always `validatedAgainstRealExport: false` — a structural projection is not a
 * real-export validation.
 */

import type { ScriptComponent, ScriptStructure } from "../script-contract";
import type { EvidenceState } from "./evidence-state";
import {
  normalizeModel,
  type TwinElement,
  type TwinElementType,
  type TwinProvenance,
  type TwinScreen,
  type TwinScriptModel,
} from "./twin-model";

function prov(evidence: EvidenceState, note?: string): TwinProvenance {
  return { source: "STRUCTURAL_IMPORT", evidence, note };
}

/** Map a recognised component kind to the closest Twin element type. */
function elementTypeFor(kind: ScriptComponent["kind"]): TwinElementType {
  switch (kind) {
    case "prompt":
      return "prompt";
    case "message":
      return "instruction";
    case "field":
      return "text";
    case "branch":
      return "combo";
    case "transfer":
    case "action":
    case "calculation":
      return "action";
    case "include":
      return "navigation";
    default:
      return "readonly";
  }
}

/** Elements that carry an unresolved outbound dependency are honestly `unknown`. */
function evidenceForComponent(
  component: ScriptComponent,
  structure: ScriptStructure,
): EvidenceState {
  const outbound = structure.dependencies.filter((d) => d.fromId === component.id);
  const anyUnresolved = outbound.some((d) => d.resolution === "unresolved");
  if (anyUnresolved) return "partial";
  // Recognised in a real text structure = observed, never asserted as verified.
  return "observed";
}

export interface TwinFromStructureOptions {
  scriptId: string;
  versionId?: string;
  title: string;
}

export function buildTwinFromStructure(
  structure: ScriptStructure,
  opts: TwinFromStructureOptions,
): TwinScriptModel {
  const sections = structure.components.filter((c) => c.kind === "section");
  const nonSection = structure.components.filter((c) => c.kind !== "section");

  const toElement = (c: ScriptComponent, order: number): TwinElement => ({
    id: c.id,
    type: elementTypeFor(c.kind),
    label: c.name,
    provenance: prov(
      evidenceForComponent(c, structure),
      `recognised as ${c.kind} at line ${c.line}`,
    ),
    order,
  });

  const screens: TwinScreen[] = [];

  if (sections.length === 0) {
    // No sections recognised → one screen holding every recognised element.
    screens.push({
      id: "screen:all",
      title: opts.title,
      elements: nonSection.map(toElement),
      navigation: [],
      provenance: prov("observed", "single screen — no sections recognised"),
    });
  } else {
    // Each section is a screen; elements are assigned by line order between
    // this section and the next. This is a structural projection, so screen
    // membership is `partial` (line-range heuristic), never `verified`.
    const sorted = [...sections].sort((a, b) => a.line - b.line);
    sorted.forEach((section, i) => {
      const start = section.line;
      const end = i + 1 < sorted.length ? sorted[i + 1]!.line : Number.POSITIVE_INFINITY;
      const owned = nonSection.filter((c) => c.line > start && c.line < end);
      screens.push({
        id: `screen:${section.id}`,
        title: section.name,
        elements: owned.map(toElement),
        navigation:
          i + 1 < sorted.length
            ? [
                {
                  id: `nav:${section.id}:next`,
                  label: "Next",
                  toScreenId: `screen:${sorted[i + 1]!.id}`,
                  provenance: prov("inferred", "sequential section order (not a verified branch)"),
                },
              ]
            : [],
        provenance: prov("partial", "screen membership by line range (heuristic)"),
      });
    });
  }

  const model: TwinScriptModel = {
    scriptId: opts.scriptId,
    versionId: opts.versionId,
    title: opts.title,
    screens,
    entryScreenId: screens[0]?.id ?? "screen:all",
    // A structural projection is never a real-export validation.
    validatedAgainstRealExport: false,
  };
  return normalizeModel(model);
}
