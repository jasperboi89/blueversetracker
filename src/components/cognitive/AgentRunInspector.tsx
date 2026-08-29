/**
 * Phase 9 — AgentRunInspector.
 *
 * A factual, structured view of ONE orchestrated cognitive run. It renders
 * canonical run artifacts only:
 *
 *   route · waves · worker contributions · claim validation · Critic ·
 *   Guardian · budgets · stop reason · assembly
 *
 * It is deliberately NOT a chain-of-thought viewer. Private scratch reasoning,
 * prompts, raw ticket bodies, script source, PHI and secrets are never read
 * here — the run record does not carry them and this component never asks for
 * them. Every value below comes from the canonical run, never from an LLM
 * re-explaining what happened.
 */

import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { ChevronDown, ChevronRight } from "lucide-react";
import type {
  CognitiveRun,
  CriticResult,
  WorkerId,
  WorkerOutput,
} from "@/lib/cognitive/worker-contract";
import { getWorker } from "@/lib/cognitive/worker-registry";
import { getCapability } from "@/lib/capability/capability-registry";
import { runStatusLabel } from "@/lib/cognitive/run-store";
import {
  Bullets,
  Field,
  RunBadge,
  Section,
  fmtDuration,
  fmtWhen,
  guardianTone,
  statusTone,
  workerStatusTone,
} from "./run-ui";

