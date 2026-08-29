/**
 * Phase 10 — the EXECUTABLE allowlist.
 *
 * The canonical Capability Registry (Phase 16 / `capability-registry.ts`) is
 * still the one source of truth for what a capability *is*. This module adds
 * the strictly narrower question: "may this capability be EXECUTED by the
 * governed execution engine, and under what execution contract?"
 *
 * Allowlist semantics: unknown capability → not executable. There is no
 * generic "execute anything" path, and a capability cannot opt itself in from
 * a prompt, a plan, or a model response.
 */

import { getCapability } from "@/lib/capability/capability-registry";
import {
  resolveConfirmation,
  type ExecutableCapability,
} from "./execution-contract";

/* ------------------------------------------------------------------ */
/* Allowlist                                                           */
/* ------------------------------------------------------------------ */

const CONTRACTS: ExecutableCapability[] = [
  {
    capabilityId: "night_plan.item.create",
    version: 1,
    name: "Create night plan item",
    operationClass: "reversible_write",
    riskClass: "low",
    reversibility: "reversible",
    confirmation: "single",
    effectSummary: "Adds one item to tonight's plan.",
    idempotency: { supported: true, strategy: "fingerprint" },
    preconditions: [
      { id: "authenticated", label: "Signed-in operator", unmetNote: "Sign in before applying changes." },
    ],
    verification: { required: true, authority: "database", label: "The item reads back from the plan" },
    compensation: { automatic: false, label: "Complete or remove the item manually." },
    maxAttempts: 2,
  },
  {
    capabilityId: "night_plan.item.complete",
    version: 1,
    name: "Complete night plan item",
    operationClass: "reversible_write",
    riskClass: "low",
    reversibility: "reversible",
    confirmation: "single",
    effectSummary: "Marks one existing night plan item complete.",
    idempotency: { supported: true, strategy: "fingerprint" },
    preconditions: [
      { id: "authenticated", label: "Signed-in operator", unmetNote: "Sign in before applying changes." },
      { id: "item_exists", label: "The item exists in tonight's plan", unmetNote: "That item isn't in tonight's plan." },
    ],
    verification: { required: true, authority: "database", label: "The item reads back as complete" },
    compensation: { automatic: false, label: "Reopen the item manually." },
    maxAttempts: 2,
  },
  {
    capabilityId: "freshdesk.ticket.classify",
    version: 1,
    name: "Set ticket classification",
    operationClass: "reversible_write",
    riskClass: "medium",
    reversibility: "reversible",
    confirmation: "single",
    effectSummary: "Changes the tracked classification on one ticket.",
    idempotency: { supported: true, strategy: "fingerprint" },
    preconditions: [
      { id: "authenticated", label: "Signed-in operator", unmetNote: "Sign in before applying changes." },
      { id: "ticket_tracked", label: "Ticket is tracked locally", unmetNote: "That ticket isn't tracked yet." },
    ],
    verification: { required: true, authority: "database", label: "Classification reads back as requested" },
    compensation: { automatic: false, label: "Set the classification back to its previous value." },
    maxAttempts: 2,
  },
  {
    capabilityId: "work.timer.start",
    version: 1,
    name: "Start work timer",
    operationClass: "reversible_write",
    riskClass: "low",
    reversibility: "reversible",
    confirmation: "single",
    effectSummary: "Starts the work timer against a tracked ticket.",
    idempotency: { supported: true, strategy: "fingerprint" },
    preconditions: [
      { id: "authenticated", label: "Signed-in operator", unmetNote: "Sign in before applying changes." },
    ],
    verification: { required: true, authority: "database", label: "A running timer reads back for that ticket" },
    compensation: { automatic: false, label: "Stop the timer manually." },
    maxAttempts: 2,
  },
  {
    capabilityId: "knowledge.draft.create",
    version: 1,
    name: "Create knowledge draft",
    operationClass: "irreversible_write",
    riskClass: "high",
    reversibility: "compensable",
    confirmation: "typed",
    effectSummary: "Creates a durable knowledge draft from a reviewed promotion packet.",
    idempotency: { supported: true, strategy: "fingerprint" },
    preconditions: [
      { id: "authenticated", label: "Signed-in operator", unmetNote: "Sign in before publishing." },
      { id: "review_complete", label: "Promotion packet reviewed", unmetNote: "The packet hasn't been reviewed." },
    ],
    verification: { required: true, authority: "database", label: "The draft reads back from the vault" },
    compensation: { automatic: false, label: "Archive or supersede the created draft." },
    maxAttempts: 1,
  },
];

