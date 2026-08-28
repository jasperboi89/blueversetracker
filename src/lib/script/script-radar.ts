/**
 * Phase 4 — Script Radar observations.
 *
 * Feeds the existing Operational Radar with a small number of *high-value*
 * script signals. The bar for emitting is deliberately high: the radar caps at
 * `MAX_RADAR_ITEMS`, so a noisy script source would crowd out ticket and
 * coverage signals that matter more.
 *
 * Language contract: these observations describe structure and history. They
 * never claim a script change caused an outcome.
 */

import type { RadarItem, RadarSeverity } from "@/lib/core/operational-radar";
import { MIN_TRUSTED_COVERAGE } from "./script-contract";
import type { ScriptVersion } from "./script-contract";
import type { ScriptHistoryInsight } from "./script-history";

export interface ScriptRadarInput {
  scriptId: string;
  title: string;
  latest: ScriptVersion;
  history: ScriptHistoryInsight;
}

/** Only genuinely actionable conditions earn a radar slot. */
const MAX_SCRIPT_RADAR_ITEMS = 3;

export function buildScriptRadar(inputs: ScriptRadarInput[]): RadarItem[] {
  const items: Array<RadarItem & { weight: number }> = [];

  for (const input of inputs) {
    const { latest, history, title, scriptId } = input;
    const route = `/knowledge-vault?section=is-scripts&script=${encodeURIComponent(scriptId)}`;

    // 1. Unresolved dependency targets — a jump with nowhere to land is the
    //    single most actionable structural finding.
    if (latest.complexity.unresolvedCount > 0) {
      items.push({
        id: `script.unresolved.${scriptId}`,
        category: "quality",
        severity: (latest.complexity.unresolvedCount >= 3 ? "elevated" : "notice") as RadarSeverity,
        title: `${title}: ${latest.complexity.unresolvedCount} unresolved target(s)`,
        detail:
          "Referenced by name in the script but no matching component was found. Confirm the target exists or the reference is stale.",
        route,
        weight: 100 + latest.complexity.unresolvedCount,
      });
    }

    // 2. Recognition degrading — the script is drifting away from what the
    //    extractor can read, so every other Phase 4 answer about it weakens.
    if (history.recognitionTrend === "degrading") {
      items.push({
        id: `script.recognition.${scriptId}`,
        category: "quality",
        severity: "notice",
        title: `${title}: structural recognition is dropping`,
        detail: `Unrecognised lines have increased across ${history.versionCount} recorded version(s). Dependency and impact answers for this script are less complete than they were.`,
        route,
        weight: 80,
      });
    }

    // 3. Partial analysis on a script that is actively changing.
    if (latest.complexity.coverage < MIN_TRUSTED_COVERAGE && history.structuralRevisions >= 2) {
      items.push({
        id: `script.partial.${scriptId}`,
        category: "quality",
        severity: "notice",
        title: `${title}: analysed at ${Math.round(latest.complexity.coverage * 100)}% coverage`,
        detail:
          "This script is being revised while most of it is unrecognised. Impact analysis and regression suites for it are incomplete.",
        route,
        weight: 70,
      });
    }

    // 4. Churn hotspot — one component absorbing repeated revisions.
    const hotspot = history.hotspots[0];
    if (hotspot && hotspot.changeCount >= 3) {
      items.push({
        id: `script.churn.${scriptId}`,
        category: "quality",
        severity: "info",
        title: `${title}: "${hotspot.name}" changed ${hotspot.changeCount} times`,
        detail:
          "Repeatedly revised across recorded versions. Reviewing it as a whole may be quicker than another incremental edit.",
        route,
        weight: 50 + hotspot.changeCount,
      });
    }
  }

  return items
    .sort((a, b) => b.weight - a.weight || a.id.localeCompare(b.id))
    .slice(0, MAX_SCRIPT_RADAR_ITEMS)
    .map(({ weight: _weight, ...item }) => item);
}
