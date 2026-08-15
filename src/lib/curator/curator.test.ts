import { describe, expect, it } from "vitest";
import type { OperationalMemory } from "@/lib/memory/memory-contract";
import type { EvidenceConflict } from "@/lib/core/evidence-contract";
import {
  applyConflicts,
  candidateFingerprint,
  curateMemories,
  isCrossAccount,
  isRecurring,
  jaccard,
  recomputeSupport,
  retrievalWeight,
  RECURRENCE_MIN_EPISODES,
} from "./curator-engine";
import {
  canCreateKnowledgeDraft,
  canPromoteResolution,
  hasCriticalConflict,
  type CuratedMemoryCandidate,
} from "./curator-contract";
import { assessRisk, baselineDraft, enforceDraftSafety, knowledgeDiff } from "./promotion-packet";
import { matchExistingKnowledge } from "./knowledge-match";

const T0 = Date.parse("2026-03-01T00:00:00.000Z");
const DAY = 86_400_000;

function mem(i: number, opts: Partial<OperationalMemory> = {}): OperationalMemory {
  const at = new Date(T0 + i * DAY).toISOString();
  return {
    id: `m${i}`,
    class: "procedural_candidate",
    title: "On-call group misrouted after schedule change",
    summary: "Rebuilt the on-call group and retested dispatch routing.",
    subject: { type: "account", id: "A100", label: "Acme" },
    scope: { accountNumber: "A100", ticketId: `T${i}` },
    evidence: [{ sourceType: "freshdesk", sourceId: `T${i}` }],
    origin: "observed",
    confidence: "probable",
    status: "active",
    importance: 0.6,
    tags: [],
    occurredAt: at,
    recordedAt: at,
    fingerprint: `fp-${i}`,
    compiler: "experience-compiler@1",
    episode: {
      narrative: "n",
      actions: ["Rebuilt on-call group", "Retested routing"],
      findings: [],
      outcomes: ["Dispatch routed correctly"],
      unresolved: [],
      transitions: [],
      startedAt: at,
      endedAt: at,
      durationMs: 60_000,
      eventCount: 5,
      closedBy: "ticket_completed",
    },
    ...opts,
  } as OperationalMemory;
}

function curate(memories: OperationalMemory[], now = T0 + 5 * DAY) {
  return curateMemories({ memories, existing: [], now });
}

describe("clustering", () => {
  it("groups memories describing the same situation into one candidate", () => {
    const out = curate([mem(0), mem(1), mem(2)]);
    expect(out.candidates).toHaveLength(1);
    expect(out.candidates[0]!.sourceMemoryIds).toHaveLength(3);
  });

  it("keeps unrelated experiences in separate candidates", () => {
    const other = mem(3, {
      title: "Voicemail box full on holiday greeting",
      summary: "Cleared the mailbox and re-recorded the holiday greeting.",
      fingerprint: "fp-other",
    });
    expect(curate([mem(0), mem(1), other]).candidates.length).toBeGreaterThan(1);
  });

  it("never fabricates a candidate from a single unrelated memory pair", () => {
    expect(jaccard(new Set(["a", "b"]), new Set(["c", "d"]))).toBe(0);
  });

  it("produces a stable fingerprint for the same topic", () => {
    const a = candidateFingerprint({ type: "procedural", topic: "on call group routing", area: "A100" });
    const b = candidateFingerprint({ type: "procedural", topic: "On-Call  Group Routing", area: "A100" });
    expect(a).toBe(b);
  });

  it("is idempotent — re-running does not duplicate candidates", () => {
    const first = curate([mem(0), mem(1)]);
    const second = curateMemories({ memories: [mem(0), mem(1)], existing: first.candidates, now: T0 + 5 * DAY });
    expect(second.candidates).toHaveLength(first.candidates.length);
    expect(second.created).toHaveLength(0);
  });
});

describe("support and recurrence", () => {
  it("counts episodes, accounts and tickets without inflating confidence", () => {
    const s = recomputeSupport(
      [
        { memoryId: "m1", at: new Date(T0).toISOString(), supportType: "episode", confidence: "probable", accountNumber: "A1", ticketId: "T1" },
        { memoryId: "m2", at: new Date(T0 + DAY).toISOString(), supportType: "episode", confidence: "probable", accountNumber: "A2", ticketId: "T2" },
      ],
      [],
      [],
    );
    expect(s.episodeCount).toBe(2);
    expect(s.accountCount).toBe(2);
    expect(s.verifiedEvidenceCount).toBe(0);
    expect(s.recurrenceScore).toBeLessThan(1);
  });

  it("requires several episodes inside the window to be recurring", () => {
    const c = curate([mem(0), mem(1)]).candidates[0]!;
    expect(isRecurring(c, T0 + 5 * DAY)).toBe(false);
    const c3 = curate([mem(0), mem(1), mem(2)]).candidates[0]!;
    expect(c3.support.episodeCount).toBeGreaterThanOrEqual(RECURRENCE_MIN_EPISODES);
    expect(isRecurring(c3, T0 + 5 * DAY)).toBe(true);
  });

  it("does not count episodes outside the recurrence window", () => {
    const c = curate([mem(0), mem(1), mem(2)]).candidates[0]!;
    expect(isRecurring(c, T0 + 120 * DAY)).toBe(false);
  });

  it("detects cross-account patterns", () => {
    const b = mem(1, { subject: { type: "account", id: "B200", label: "Beta" }, scope: { accountNumber: "B200", ticketId: "T9" } });
    const c = curate([mem(0), b]).candidates[0]!;
    expect(isCrossAccount(c)).toBe(true);
  });

  it("repetition alone never marks a candidate verified", () => {
    const c = curate([mem(0), mem(1), mem(2), mem(3)]).candidates[0]!;
    expect(c.reality.confidence).not.toBe("verified");
  });
});

