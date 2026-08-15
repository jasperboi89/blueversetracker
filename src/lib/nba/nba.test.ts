import { describe, expect, it } from "vitest";
import type { PortalContextEnvelope, ContextEvidence } from "@/lib/core/portal-context";
import type { EvidenceConflict, EvidenceFact } from "@/lib/core/evidence-contract";
import { computeNextBestAction, isResultStale, MIN_RECOMMENDATION_SCORE } from "./nba-engine";
import { actionFingerprint, emptyEpisode, type WorkEpisodeSignals } from "./nba-contract";
import { buildWorkProgress, episodeKeyFor } from "./work-progress";
import { parseProcedureSteps } from "./procedure-steps";
import { serializeNextBestAction } from "./nba-serializer";
import { nbaStore } from "./nba-store";

const NOW = Date.parse("2026-08-15T05:00:00.000Z");

const PROCEDURE_TEXT =
  "Verify the current on-call schedule. Verify the SMS destination mapping against Account Context. Check the outbound gateway status.";

function evidence(over: Partial<ContextEvidence> = {}): ContextEvidence {
  return {
    id: "e1",
    sourceType: "knowledge",
    sourceId: "K81",
    title: "SMS dispatch troubleshooting",
    summary: PROCEDURE_TEXT,
    origin: "retrieved",
    confidence: "verified",
    freshness: "current",
    ...over,
  };
}

function fact(over: Partial<EvidenceFact> = {}): EvidenceFact {
  return {
    id: "f1",
    subject: { type: "account", id: "4821" },
    predicate: "dispatch_method",
    value: "sms",
    origin: "observed",
    confidence: "verified",
    source: { type: "account_context", id: "4821" },
    recordedAt: new Date(NOW - 60_000).toISOString(),
    observedAt: new Date(NOW - 60_000).toISOString(),
    freshness: "current",
    status: "active",
    ...over,
  };
}

function envelope(over: Partial<PortalContextEnvelope> = {}): PortalContextEnvelope {
  return {
    version: 1,
    generatedAt: new Date(NOW).toISOString(),
    shiftKey: "2026-08-15",
    location: { area: "freshdesk_work", routeId: "ticket_work", label: "Freshdesk ticket work" },
    active: { ticket: { id: "389443", onScreen: true, origin: "observed" }, account: { id: "4821", onScreen: true, origin: "observed" } },
    workState: { running: true, unsavedChanges: false, unsavedEntities: [] },
    blockers: [],
    awareness: [],
    recentActivity: [],
    evidence: [evidence()],
    facts: [fact()],
    warnings: [],
    budget: { evidenceAvailable: 1 },
    ...over,
  };
}

function run(env: PortalContextEnvelope, episode?: WorkEpisodeSignals) {
  return computeNextBestAction({ envelope: env, episode, now: NOW });
}

const VERIFY_MAPPING = actionFingerprint(
  "VERIFY",
  "Verify the SMS destination mapping against Account Context",
);
const VERIFY_ONCALL = actionFingerprint("VERIFY", "Verify the current on-call schedule");

describe("procedure decomposition", () => {
  it("parses prose guidance into ordered steps", () => {
    const steps = parseProcedureSteps(PROCEDURE_TEXT);
    expect(steps).toHaveLength(3);
    expect(steps[1]).toMatch(/destination mapping/i);
  });

  it("returns no steps for ordinary prose", () => {
    expect(parseProcedureSteps("The customer called about a delayed message.")).toEqual([]);
  });
});

describe("work progress model", () => {
  it("separates completed from remaining checks", () => {
    const episode = { ...emptyEpisode("k"), completedChecks: [VERIFY_ONCALL] };
    const progress = buildWorkProgress(envelope(), episode, NOW);
    expect(progress.completedChecks.map((c) => c.fingerprint)).toContain(VERIFY_ONCALL);
    expect(progress.remainingChecks.map((c) => c.fingerprint)).toContain(VERIFY_MAPPING);
  });

  it("keeps superseded facts out of the verified set", () => {
    const progress = buildWorkProgress(
      envelope({ facts: [fact({ status: "superseded", supersededBy: ["f2"] })] }),
      emptyEpisode("k"),
      NOW,
    );
    expect(progress.verifiedFacts).toHaveLength(0);
    expect(progress.contextOnlyFacts).toHaveLength(1);
  });
});

