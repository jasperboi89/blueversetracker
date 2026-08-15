import { describe, expect, it, beforeEach } from "vitest";
import type { PortalContextEnvelope, ContextEvidence } from "@/lib/core/portal-context";
import type { EvidenceConflict, EvidenceFact } from "@/lib/core/evidence-contract";
import { actionFingerprint, emptyEpisode, type WorkEpisodeSignals } from "@/lib/nba/nba-contract";
import { episodeKeyFor } from "@/lib/nba/work-progress";
import { buildGuardedPlan } from "./plan-builder";
import { planStore } from "./plan-store";
import { serializeGuardedPlan } from "./plan-serializer";
import { emptyPlanState, isPlanStale, type PlanEpisodeState } from "./plan-contract";

const NOW = Date.parse("2026-08-15T05:00:00.000Z");

const PROCEDURE_TEXT =
  "Verify the current on-call schedule. Verify the SMS destination mapping against Account Context. Restart the outbound gateway service.";

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
    active: {
      ticket: { id: "389443", onScreen: true, origin: "observed" },
      account: { id: "4821", onScreen: true, origin: "observed" },
    },
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

function build(
  env: PortalContextEnvelope,
  planState?: PlanEpisodeState,
  episode?: WorkEpisodeSignals,
  permissions?: { canPrepareWrites?: boolean },
) {
  return buildGuardedPlan({ envelope: env, planState, episode, permissions, now: NOW });
}

const MUTATING = actionFingerprint("PREPARE_ACTION", "Restart the outbound gateway service");

describe("guarded plan builder", () => {
  it("derives ordered steps from grounded guidance only", () => {
    const plan = build(envelope());
    expect(plan.steps.length).toBeGreaterThan(1);
    for (const s of plan.steps) {
      expect(s.derivation).toMatch(/parsed|structured|engine|inferred/);
      expect(s.rationale).toBeTruthy();
    }
  });

  it("offers no plan when nothing is grounded", () => {
    const plan = build(envelope({ evidence: [], facts: [] }));
    expect(plan.steps).toHaveLength(0);
    expect(plan.status).toBe("draft");
    expect(plan.warnings[0].code).toBe("no_grounded_steps");
  });

  it("is deterministic for the same input", () => {
    expect(JSON.stringify(build(envelope()))).toBe(JSON.stringify(build(envelope())));
  });

  it("inserts a verification step before every mutating step", () => {
    const plan = build(envelope());
    const mutatingIndexes = plan.steps.filter((s) => s.mutating).map((s) => s.index);
    for (const i of mutatingIndexes) {
      expect(i).toBeGreaterThan(0);
      expect(plan.steps[i - 1].mutating).toBe(false);
    }
  });

  it("only the first step is startable; everything after it is pending", () => {
    const plan = build(envelope());
    expect(plan.steps[0].status).toBe("ready");
    expect(plan.steps.slice(1).every((s) => s.status !== "ready")).toBe(true);
  });
});

describe("verification loop", () => {
  it("does not advance while a step is only claimed done", () => {
    const key = episodeKeyFor(envelope());
    const state: PlanEpisodeState = {
      ...emptyPlanState(key),
      decisions: [
        {
          fingerprint: build(envelope()).steps[0].fingerprint,
          kind: "claimed_done",
          at: new Date(NOW).toISOString(),
          by: "operator",
        },
      ],
    };
    const plan = build(envelope(), state);
    expect(plan.steps[0].status).toBe("awaiting_verification");
    expect(plan.steps[1].status).toBe("pending");
    expect(plan.status).toBe("awaiting_verification");
  });

  it("advances only after operator verification", () => {
    const first = build(envelope()).steps[0];
    const key = episodeKeyFor(envelope());
    const state: PlanEpisodeState = {
      ...emptyPlanState(key),
      decisions: [
        { fingerprint: first.fingerprint, kind: "verified", at: new Date(NOW).toISOString(), by: "operator" },
      ],
    };
    const plan = build(envelope(), state);
    expect(plan.steps[0].status).toBe("verified");
    expect(plan.steps[1].status).toBe("ready");
  });

  it("halts the plan when a verification fails", () => {
    const first = build(envelope()).steps[0];
    const key = episodeKeyFor(envelope());
    const plan = build(envelope(), {
      ...emptyPlanState(key),
      decisions: [
        { fingerprint: first.fingerprint, kind: "failed", at: new Date(NOW).toISOString(), by: "operator" },
      ],
    });
    expect(plan.steps[0].status).toBe("failed");
    expect(plan.status).toBe("halted");
    expect(plan.haltReason).toMatch(/Verification failed/);
    expect(plan.steps.slice(1).some((s) => s.status === "ready")).toBe(false);
  });

  it("marks the plan complete only when every step is settled", () => {
    const base = build(envelope());
    const key = episodeKeyFor(envelope());
    const plan = build(envelope(), {
      ...emptyPlanState(key),
      decisions: base.steps.map((s) => ({
        fingerprint: s.fingerprint,
        kind: "verified" as const,
        at: new Date(NOW).toISOString(),
        by: "operator" as const,
      })),
    });
    expect(plan.status).toBe("complete");
  });
});