export function AgentRunInspector({ run }: { run: CognitiveRun }) {
  return (
    <div className="space-y-3" data-testid="agent-run-inspector">
      <RunSummary run={run} />
      <Routing run={run} />
      <ExecutionWaves run={run} />
      <WorkerContributions run={run} />
      <ClaimValidation run={run} />
      <CriticReview run={run} />
      <GuardianSection run={run} />
      <Disagreements run={run} />
      <AssemblySection run={run} />
      <BudgetInspector run={run} />
      <StopReasonSection run={run} />
      <Timeline run={run} />
      <TechnicalMetadata run={run} />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* PART 5 — run summary                                                */
/* ------------------------------------------------------------------ */

function RunSummary({ run }: { run: CognitiveRun }) {
  return (
    <Section title="Run summary">
      <div className="flex flex-wrap items-center gap-1.5">
        <RunBadge tone={statusTone(run.state)}>{runStatusLabel(run.state)}</RunBadge>
        <RunBadge tone="info">{run.cognitionTier.toUpperCase()} COGNITION</RunBadge>
        <RunBadge>{String(run.intentClass).toUpperCase()}</RunBadge>
        {run.guardian && (
          <RunBadge tone={guardianTone(run.guardian.decision)}>GUARDIAN {run.guardian.decision}</RunBadge>
        )}
        <RunBadge tone={run.sensitivity === "restricted" ? "warn" : "neutral"}>
          {(run.sensitivity ?? "internal").toUpperCase()}
        </RunBadge>
        {run.injectionMarkers?.length ? (
          <RunBadge tone="warn">INSTRUCTION-LIKE CONTENT IGNORED</RunBadge>
        ) : null}
      </div>

      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Field label="Correlation id" value={<code className="font-mono">{run.correlationId}</code>} />
        <Field label="Started" value={fmtWhen(run.startedAt)} />
        <Field label="Completed" value={fmtWhen(run.endedAt)} />
        <Field label="Duration" value={fmtDuration(run.usage.elapsedMs)} />
        <Field label="Workers" value={String(run.participation.length)} />
        <Field label="Critic used" value={run.critiques.length ? "Yes" : "No"} />
        <Field label="Guardian used" value={run.guardian ? "Yes" : "No"} />
        <Field label="Stop reason" value={(run.stopReason ?? "completed").toUpperCase()} />
        <Field
          label="Account"
          value={
            run.accountId ? (
              <Link
                to="/accounts/$accountNumber"
                params={{ accountNumber: run.accountId }}
                className="text-sky-300 underline-offset-2 hover:underline"
              >
                {run.accountId}
              </Link>
            ) : (
              "No account in scope"
            )
          }
        />
        <Field label="Operator" value={<code className="font-mono">{run.operatorRef}</code>} />
        {run.asOf ? <Field label="As of" value={fmtWhen(run.asOf)} /> : null}
        <Field
          label="Audit log"
          value={
            <Link to="/audit-log" className="text-sky-300 underline-offset-2 hover:underline">
              Related system events
            </Link>
          }
        />
      </dl>

      <p className="rounded border border-border/40 bg-black/20 p-2 text-[11px] text-muted-foreground">
        Request: {run.intent}
      </p>
    </Section>
  );
}

/* ------------------------------------------------------------------ */
/* PART 6/7 — routing + skipped workers                                */
/* ------------------------------------------------------------------ */

function Routing({ run }: { run: CognitiveRun }) {
  const { plan } = run;
  return (
    <Section title="Routing" subtitle="Deterministic route decision — not reconstructed by a model.">
      <dl className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <Field label="Normalized intent" value={String(plan.intentClass).toUpperCase()} />
        <Field
          label="Route"
          value={
            plan.direct
              ? "DIRECT RESPONSE"
              : plan.steps.map((s) => s.workerId.toUpperCase()).join(" → ") || "GOVERNANCE ONLY"
          }
        />
        <Field label="Cognition tier" value={plan.cognitionTier.toUpperCase()} />
      </dl>

      {plan.direct && (
        <p className="rounded border border-sky-500/30 bg-sky-500/5 p-2 text-[11px] text-sky-200">
          DIRECT RESPONSE — no specialist cognition was required. {plan.directReason}
        </p>
      )}

      <div className="space-y-1">
        <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Why</p>
        <Bullets
          items={[
            ...plan.steps.map((s) => `${s.workerId.toUpperCase()}: ${s.reason}`),
            `CRITIC: ${plan.criticReason}`,
            `GUARDIAN: ${plan.guardianReason}`,
          ]}
        />
      </div>

      {plan.honouredDirectives.length > 0 && (
        <div>
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Directives honoured</p>
          <Bullets items={plan.honouredDirectives} />
        </div>
      )}
      {plan.refusedDirectives.length > 0 && (
        <div>
          <p className="text-[10px] uppercase tracking-wide text-amber-300">Directives refused</p>
          <Bullets items={plan.refusedDirectives} />
        </div>
      )}

      {run.specialistRequests?.length ? (
        <div>
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Specialist requests</p>
          <ul className="space-y-1">
            {run.specialistRequests.map((r, i) => (
              <li key={`${r.from}-${r.to}-${i}`} className="text-xs">
                <span className="font-medium text-foreground/80">
                  {r.from.toUpperCase()} → {r.to.toUpperCase()}
                </span>{" "}
                — orchestrator {r.granted ? "GRANTED" : "DECLINED"}: {r.reason}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {run.skippedWorkers?.length ? (
        <div>
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Not invoked</p>
          <ul className="space-y-1">
            {run.skippedWorkers.map((s) => (
              <li key={s.workerId} className="text-xs">
                <span className="font-medium text-foreground/80">{s.workerId.toUpperCase()}</span> — {s.reason}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </Section>
  );
}

/* ------------------------------------------------------------------ */
/* PART 8 — execution waves                                            */
/* ------------------------------------------------------------------ */

function ExecutionWaves({ run }: { run: CognitiveRun }) {
  const waves = Array.from(new Set(run.plan.steps.map((s) => s.wave))).sort((a, b) => a - b);
  return (
    <Section title="Execution waves" subtitle="Workers in the same wave ran independently; waves ran in order.">
      {run.plan.direct || waves.length === 0 ? (
        <p className="text-[11px] text-muted-foreground">No worker waves — the run resolved directly.</p>
      ) : (
        <ol className="space-y-2">
          {waves.map((wave, idx) => {
            const steps = run.plan.steps.filter((s) => s.wave === wave);
            return (
              <li key={wave} className="rounded border border-border/40 p-2">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Wave {idx + 1}</p>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {steps.map((s) => (
                    <RunBadge key={s.workerId}>{s.workerId.toUpperCase()}</RunBadge>
                  ))}
                </div>
                {steps.length > 1 && (
                  <p className="mt-1 text-[11px] text-muted-foreground">Parallel independent reads.</p>
                )}
              </li>
            );
          })}
          {run.critiques.length > 0 && (
            <li className="rounded border border-border/40 p-2">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Review</p>
              <RunBadge>CRITIC</RunBadge>
            </li>
          )}
          {run.guardian && (
            <li className="rounded border border-border/40 p-2">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Governance</p>
              <RunBadge tone={guardianTone(run.guardian.decision)}>GUARDIAN</RunBadge>
            </li>
          )}
          <li className="rounded border border-border/40 p-2">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Assembly</p>
            <RunBadge>ASSEMBLER</RunBadge>
          </li>
        </ol>
      )}
    </Section>
  );
}

/* ------------------------------------------------------------------ */
/* PART 9/10 — worker cards + structured output                        */
/* ------------------------------------------------------------------ */

function WorkerContributions({ run }: { run: CognitiveRun }) {
  return (
    <Section title="Worker contributions" subtitle="Structured contributions only — no private reasoning is recorded.">
      {run.contributions.length === 0 ? (
        <p className="text-[11px] text-muted-foreground">No specialist was invoked for this run.</p>
      ) : (
        <div className="space-y-2">
          {run.contributions.map((c, i) => (
            <WorkerCard key={`${c.workerId}-${i}`} run={run} output={c} />
          ))}
        </div>
      )}
    </Section>
  );
}

function WorkerCard({ run, output }: { run: CognitiveRun; output: WorkerOutput }) {
  const [open, setOpen] = useState(false);
  const part = run.participation.find((p) => p.workerId === output.workerId);
  const def = getWorker(output.workerId);
  return (
    <div className="rounded border border-border/40">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
      >
        {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        <span className="font-medium text-foreground/90">{output.workerId.toUpperCase()}</span>
        <RunBadge>v{output.workerVersion}</RunBadge>
        <RunBadge tone={workerStatusTone(output.status)}>{output.status.replace(/_/g, " ").toUpperCase()}</RunBadge>
        {part?.revision ? <RunBadge tone="warn">REVISED</RunBadge> : null}
        <span className="ml-auto text-[10px] text-muted-foreground">{fmtDuration(output.elapsedMs)}</span>
      </button>

      {open && (
        <div className="space-y-2 border-t border-border/40 p-2">
          <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Field label="Role" value={def.role} />
            <Field label="Confidence" value={output.confidence.toUpperCase()} />
            <Field label="Operation class" value={output.operationClass.toUpperCase()} />
            <Field label="Sensitivity" value={output.sensitivity.toUpperCase()} />
            <Field label="Claims" value={String(output.claims.length)} />
            <Field label="Evidence refs" value={String(output.evidence.length)} />
            <Field
              label="Budget used"
              value={`${output.budgetUsed.maxToolCalls}/${def.budget.maxToolCalls} tools · ${output.budgetUsed.maxEvidenceItems}/${def.budget.maxEvidenceItems} evidence`}
            />
            <Field label="Requested specialist" value={output.needsSpecialist?.toUpperCase() ?? "None"} />
          </dl>

          {part && (
            <p className="text-[11px] text-muted-foreground">Why invoked: {part.routeReason}</p>
          )}
          <p className="text-xs">{output.summary}</p>

          {output.claims.length > 0 && (
            <div>
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Claims</p>
              <ul className="space-y-1">
                {output.claims.map((cl) => (
                  <li key={cl.id} className="rounded border border-border/30 p-1.5 text-xs">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <RunBadge>{cl.type.replace(/_/g, " ").toUpperCase()}</RunBadge>
                      <RunBadge tone={cl.confidence === "verified" ? "good" : "neutral"}>
                        {cl.confidence.toUpperCase()}
                      </RunBadge>
                    </div>
                    <p className="mt-1">{cl.statement}</p>
                    {cl.evidence.length > 0 && (
                      <p className="mt-0.5 font-mono text-[10px] text-muted-foreground">
                        {cl.evidence.map((e) => `${e.kind}:${e.id}`).join(" · ")}
                      </p>
                    )}
                    <Bullets items={cl.limitations} />
                  </li>
                ))}
              </ul>
            </div>
          )}

          <EvidenceRefs output={output} />

          {output.uncertainties.length > 0 && (
            <div>
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Uncertainties</p>
              <Bullets items={output.uncertainties} />
            </div>
          )}
          {output.contradictions.length > 0 && (
            <div>
              <p className="text-[10px] uppercase tracking-wide text-amber-300">Contradictions</p>
              <Bullets items={output.contradictions} />
            </div>
          )}
          {output.recommendations.length > 0 && (
            <div>
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Recommendations</p>
              <Bullets items={output.recommendations} />
            </div>
          )}
          {output.preparedArtifacts.length > 0 && (
            <div>
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Prepared artifacts</p>
              <Bullets
                items={output.preparedArtifacts.map((a) => `${a.kind.replace(/_/g, " ")}: ${a.label} (awaiting your confirmation)`)}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* PART 12 — evidence references                                       */
/* ------------------------------------------------------------------ */

function EvidenceRefs({ output }: { output: WorkerOutput }) {
  if (!output.evidence.length) return null;
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Evidence references</p>
      <ul className="space-y-0.5">
        {output.evidence.map((e, i) => (
          <li key={`${e.kind}-${e.id}-${i}`} className="font-mono text-[10px] text-muted-foreground">
            {e.kind}:{e.id}
            {e.label ? <span className="font-sans"> — {e.label}</span> : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* PART 11 — claim validation                                          */
/* ------------------------------------------------------------------ */

function ClaimValidation({ run }: { run: CognitiveRun }) {
  const issues = run.claimValidation ?? [];
  return (
    <Section title="Claim validation" subtitle="Canonical references cited by workers are checked before assembly.">
      {issues.length === 0 ? (
        <p className="text-[11px] text-emerald-300">
          VALID — every cited canonical reference exists in this account and time scope.
        </p>
      ) : (
        <ul className="space-y-1">
          {issues.map((iss, i) => (
            <li key={`${iss.claimId}-${i}`} className="rounded border border-red-500/30 bg-red-500/5 p-1.5 text-xs">
              <div className="flex flex-wrap items-center gap-1.5">
                <RunBadge tone="bad">REJECTED</RunBadge>
                <RunBadge>{iss.code.replace(/_/g, " ")}</RunBadge>
              </div>
              <p className="mt-1 font-mono text-[10px]">
                claim {iss.claimId} → {iss.kind}:{iss.id}
              </p>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

/* ------------------------------------------------------------------ */
/* PART 13/14/15 — Critic + bounded revision                           */
/* ------------------------------------------------------------------ */

function CriticReview({ run }: { run: CognitiveRun }) {
  const used = run.critiques.length > 0;
  return (
    <Section title="Critic review" subtitle={run.plan.criticReason}>
      <div className="flex flex-wrap items-center gap-1.5">
        <RunBadge tone={used ? "info" : "neutral"}>CRITIC {used ? "USED" : "NOT USED"}</RunBadge>
        <RunBadge tone={run.usage.revisions ? "warn" : "neutral"}>
          REVISION PASSES {run.usage.revisions} / {run.budget.maxRevisions}
        </RunBadge>
      </div>

      {!used ? (
        <p className="text-[11px] text-muted-foreground">No critique was required for this route.</p>
      ) : (
        run.critiques.map((c, i) => <CritiqueCard key={`${c.reviewedWorker}-${i}`} critique={c} run={run} />)
      )}
    </Section>
  );
}

function CritiqueCard({ critique, run }: { critique: CriticResult; run: CognitiveRun }) {
  const material = critique.issues.filter((i) => i.material);
  const revised = run.participation.find((p) => p.workerId === critique.reviewedWorker)?.revision ?? 0;
  const unresolved = material.length > 0 && revised === 0;
  return (
    <div className="rounded border border-border/40 p-2">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-xs font-medium text-foreground/90">
          Reviewed {critique.reviewedWorker.toUpperCase()}
        </span>
        <RunBadge tone={critique.status === "unavailable" ? "bad" : "neutral"}>
          {critique.status.toUpperCase()}
        </RunBadge>
        {critique.issues.length === 0 ? (
          <RunBadge tone="good">NO MATERIAL ISSUE</RunBadge>
        ) : (
          critique.issues.map((i, n) => (
            <RunBadge key={`${i.code}-${n}`} tone={i.material ? "warn" : "neutral"}>
              {i.code.replace(/_/g, " ")}
            </RunBadge>
          ))
        )}
        <RunBadge tone={critique.revisionRequested ? "warn" : "neutral"}>
          REVISION {critique.revisionRequested ? "REQUESTED" : "NOT REQUIRED"}
        </RunBadge>
      </div>
      <p className="mt-1 text-xs">{critique.summary}</p>
      {material.length > 0 && (
        <div className="mt-1">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Material findings</p>
          <Bullets items={material.map((i) => `${i.target}: ${i.detail}${i.suggestedFix ? ` — ${i.suggestedFix}` : ""}`)} />
        </div>
      )}
      {revised > 0 && (
        <p className="mt-1 text-[11px] text-amber-200">
          Bounded revision pass applied (1 / {run.budget.maxRevisions}); the revised contribution is shown above.
        </p>
      )}
      {unresolved && (
        <p className="mt-1 text-[11px] text-amber-300">
          UNRESOLVED — the revision budget was spent or unavailable, so this issue stands. The run did not loop.
        </p>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* PART 16/17/18 — Guardian                                            */
/* ------------------------------------------------------------------ */

function GuardianSection({ run }: { run: CognitiveRun }) {
  const g = run.guardian;
  if (!g) {
    return (
      <Section title="Guardian" subtitle="Governance authority — separate from factual analysis.">
        <p className="text-[11px] text-muted-foreground">
          Not required: {run.plan.guardianReason}
        </p>
      </Section>
    );
  }
  const cap = g.capabilityId ? getCapability(g.capabilityId) : undefined;
  return (
    <Section title="Guardian" subtitle="Governs authority only — it neither agrees nor disagrees with the analysis.">
      <div className="flex flex-wrap items-center gap-1.5">
        <RunBadge tone={guardianTone(g.decision)}>{g.decision.replace(/_/g, " ")}</RunBadge>
        {!g.available && <RunBadge tone="bad">GUARDIAN UNAVAILABLE — FAILED CLOSED</RunBadge>}
        {g.reasonCodes.map((r) => (
          <RunBadge key={r}>{r.replace(/_/g, " ")}</RunBadge>
        ))}
      </div>
      <p className="text-xs">{g.explanation}</p>
      {!g.available && (
        <p className="rounded border border-red-500/40 bg-red-500/10 p-2 text-[11px] text-red-200">
          Governance review could not be established, so the run is BLOCKED. Cognition never continues ungoverned.
        </p>
      )}
      {g.limits.length > 0 && (
        <div>
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Limits</p>
          <Bullets items={g.limits} />
        </div>
      )}

      {g.capabilityId && (
        <div className="rounded border border-border/40 p-2">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Capability basis</p>
          {cap ? (
            <dl className="mt-1 grid grid-cols-2 gap-2 sm:grid-cols-3">
              <Field label="Capability" value={`${cap.id}@${cap.version}`} />
              <Field label="Operation class" value={cap.operation.toUpperCase()} />
              <Field label="Risk" value={cap.risk.toUpperCase()} />
              <Field label="Side effects" value={cap.sideEffects.replace(/_/g, " ").toUpperCase()} />
              <Field label="Max autonomy" value={(cap.autonomy ?? "derived").toUpperCase()} />
              <Field label="Required permission" value={cap.permissions.required.join(", ") || "none"} />
              <Field label="Minimum role" value={cap.permissions.minimumRole.toUpperCase()} />
              <Field
                label="Prerequisites"
                value={cap.prerequisites.map((p) => p.label).join(", ") || "none"}
              />
              <Field label="Confirmation" value={cap.confirmation.mode.replace(/_/g, " ").toUpperCase()} />
              <Field
                label="Verification"
                value={cap.verification.required ? `${cap.verification.authority}: ${cap.verification.method}` : "not required"}
              />
              <Field label="Sensitivity" value={cap.dataClass.toUpperCase()} />
              <Field label="Lifecycle" value={cap.lifecycle.toUpperCase()} />
            </dl>
          ) : (
            <p className="mt-1 text-[11px] text-red-300">
              <code className="font-mono">{g.capabilityId}</code> is not present in the Capability Registry, so no
              authorization could be established.
            </p>
          )}
        </div>
      )}
      <p className="text-[10px] text-muted-foreground">
        Operator authorization result: {g.decision === "INSUFFICIENT_AUTHORITY" ? "DENIED" : g.available ? "EVALUATED" : "UNRESOLVED"}
      </p>
    </Section>
  );
}

/* ------------------------------------------------------------------ */
/* PART 19/21 — disagreement + authority hierarchy                     */
/* ------------------------------------------------------------------ */

function Disagreements({ run }: { run: CognitiveRun }) {
  const items = run.disagreements ?? [];
  return (
    <Section title="Disagreement" subtitle="Preserved rather than averaged into a false consensus.">
      {items.length === 0 ? (
        <p className="text-[11px] text-muted-foreground">No worker disagreement was recorded.</p>
      ) : (
        <>
          <Bullets items={items} />
          {run.response?.multiplePlausibleExplanations && (
            <p className="text-[11px] text-amber-200">
              FINAL: multiple plausible explanations remain; no consensus was forced.
            </p>
          )}
        </>
      )}
    </Section>
  );
}

/* ------------------------------------------------------------------ */
/* PART 20 — assembler                                                 */
/* ------------------------------------------------------------------ */

function AssemblySection({ run }: { run: CognitiveRun }) {
  const r = run.response;
  if (!r) return null;
  return (
    <Section title="Final assembly">
      <div className="flex flex-wrap items-center gap-1.5">
        <RunBadge tone={r.status === "answered" ? "good" : r.status === "blocked" ? "bad" : "warn"}>
          {r.status.replace(/_/g, " ").toUpperCase()}
        </RunBadge>
        <RunBadge>{run.contributions.length} INPUT CONTRIBUTIONS</RunBadge>
        <RunBadge tone={r.disagreements.length ? "warn" : "neutral"}>
          {r.disagreements.length} DISAGREEMENTS PRESERVED
        </RunBadge>
      </div>
      <p className="text-xs">{r.answer}</p>
      {r.governanceNote && <p className="text-[11px] text-amber-200">Guardian limit: {r.governanceNote}</p>}
      {r.analysisUsed.length > 0 && (
        <div>
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Analysis used</p>
          <Bullets items={r.analysisUsed} />
        </div>
      )}
      {r.uncertainties.length > 0 && (
        <div>
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Uncertainties</p>
          <Bullets items={r.uncertainties} />
        </div>
      )}
    </Section>
  );
}

/* ------------------------------------------------------------------ */
/* PART 22 — budgets                                                   */
/* ------------------------------------------------------------------ */

function BudgetInspector({ run }: { run: CognitiveRun }) {
  const rows: Array<[string, string]> = [
    ["Workers", `${run.usage.workers} / ${run.budget.maxWorkers}`],
    ["Worker invocations", `${run.usage.invocations} / ${run.budget.maxWorkerInvocations}`],
    ["Orchestration depth", `${run.usage.depth} / ${run.budget.maxOrchestrationDepth}`],
    ["Revision passes", `${run.usage.revisions} / ${run.budget.maxRevisions}`],
    ["Elapsed", `${fmtDuration(run.usage.elapsedMs)} / ${fmtDuration(run.budget.maxElapsedMs)}`],
    ["Context class", (run.sensitivity ?? "internal").toUpperCase()],
  ];
  return (
    <Section title="Budgets">
      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {rows.map(([k, v]) => (
          <Field key={k} label={k} value={v} />
        ))}
      </dl>
    </Section>
  );
}

/* ------------------------------------------------------------------ */
/* PART 23/24/25/27/28/30/31 — stop reason and run conditions          */
/* ------------------------------------------------------------------ */

const STOP_EXPLANATION: Record<string, string> = {
  completed: "The run finished its planned cognition.",
  direct_response: "Resolved entirely from deterministic canonical state; no specialist added value.",
  worker_budget_exceeded: "The maximum number of workers for this run was reached.",
  invocation_budget_exceeded: "The maximum number of worker invocations for this run was reached.",
  depth_exceeded: "The orchestration depth limit was reached.",
  duplicate_task: "Fingerprint loop detection fired: a worker repeated an identical contribution.",
  no_progress: "Repeated cognition produced no new validated claims or evidence.",
  guardian_blocked: "Governance blocked capability progression.",
  guardian_unavailable: "Governance review was unavailable, so the run failed closed.",
  all_workers_unavailable: "No specialist was able to contribute.",
  wall_clock_exceeded: "The run exceeded its wall-clock budget.",
  cancelled: "The run was cancelled.",
  runtime_error: "The run failed before it could finish.",
};

function StopReasonSection({ run }: { run: CognitiveRun }) {
  const stop = run.stopReason ?? "completed";
  const loop = stop === "duplicate_task";
  const noProgress = stop === "no_progress";
  const budget = stop.includes("budget") || stop === "depth_exceeded" || stop === "wall_clock_exceeded";
  const failedWorkers = run.contributions.filter((c) => c.status === "failed" || c.status === "unavailable");

  return (
    <Section title="Stop reason">
      <div className="flex flex-wrap items-center gap-1.5">
        <RunBadge tone={stop === "completed" || stop === "direct_response" ? "good" : budget || loop || noProgress ? "warn" : "bad"}>
          {stop.replace(/_/g, " ").toUpperCase()}
        </RunBadge>
        {budget && <RunBadge tone="warn">BUDGET EXHAUSTED</RunBadge>}
        {loop && <RunBadge tone="warn">LOOP DETECTED</RunBadge>}
        {noProgress && <RunBadge tone="warn">NO PROGRESS</RunBadge>}
      </div>
      <p className="text-xs">{STOP_EXPLANATION[stop] ?? stop}</p>

      {loop && (
        <div className="rounded border border-amber-500/40 bg-amber-500/5 p-2 text-[11px]">
          <p>Action taken: the run was stopped and returned what was already safe to show.</p>
          <ul className="mt-1 space-y-0.5 font-mono text-[10px] text-muted-foreground">
            {run.participation.map((p, i) => (
              <li key={`${p.workerId}-${i}`}>
                {p.workerId} · fingerprint {p.fingerprint}
              </li>
            ))}
          </ul>
        </div>
      )}

      {run.state === "partial" && (
        <div className="rounded border border-amber-500/40 bg-amber-500/5 p-2 text-[11px]">
          <p className="font-medium text-amber-200">PARTIAL — not a failure.</p>
          <p>
            Completed: {run.contributions.filter((c) => c.status === "contributed").map((c) => c.workerId).join(", ") || "none"}.
          </p>
          {failedWorkers.length > 0 && (
            <p>Missing specialist: {failedWorkers.map((c) => c.workerId).join(", ")}.</p>
          )}
          <p>What was still safe to return is shown in the final assembly.</p>
        </div>
      )}

      {failedWorkers.length > 0 && (
        <div>
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Worker failures</p>
          <ul className="space-y-0.5 text-xs">
            {failedWorkers.map((c, i) => (
              <li key={`${c.workerId}-${i}`}>
                <span className="font-medium">{c.workerId.toUpperCase()}</span>{" "}
                <RunBadge tone="bad">{c.status.toUpperCase()}</RunBadge> — {c.summary}
              </li>
            ))}
          </ul>
        </div>
      )}

      {run.injectionMarkers?.length ? (
        <div className="rounded border border-amber-500/40 bg-amber-500/5 p-2 text-[11px]">
          <p className="font-medium text-amber-200">RETRIEVED CONTENT TREATED AS DATA</p>
          <ul className="mt-1 space-y-0.5 font-mono text-[10px]">
            {run.injectionMarkers.map((m, i) => (
              <li key={`${m.source}-${i}`}>
                {m.source} — {m.codes.join(", ")}
              </li>
            ))}
          </ul>
          <p className="mt-1 text-muted-foreground">Instruction-like content was ignored; the text itself is not reproduced.</p>
        </div>
      ) : null}
    </Section>
  );
}

/* ------------------------------------------------------------------ */
/* PART 34 — timeline                                                  */
/* ------------------------------------------------------------------ */

function Timeline({ run }: { run: CognitiveRun }) {
  const events = run.events ?? [];
  if (!events.length) return null;
  return (
    <Section title="Cognitive timeline" subtitle="Lifecycle events only — never token-level or reasoning events.">
      <ol className="space-y-1">
        {events.map((e, i) => (
          <li key={`${e.at}-${i}`} className="flex gap-2 text-xs">
            <span className="font-mono text-[10px] text-muted-foreground">{fmtWhen(e.at).split(", ").pop()}</span>
            <span>{e.label}</span>
          </li>
        ))}
      </ol>
    </Section>
  );
}

/* ------------------------------------------------------------------ */
/* PART 32/33 — traceability + worker versions                         */
/* ------------------------------------------------------------------ */

function TechnicalMetadata({ run }: { run: CognitiveRun }) {
  const versions: Array<[string, number | string]> = [
    ...run.participation.map((p) => [p.workerId, p.workerVersion] as [WorkerId, number]),
    ...(run.critiques.length ? [["critic", run.critiques[0].workerVersion] as [string, number]] : []),
    ...(run.guardian ? [["guardian", run.guardian.workerVersion] as [string, number]] : []),
    ["orchestrator", 1],
    ["assembler", 1],
  ];
  return (
    <Section title="Technical metadata" subtitle="Versions are those used at run time and are never reinterpreted.">
      <div className="flex flex-wrap gap-1.5">
        {versions.map(([id, v], i) => (
          <RunBadge key={`${id}-${i}`}>
            {String(id).toUpperCase()} v{v}
          </RunBadge>
        ))}
      </div>
      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Field label="AI profile" value={`${run.cognitionTier} cognition tier`} />
        <Field label="Model route class" value="Router-resolved (worker is model-independent)" />
        <Field label="Provider class" value="Lovable AI gateway" />
        <Field label="Fallback used" value={run.contributions.some((c) => c.status === "unavailable") ? "Yes" : "No"} />
        <Field label="Task id" value={<code className="font-mono">{run.taskId}</code>} />
        <Field label="Retention" value={`In-session buffer, newest ${30} runs`} />
      </dl>
    </Section>
  );
}