describe("recommendation basics", () => {
  it("recommends the first unverified procedure step with high grounding", () => {
    const r = run(envelope());
    expect(r.outcome).toBe("recommended");
    expect(r.primary?.kind).toBe("VERIFY");
    expect(r.primary?.reasonCodes).toContain("MISSING_REQUIRED_CHECK");
    expect(r.primary?.reasonCodes).toContain("VERIFIED_PROCEDURE_STEP");
    expect(r.primary!.score).toBeGreaterThan(MIN_RECOMMENDATION_SCORE);
  });

  it("does not recommend a completed step again", () => {
    const episode = { ...emptyEpisode(episodeKeyFor(envelope())), completedChecks: [VERIFY_ONCALL] };
    const r = run(envelope(), episode);
    expect(r.primary?.fingerprint).not.toBe(VERIFY_ONCALL);
    const completed = r.candidates.find((c) => c.fingerprint === VERIFY_ONCALL);
    expect(completed?.state ?? "absent").not.toBe("recommended");
  });

  it("surfaces one primary and at most two alternatives", () => {
    const r = run(envelope());
    expect(r.alternatives.length).toBeLessThanOrEqual(2);
  });

  it("exposes why-this and what-would-change-this", () => {
    const r = run(envelope());
    expect(r.primary!.reasonCodes.length).toBeGreaterThan(0);
    expect(r.primary!.whatWouldChangeThis.length).toBeGreaterThan(0);
  });
});

describe("uncertainty and evidence hierarchy", () => {
  it("prefers verification over mutation while uncertainty is high", () => {
    const r = run(envelope({ facts: [] }));
    expect(["VERIFY", "CHECK", "COMPARE", "LOOK_UP", "REVIEW"]).toContain(r.primary?.kind);
  });

  it("turns a similar prior resolution into a verification, never a fix", () => {
    const env = envelope({
      evidence: [
        evidence({
          id: "e2",
          sourceType: "resolution",
          sourceId: "R82",
          title: "Mapping rebuilt",
          summary: "Restart the dispatch service and change the destination mapping.",
          confidence: "verified",
        }),
      ],
    });
    const r = run(env);
    const mutating = r.candidates.filter((c) => c.kind === "PREPARE_ACTION" && c.state === "recommended");
    expect(mutating).toHaveLength(0);
    expect(r.primary && ["VERIFY", "COMPARE"]).toBeTruthy();
    expect(r.primary?.kind === "COMPARE" || r.primary?.kind === "VERIFY").toBe(true);
  });

  it("produces only low-confidence checks from memory-only signals", () => {
    const env = envelope({
      evidence: [],
      facts: [],
      memory: [
        {
          id: "m1",
          memoryClass: "episodic",
          title: "Gateway outage last month",
          summary: "Outbound gateway was down.",
          occurredAt: new Date(NOW - 30 * 86_400_000).toISOString(),
          status: "active",
          origin: "retrieved",
          importance: 0.4,
          relevance: 0.5,
          reasons: ["account"],
        },
      ],
    });
    const r = run(env);
    if (r.outcome === "recommended") {
      expect(r.primary?.confidence).toBe("low");
      expect(r.primary?.evidenceConfidence).toBe("unknown");
    } else {
      expect(r.outcome).toBe("no_recommendation");
    }
  });

  it("triggers re-verification when guidance is stale", () => {
    const r = run(envelope({ evidence: [evidence({ freshness: "stale" })] }));
    expect(r.primary?.reasonCodes).toContain("STALE_GUIDANCE");
    expect(r.primary?.kind).toBe("VERIFY");
  });
});