describe("plan safety gate", () => {
  /** Verify every step BEFORE the first mutating one, so the gate is exercised. */
  function verifyUpToMutation(env: PortalContextEnvelope): PlanEpisodeState {
    const base = build(env);
    const firstMutating = base.steps.findIndex((s) => s.mutating);
    const upTo = firstMutating === -1 ? base.steps.length : firstMutating;
    return {
      ...emptyPlanState(episodeKeyFor(env)),
      decisions: base.steps.slice(0, upTo).map((s) => ({
        fingerprint: s.fingerprint,
        kind: "verified" as const,
        at: new Date(NOW).toISOString(),
        by: "operator" as const,
      })),
    };
  }

  it("blocks a mutating step while evidence conflicts are unresolved", () => {
    const conflict: EvidenceConflict = {
      id: "c1",
      subject: { type: "account", id: "4821" },
      predicate: "dispatch_method",
      values: [],
      status: "unresolved",
      detectedAt: new Date(NOW).toISOString(),
    } as unknown as EvidenceConflict;
    const env = envelope({ evidenceConflicts: [conflict] });
    const plan = build(env, verifyUpToMutation(env));
    const mutating = plan.steps.find((s) => s.mutating);
    expect(mutating?.status).toBe("blocked");
    expect(mutating?.blockers[0].type).toBe("evidence_conflict");
  });

  it("blocks mutating steps without write permission", () => {
    const env = envelope();
    const plan = buildGuardedPlan({
      envelope: env,
      planState: verifyUpToMutation(env),
      permissions: { canPrepareWrites: false },
      now: NOW,
    });
    const mutating = plan.steps.find((s) => s.mutating);
    expect(mutating?.status).toBe("blocked");
    expect(mutating?.blockers[0].type).toBe("permission");
  });

  it("blocks a mutating step when nothing is verified about the current state", () => {
    const env = envelope({ facts: [] });
    const plan = build(env, verifyUpToMutation(env));
    const mutating = plan.steps.find((s) => s.mutating);
    expect(mutating?.status).toBe("blocked");
    expect(mutating?.blockers[0].type).toBe("unverified_state");
  });

  it("blocks non-review steps behind an operational blocker", () => {
    const env = envelope({
      blockers: [
        {
          id: "b1",
          type: "action_uncertain",
          label: "Outcome needs verification",
          since: new Date(NOW).toISOString(),
          origin: "observed",
        },
      ],
    });
    const base = build(env);
    // Reviewing the blocker itself stays allowed; nothing else may start.
    expect(base.steps.filter((s) => s.kind !== "REVIEW").every((s) => s.status !== "ready")).toBe(true);
    // Once the review step is settled, the next operational step is blocked,
    // not silently promoted to ready.
    const afterReview = build(env, {
      ...emptyPlanState(episodeKeyFor(env)),
      decisions: base.steps
        .filter((s) => s.kind === "REVIEW")
        .map((s) => ({
          fingerprint: s.fingerprint,
          kind: "verified" as const,
          at: new Date(NOW).toISOString(),
          by: "operator" as const,
        })),
    });
    const next = afterReview.steps.find((s) => s.kind !== "REVIEW");
    expect(next?.status).toBe("blocked");
  });

  it("never attaches a prepared action to a step that is not ready", () => {
    const plan = build(envelope());
    for (const s of plan.steps) {
      if (s.proposedSafeAction) expect(s.status).toBe("ready");
    }
  });
});

