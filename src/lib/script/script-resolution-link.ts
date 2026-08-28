/**
 * Phase 4 — Resolution Memory integration.
 *
 * Links a script change to past resolutions that touched the same structural
 * ground, so an operator revising a script can see "we have been here before".
 *
 * Strictly correlational. Matching is on shared vocabulary between resolution
 * text and component names — it says a past resolution *mentions* the same
 * component, never that the script caused the issue or that the old fix
 * applies. The Causal Language Contract governs the wording here.
 */

import { normalizeKey, type ScriptStructure } from "./script-contract";
import type { ChangeImpact } from "./change-impact";

export interface ResolutionLike {
  id: string;
  title: string;
  summary?: string;
  tags?: string[];
  createdAt?: string;
}

export interface ScriptResolutionMatch {
  resolutionId: string;
  title: string;
  /** Component names the resolution text mentions. */
  matchedComponents: string[];
  /** 0–1 share of the resolution's matchable terms that hit. Not a probability. */
  overlap: number;
  /** Always correlational — rendered verbatim next to the match. */
  note: string;
}

/** Words too common to be evidence of anything. */
const STOP = new Set([
  "the", "and", "for", "with", "call", "caller", "script", "page", "step",
  "then", "when", "this", "that", "from", "into", "please", "note", "info",
]);

function terms(text: string): Set<string> {
  return new Set(
    normalizeKey(text)
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length >= 4 && !STOP.has(w)),
  );
}

const MIN_MATCHES = 2;

export function matchResolutions(
  structure: ScriptStructure,
  impact: ChangeImpact,
  resolutions: ResolutionLike[],
  limit = 5,
): ScriptResolutionMatch[] {
  // Only components in the impact set are worth matching — matching the whole
  // script would hit almost every resolution and mean nothing.
  const relevant = new Map<string, Set<string>>();
  for (const hit of impact.impacted) {
    const component = structure.components.find((c) => c.id === hit.id);
    if (component) relevant.set(component.name, terms(component.name));
  }
  if (relevant.size === 0) return [];

  const matches: ScriptResolutionMatch[] = [];

  for (const resolution of resolutions) {
    const haystack = terms(`${resolution.title} ${resolution.summary ?? ""} ${(resolution.tags ?? []).join(" ")}`);
    if (haystack.size === 0) continue;

    const matched: string[] = [];
    let hits = 0;
    for (const [name, componentTerms] of relevant) {
      const overlapping = [...componentTerms].filter((t) => haystack.has(t));
      if (overlapping.length > 0) {
        matched.push(name);
        hits += overlapping.length;
      }
    }

    if (matched.length < MIN_MATCHES) continue;

    matches.push({
      resolutionId: resolution.id,
      title: resolution.title,
      matchedComponents: matched.sort(),
      overlap: Math.min(1, hits / haystack.size),
      note: "Shares wording with components in this change. Correlation only — review before reusing.",
    });
  }

  return matches
    .sort((a, b) => b.overlap - a.overlap || a.title.localeCompare(b.title))
    .slice(0, limit);
}