describe("conflicts", () => {
  const conflict: EvidenceConflict = {
    id: "c1",
    subject: { type: "account", id: "4821" },
    predicate: "dispatch_method",
    factIds: ["f1", "f2"],
    values: [
      { factId: "f1", value: "sms", origin: "observed", confidence: "verified" },
      { factId: "f2", value: "fax", origin: "retrieved", confidence: "probable" },
    ],
    status: "unresolved",
    detectedAt: new Date(NOW).toISOString(),
  };

  it("makes verifying the authoritative value the next best action", () => {
    const r = run(envelope({ evidenceConflicts: [conflict] }));
    expect(r.primary?.reasonCodes).toContain("CONFLICT_REQUIRES_VERIFICATION");
  });

  it("blocks mutation-capable candidates while a conflict is unresolved", () => {
    const env = envelope({
      evidenceConflicts: [conflict],
      evidence: [
        evidence(),
        evidence({ id: "e3", sourceId: "K82", summary: "Change the routing profile. Update the destination mapping." }),
      ],
    });
    const r = run(env);
    for (const c of r.candidates.filter((x) => x.proposedSafeAction || x.kind === "PREPARE_ACTION")) {
      expect(c.state).toBe("blocked");
    }
  });
});

describe("blockers, wait and no recommendation", () => {
  it("returns WAIT when work is pending an external response and nothing else applies", () => {
    const env = envelope({
      evidence: [],
      facts: [],
      blockers: [
        {
          id: "b1",
          type: "waiting_customer",
          label: "Waiting on customer confirmation",
          since: new Date(NOW - 3_600_000).toISOString(),
          origin: "observed",
        },
      ],
    });
    const r = run(env);
    expect(r.outcome).toBe("wait");
    expect(r.waitReason).toMatch(/waiting/i);
  });

  it("returns NO_RECOMMENDATION rather than inventing one", () => {
    const r = run(envelope({ evidence: [], facts: [], memory: [] }));
    expect(r.outcome).toBe("no_recommendation");
    expect(r.primary).toBeUndefined();
    expect(r.noRecommendationReason).toMatch(/evidence|grounded/i);
  });

  it("treats an unresolved blocker as a candidate next step", () => {
    const env = envelope({
      blockers: [
        {
          id: "b2",
          type: "dependency",
          label: "Account configuration unavailable",
          since: new Date(NOW - 600_000).toISOString(),
          origin: "observed",
        },
      ],
    });
    const r = run(env);
    expect(r.candidates.some((c) => c.reasonCodes.includes("UNRESOLVED_BLOCKER"))).toBe(true);
  });
});

describe("failed actions and idempotency", () => {
  const failing = () =>
    envelope({
      evidence: [
        evidence({
          summary: "Restart the dispatch service. Change the destination mapping.",
          confidence: "verified",
        }),
      ],
    });

  it("does not repeat an action that already failed this episode", () => {
    const env = failing();
    const target = run(env).candidates[0];
    const episode: WorkEpisodeSignals = {
      ...emptyEpisode(episodeKeyFor(env)),
      attempts: [
        { fingerprint: target.fingerprint, outcome: "failed", at: new Date(NOW - 300_000).toISOString() },
      ],
    };
    const r = run(env, episode);
    expect(r.primary?.fingerprint).not.toBe(target.fingerprint);
    const blocked = r.candidates.find((c) => c.fingerprint === target.fingerprint);
    expect(blocked?.state === "blocked" || blocked?.reasonCodes.includes("PRIOR_FAILED_ACTION")).toBe(true);
  });

  it("re-opens a failed action once conditions change", () => {
    const env = envelope();
    const target = run(env).primary!;
    const at = new Date(NOW - 300_000).toISOString();
    const episode: WorkEpisodeSignals = {
      ...emptyEpisode(episodeKeyFor(env)),
      attempts: [
        {
          fingerprint: target.fingerprint,
          outcome: "failed",
          at,
          conditionsChangedAt: new Date(NOW - 60_000).toISOString(),
        },
      ],
    };
    const r = run(env, episode);
    const again = r.candidates.find((c) => c.fingerprint === target.fingerprint);
    expect(again?.state).not.toBe("blocked");
  });

  it("gives the same next step a stable fingerprint", () => {
    expect(run(envelope()).primary!.fingerprint).toBe(run(envelope()).primary!.fingerprint);
  });
});