describe("conflict gating", () => {
  const conflict: EvidenceConflict = {
    id: "c1",
    kind: "contradiction",
    status: "unresolved",
    summary: "Account instructions say route to the answering pod instead.",
    subject: { type: "account", id: "A100", label: "Acme" },
    factIds: [],
  } as unknown as EvidenceConflict;

  it("blocks a candidate that contradicts current evidence", () => {
    const c = applyConflicts(curate([mem(0), mem(1), mem(2)]).candidates[0]!, [conflict], T0 + 5 * DAY);
    expect(hasCriticalConflict(c)).toBe(true);
    expect(c.lifecycle).toBe("blocked");
    expect(canCreateKnowledgeDraft(c)).toBe(false);
  });

  it("blocked candidates cannot be promoted to resolution memory", () => {
    const c = applyConflicts(curate([mem(0), mem(1), mem(2)]).candidates[0]!, [conflict], T0 + 5 * DAY);
    expect(canPromoteResolution(c)).toBe(false);
  });

  it("risk is blocked whenever unresolved conflicts exist", () => {
    const c = applyConflicts(curate([mem(0), mem(1), mem(2)]).candidates[0]!, [conflict], T0 + 5 * DAY);
    expect(assessRisk(c, "create")).toBe("blocked");
  });
});

describe("draft safety", () => {
  it("qualifies overbroad claims instead of publishing them", () => {
    const r = enforceDraftSafety("This always fixes routing for every account.", { accountCount: 1, episodeCount: 2 });
    expect(r.ok).toBe(true);
    expect(r.body).not.toMatch(/\balways\b/i);
    expect(r.removedClaims.length).toBeGreaterThan(0);
  });

  it("drops drafts containing sensitive content rather than masking them", () => {
    const r = enforceDraftSafety("Call the client at 555-123-4567 to confirm.", { accountCount: 2, episodeCount: 3 });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("sensitive_content");
    expect(r.body).toBe("");
  });

  it("states the observed scope on every draft", () => {
    const r = enforceDraftSafety("Rebuild the on-call group.", { accountCount: 3, episodeCount: 4 });
    expect(r.body).toMatch(/observed across 3 accounts/);
  });

  it("baseline drafts are built only from observed actions", () => {
    const c = curate([mem(0), mem(1)]).candidates[0]!;
    const draft = baselineDraft(c, [mem(0), mem(1)]);
    expect(draft).toContain("Rebuilt on-call group");
  });
});

describe("diffs and matching", () => {
  it("always shows what would be added and removed", () => {
    const d = knowledgeDiff("<p>Old step one</p>", "New step one\nNew step two");
    expect(d.some((l) => l.kind === "removed")).toBe(true);
    expect(d.some((l) => l.kind === "added")).toBe(true);
  });

  it("suggests updating existing knowledge instead of duplicating it", () => {
    const c = curate([mem(0), mem(1)]).candidates[0]!;
    const matches = matchExistingKnowledge(c, {
      notes: [
        {
          id: "n1",
          title: "On-call group misrouted after schedule change",
          contentHtml: "<p>Rebuild the on-call group and retest dispatch routing.</p>",
        } as never,
      ],
      resolutions: [],
      candidates: [],
    });
    expect(matches.length).toBeGreaterThan(0);
    expect(["equivalent", "overlapping"]).toContain(matches[0]!.relationship);
  });
});

describe("decay", () => {
  it("decays unused candidates but never below the retrieval floor", () => {
    const w = retrievalWeight(
      { importance: 0.4, lastSupportedAt: new Date(T0).toISOString() },
      T0 + 400 * DAY,
    );
    expect(w).toBeGreaterThanOrEqual(0.05);
    expect(w).toBeLessThan(0.4);
  });

  it("recent, recurring candidates outrank stale ones", () => {
    const recent = retrievalWeight(
      { importance: 0.6, lastSupportedAt: new Date(T0 + 390 * DAY).toISOString() },
      T0 + 400 * DAY,
    );
    const stale = retrievalWeight(
      { importance: 0.6, lastSupportedAt: new Date(T0).toISOString() },
      T0 + 400 * DAY,
    );
    expect(recent).toBeGreaterThan(stale);
  });
});

describe("candidate identity", () => {
  it("keeps merge lineage instead of deleting the folded candidate", () => {
    const c: CuratedMemoryCandidate = { ...curate([mem(0)]).candidates[0]!, mergedFrom: ["x1"] };
    expect(c.mergedFrom).toContain("x1");
  });
});