describe("plan state + staleness", () => {
  beforeEach(() => planStore.reset());

  it("keeps only the latest decision per step", () => {
    planStore.decide("k", MUTATING, "started");
    planStore.decide("k", MUTATING, "verified");
    const s = planStore.get("k");
    expect(s.decisions).toHaveLength(1);
    expect(s.decisions[0].kind).toBe("verified");
  });

  it("halts and resumes without losing decisions", () => {
    planStore.decide("k", MUTATING, "verified");
    planStore.halt("k", "Stopped by the operator.");
    expect(planStore.get("k").halted).toBe(true);
    planStore.resume("k");
    expect(planStore.get("k").halted).toBe(false);
    expect(planStore.get("k").decisions).toHaveLength(1);
  });

  it("returns a stable snapshot for untouched episodes", () => {
    expect(planStore.get("fresh")).toBe(planStore.get("fresh"));
  });

  it("treats a plan from another episode as stale", () => {
    const plan = build(envelope());
    expect(isPlanStale(plan, plan.episodeKey, plan.contextKey)).toBe(false);
    expect(isPlanStale(plan, "other", plan.contextKey)).toBe(true);
  });

  it("blocks every step while the plan is stopped", () => {
    const env = envelope();
    const plan = build(env, { ...emptyPlanState(episodeKeyFor(env)), halted: true, haltReason: "stopped" });
    expect(plan.status).toBe("halted");
    expect(plan.steps.every((s) => s.status === "blocked")).toBe(true);
  });
});

describe("plan serialization", () => {
  it("states the rules and never claims unverified progress", () => {
    const text = serializeGuardedPlan(build(envelope()));
    expect(text).toContain("## GUARDED PLAN");
    expect(text).toMatch(/never authorization/i);
    expect(text).toMatch(/ONLY when its status is verified/i);
    expect(text.length).toBeLessThanOrEqual(1400);
  });

  it("is explicit when no plan exists", () => {
    const text = serializeGuardedPlan(build(envelope({ evidence: [], facts: [] })));
    expect(text).toMatch(/STEPS: none/);
  });

  it("carries the halt reason to the model", () => {
    const first = build(envelope()).steps[0];
    const text = serializeGuardedPlan(
      build(envelope(), {
        ...emptyPlanState(episodeKeyFor(envelope())),
        decisions: [
          { fingerprint: first.fingerprint, kind: "failed", at: new Date(NOW).toISOString(), by: "operator" },
        ],
      }),
    );
    expect(text).toMatch(/HALTED:/);
  });

  it("does not leak evidence bodies", () => {
    const text = serializeGuardedPlan(build(envelope()));
    expect(text).not.toContain("Account Context.");
  });
});

describe("episode isolation", () => {
  it("plan identity follows the work episode", () => {
    const a = build(envelope());
    const b = build(envelope({ active: { ticket: { id: "999", onScreen: true, origin: "observed" } } }));
    expect(a.episodeKey).not.toBe(b.episodeKey);
  });

  it("ignores decisions recorded against another episode", () => {
    const plan = build(envelope(), {
      ...emptyPlanState("someone-elses-episode"),
      decisions: [
        { fingerprint: "verify:nope", kind: "verified", at: new Date(NOW).toISOString(), by: "operator" },
      ],
    });
    expect(plan.steps[0].status).toBe("ready");
  });

  it("an empty episode produces the same plan as no episode", () => {
    const env = envelope();
    expect(JSON.stringify(build(env, undefined, emptyEpisode(episodeKeyFor(env))))).toBe(
      JSON.stringify(build(env)),
    );
  });
});