describe("dismissal and expiry", () => {
  it("does not resurface a dismissed suggestion in the same work", () => {
    const env = envelope();
    const first = run(env).primary!;
    const episode: WorkEpisodeSignals = {
      ...emptyEpisode(episodeKeyFor(env)),
      dismissed: [{ fingerprint: first.fingerprint, at: new Date(NOW).toISOString(), reason: "already_checked" }],
    };
    const r = run(env, episode);
    expect(r.primary?.fingerprint).not.toBe(first.fingerprint);
  });

  it("expires a result when the active ticket changes", () => {
    const r = run(envelope());
    const other = envelope({
      active: { ticket: { id: "999999", onScreen: true, origin: "observed" } },
    });
    expect(isResultStale(r, other)).toBe(true);
    expect(isResultStale(r, envelope())).toBe(false);
  });

  it("revalidates a resumed episode before recommending", () => {
    const env = envelope();
    const episode = { ...emptyEpisode(episodeKeyFor(env)), resumed: true };
    const r = run(env, episode);
    expect(r.candidates.some((c) => c.reasonCodes.includes("RESUMED_UNRESOLVED_EPISODE"))).toBe(true);
  });
});

describe("safe action boundary", () => {
  it("only ever prepares a proposal, never executes", () => {
    const env = envelope();
    const r = run(env);
    for (const c of r.candidates) {
      if (c.proposedSafeAction) expect(c.proposedSafeAction.requiresConfirmation).toBe(true);
    }
  });

  it("blocks prepared writes when the session cannot write", () => {
    const r = computeNextBestAction({
      envelope: envelope(),
      now: NOW,
      permissions: { canPrepareWrites: false },
    });
    for (const c of r.candidates.filter((x) => x.proposedSafeAction)) {
      expect(c.state).toBe("blocked");
      expect(c.reasonCodes).toContain("PERMISSION_REQUIRED");
    }
  });
});

describe("privacy and telemetry", () => {
  it("keeps sensitive-looking content out of the copilot section", () => {
    const text = serializeNextBestAction(run(envelope()));
    expect(text).toContain("## NEXT-BEST-ACTION STATE");
    expect(text).not.toMatch(/@|\b\d{3}[-. ]?\d{3}[-. ]?\d{4}\b/);
  });

  it("stores only fingerprints and outcomes in episode state", () => {
    nbaStore.reset();
    nbaStore.recordAttempt("ep", "verify_mapping", "failed");
    const ep = nbaStore.getEpisode("ep");
    expect(Object.keys(ep.attempts[0]).sort()).toEqual(["at", "fingerprint", "label", "outcome"].sort());
    nbaStore.reset();
  });
});

describe("end-to-end flows", () => {
  it("Flow A — safe investigation recomputes after the missing check completes", () => {
    const env = envelope();
    const first = run(env);
    expect(first.primary?.kind).toBe("VERIFY");
    const episode = {
      ...emptyEpisode(episodeKeyFor(env)),
      completedChecks: [first.primary!.fingerprint],
    };
    const second = run(env, episode);
    expect(second.primary?.fingerprint).not.toBe(first.primary!.fingerprint);
  });

  it("Flow B — prior resolution never becomes a mutation recommendation", () => {
    const env = envelope({
      facts: [],
      evidence: [
        evidence({
          sourceType: "resolution",
          sourceId: "R82",
          summary: "Change the mapping and restart the dispatch service.",
        }),
      ],
    });
    const r = run(env);
    expect(r.primary?.kind).not.toBe("PREPARE_ACTION");
  });

  it("Flow C — conflict blocks unsafe actions and explains itself", () => {
    const env = envelope({
      evidenceConflicts: [
        {
          id: "c9",
          subject: { type: "account", id: "4821" },
          predicate: "routing",
          factIds: ["f1", "f2"],
          values: [
            { factId: "f1", value: "sms", origin: "observed", confidence: "verified" },
            { factId: "f2", value: "fax", origin: "retrieved", confidence: "probable" },
          ],
          status: "unresolved",
          detectedAt: new Date(NOW).toISOString(),
        },
      ],
    });
    const r = run(env);
    expect(serializeNextBestAction(r)).toMatch(/CONFLICT_REQUIRES_VERIFICATION/);
  });

  it("Flow D — a writable recommendation stops at the proposal boundary", () => {
    const env = envelope();
    const r = run(env);
    const prepared = r.candidates.find((c) => c.proposedSafeAction);
    if (prepared) {
      expect(prepared.proposedSafeAction!.type).toBe("add_night_plan_item");
      expect(prepared.state === "recommended" || prepared.state === "blocked").toBe(true);
    }
  });
});