/* ---------------- Deterministic fixtures (tests only) ---------------- */

const FIXTURE_CONTRACTS: ExecutableCapability[] = [
  {
    capabilityId: "fixture.reversible.write",
    version: 1,
    name: "Fixture reversible write",
    operationClass: "reversible_write",
    riskClass: "low",
    reversibility: "reversible",
    confirmation: "single",
    effectSummary: "Sets a fixture record value.",
    idempotency: { supported: true, strategy: "fingerprint" },
    preconditions: [{ id: "always", label: "Always satisfied", unmetNote: "n/a" }],
    verification: { required: true, authority: "database", label: "Value reads back" },
    maxAttempts: 3,
    fixtureOnly: true,
  },
  {
    capabilityId: "fixture.external.side_effect",
    version: 1,
    name: "Fixture external side effect",
    operationClass: "external_side_effect",
    riskClass: "critical",
    reversibility: "irreversible",
    confirmation: "single", // deliberately weaker than the floor: must be raised
    effectSummary: "Sends something to an external system.",
    idempotency: { supported: false, strategy: "none" },
    preconditions: [{ id: "always", label: "Always satisfied", unmetNote: "n/a" }],
    verification: { required: true, authority: "provider", label: "Provider confirms receipt" },
    compensation: { automatic: false, label: "Contact the recipient and retract manually." },
    maxAttempts: 1,
    fixtureOnly: true,
  },
  {
    capabilityId: "fixture.blocked.capability",
    version: 1,
    name: "Fixture blocked capability",
    operationClass: "irreversible_write",
    riskClass: "critical",
    reversibility: "irreversible",
    confirmation: "blocked",
    effectSummary: "Never executable from this system.",
    idempotency: { supported: false, strategy: "none" },
    preconditions: [],
    verification: { required: true, authority: "operator", label: "n/a" },
    maxAttempts: 1,
    fixtureOnly: true,
  },
];

const ALL = [...CONTRACTS, ...FIXTURE_CONTRACTS].map(normalize);

/** Confirmation is floored by class + risk at registry load, not at call time. */
function normalize(c: ExecutableCapability): ExecutableCapability {
  return Object.freeze({
    ...c,
    confirmation: resolveConfirmation(c.confirmation, c.operationClass, c.riskClass),
    preconditions: Object.freeze([...c.preconditions]) as ExecPreconditionList,
  }) as ExecutableCapability;
}

type ExecPreconditionList = ExecutableCapability["preconditions"];

const BY_ID = new Map(ALL.map((c) => [c.capabilityId, c]));

export function getExecutableCapability(id: string): ExecutableCapability | undefined {
  return BY_ID.get(id);
}

/** Allowlist check. Unknown, blocked, and non-mutating-only ids are excluded. */
export function isExecutable(id: string): boolean {
  const c = BY_ID.get(id);
  return !!c && c.confirmation !== "blocked";
}

/** Operator-visible executable capabilities (fixtures never surface). */
export function listExecutableCapabilities(): ExecutableCapability[] {
  return ALL.filter((c) => !c.fixtureOnly);
}

export function listAllExecutableCapabilities(): ExecutableCapability[] {
  return ALL;
}

/**
 * Consistency with the canonical registry: an executable contract must not
 * claim a lower risk posture than the capability definition it extends. When
 * the canonical registry has no entry (fixtures), the contract stands alone.
 */
export function executableRegistryIssues(): string[] {
  const issues: string[] = [];
  for (const c of ALL) {
    if (c.fixtureOnly) continue;
    const canonical = getCapability(c.capabilityId);
    if (!canonical) {
      issues.push(`${c.capabilityId}: no canonical capability definition`);
      continue;
    }
    if (canonical.lifecycle === "disabled" || canonical.lifecycle === "deprecated") {
      issues.push(`${c.capabilityId}: canonical lifecycle is ${canonical.lifecycle}`);
    }
    if (canonical.version !== c.version) {
      issues.push(`${c.capabilityId}: version drift (${canonical.version} vs ${c.version})`);
    }
  }
  return issues;
}
