/**
 * Intelligence Core — Phase 16: the ONE canonical Capability Registry.
 *
 * Copilot, NBA, Guarded Plans and the Safe Action Executor all read their
 * capability metadata from here. There are no per-consumer metadata islands:
 * they get *views* (projections), never their own copy of the truth.
 *
 * The registry describes and routes. Domain services execute.
 */

import type { ActionType } from "@/lib/core/actions";
import {
  capabilityRef,
  isMutatingOperation,
  type CapabilityDefinition,
} from "./capability-contract";

/* ------------------------------------------------------------------ */
/* Definitions                                                         */
/* ------------------------------------------------------------------ */

const read = {
  confirmation: { mode: "none" } as const,
  idempotency: { supported: true, fingerprintStrategy: "input_hash" } as const,
};

const DEFINITIONS: CapabilityDefinition[] = [
  /* ---------------- Freshdesk / tickets (read) ---------------- */
  {
    id: "freshdesk.ticket.read",
    version: 1,
    name: "Read tracked ticket",
    description:
      "Read one tracked Freshdesk ticket the operator owns: subject, status, classification, work text and recent notes.",
    domain: "freshdesk",
    operation: "read",
    risk: "low",
    sideEffects: "none",
    lifecycle: "active",
    dataClass: "sensitive",
    inputSchema: { number: "string" },
    outputSchema: { ticket: "object" },
    resourceScope: { entityTypes: ["ticket"], crossEntity: false, crossAccount: false },
    permissions: { required: ["portal.read"], minimumRole: "viewer" },
    prerequisites: [
      { kind: "authenticated_operator", label: "Signed-in operator" },
      { kind: "source_system_available", label: "Ticket store reachable" },
    ],
    ...read,
    verification: { required: false, authority: "freshdesk", method: "read_only" },
    execution: { type: "copilot_tool", handlerId: "get_ticket" },
    ai: {
      discoverable: true,
      callable: true,
      exposure: "sanitized",
      allowedTaskKinds: ["lookup", "ticket_investigation", "operational_question", "summary", "handoff_generation"],
    },
    evidence: { produces: true, origin: "retrieved", confidence: "probable" },
  },
  {
    id: "freshdesk.ticket.search",
    version: 1,
    name: "Search tracked tickets",
    description: "Search the operator's tracked tickets by status, account or free text.",
    domain: "freshdesk",
    operation: "search",
    risk: "low",
    sideEffects: "none",
    lifecycle: "active",
    dataClass: "sensitive",
    inputSchema: { status: "string|null", accountNumber: "string|null", query: "string|null" },
    outputSchema: { tickets: "array" },
    resourceScope: { entityTypes: ["ticket"], crossEntity: true, crossAccount: true },
    permissions: { required: ["portal.read"], minimumRole: "viewer" },
    prerequisites: [{ kind: "authenticated_operator", label: "Signed-in operator" }],
    ...read,
    verification: { required: false, authority: "database", method: "read_only" },
    execution: { type: "copilot_tool", handlerId: "search_tickets" },
    ai: { discoverable: true, callable: true, exposure: "sanitized" },
    evidence: { produces: true, origin: "retrieved", confidence: "probable" },
  },

  /* ---------------- Accounts ---------------- */
  {
    id: "account.list.read",
    version: 1,
    name: "List accounts",
    description: "List or search the operator's saved accounts by number or name.",
    domain: "accounts",
    operation: "search",
    risk: "low",
    sideEffects: "none",
    lifecycle: "active",
    dataClass: "internal",
    inputSchema: { query: "string|null" },
    outputSchema: { accounts: "array" },
    resourceScope: { entityTypes: ["account"], crossEntity: true, crossAccount: true },
    permissions: { required: ["portal.read"], minimumRole: "viewer" },
    prerequisites: [{ kind: "authenticated_operator", label: "Signed-in operator" }],
    ...read,
    verification: { required: false, authority: "database", method: "read_only" },
    execution: { type: "copilot_tool", handlerId: "list_accounts" },
    ai: { discoverable: true, callable: true, exposure: "sanitized" },
    evidence: { produces: true, origin: "retrieved", confidence: "probable" },
  },
  {
    id: "account.context.read",
    version: 1,
    name: "Read account context",
    description:
      "Read the assembled Account Context for the account currently in context: counts, freshness and known gaps.",
    domain: "accounts",
    operation: "read",
    risk: "low",
    sideEffects: "none",
    lifecycle: "active",
    dataClass: "sensitive",
    inputSchema: { accountNumber: "string" },
    outputSchema: { context: "object" },
    resourceScope: { entityTypes: ["account"], requiresActiveEntity: true, crossAccount: false },
    permissions: { required: ["portal.read"], minimumRole: "viewer" },
    prerequisites: [
      { kind: "active_account", label: "An account is in context" },
      { kind: "account_context_available", label: "Account Context assembled" },
    ],
    ...read,
    verification: { required: false, authority: "account_context", method: "read_only" },
    execution: { type: "service", handlerId: "account-context-service" },
    ai: {
      discoverable: true,
      callable: true,
      exposure: "local_only",
      allowedTaskKinds: ["account_investigation", "ticket_investigation", "operational_question"],
    },
    evidence: { produces: true, origin: "retrieved", confidence: "probable" },
  },
  {
    id: "account.history.read",
    version: 1,
    name: "Read account history",
    description: "All tracked tickets and logged work time for one account number.",
    domain: "accounts",
    operation: "read",
    risk: "low",
    sideEffects: "none",
    lifecycle: "active",
    dataClass: "sensitive",
    inputSchema: { accountNumber: "string" },
    outputSchema: { tickets: "array", time: "array" },
    resourceScope: { entityTypes: ["account", "ticket"], crossEntity: true },
    permissions: { required: ["portal.read"], minimumRole: "viewer" },
    prerequisites: [{ kind: "authenticated_operator", label: "Signed-in operator" }],
    ...read,
    verification: { required: false, authority: "database", method: "read_only" },
    execution: { type: "copilot_tool", handlerId: "account_history" },
    ai: { discoverable: true, callable: true, exposure: "sanitized" },
    evidence: { produces: true, origin: "retrieved", confidence: "probable" },
  },
  {
    id: "account.config.update",
    version: 1,
    name: "Update account configuration",
    description:
      "Change operational account configuration in the source system. The portal exposes no governed capability for this; it must be done in the source system by a human.",
    domain: "accounts",
    operation: "update",
    risk: "blocked",
    sideEffects: "external",
    lifecycle: "disabled",
    dataClass: "restricted",
    inputSchema: { accountNumber: "string", field: "string", value: "string" },
    outputSchema: { applied: "boolean" },
    resourceScope: { entityTypes: ["account"], requiresActiveEntity: true },
    permissions: { required: ["admin"], minimumRole: "admin" },
    prerequisites: [{ kind: "verified_state", label: "Verified current configuration" }],
    confirmation: { mode: "blocked", prompt: "Not available in this portal." },
    verification: { required: true, authority: "account_context", method: "reread_account_configuration" },
    execution: { type: "manual", handlerId: "source-system" },
    ai: { discoverable: true, callable: false, requiresProposal: false, exposure: "none" },
    idempotency: { supported: false },
    evidence: { produces: false },
  },

  /* ---------------- Dispatch ---------------- */
  {
    id: "dispatch.list.read",
    version: 1,
    name: "Read dispatch sessions",
    description: "Contact Dispatch sessions with their status and account.",
    domain: "dispatch",
    operation: "read",
    risk: "low",
    sideEffects: "none",
    lifecycle: "active",
    dataClass: "sensitive",
    inputSchema: { status: "string|null" },
    outputSchema: { dispatches: "array" },
    resourceScope: { entityTypes: ["dispatch"], crossEntity: true },
    permissions: { required: ["portal.read"], minimumRole: "viewer" },
    prerequisites: [{ kind: "authenticated_operator", label: "Signed-in operator" }],
    ...read,
    verification: { required: false, authority: "dispatch_state", method: "read_only" },
    execution: { type: "copilot_tool", handlerId: "get_dispatches" },
    ai: { discoverable: true, callable: true, exposure: "sanitized" },
    evidence: { produces: true, origin: "retrieved", confidence: "probable" },
  },
  {
    id: "dispatch.status.verify",
    version: 2,
    name: "Verify dispatch outcome",
    description:
      "Record that the operator observed the dispatch outcome (call received, page delivered). The operator is the authoritative observer here.",
    domain: "dispatch",
    operation: "execute",
    risk: "medium",
    sideEffects: "local",
    lifecycle: "active",
    dataClass: "sensitive",
    inputSchema: { dispatchId: "string", observed: "string" },
    outputSchema: { verified: "boolean" },
    resourceScope: { entityTypes: ["dispatch"], requiresActiveEntity: true },
    permissions: { required: ["portal.read"], minimumRole: "viewer" },
    prerequisites: [{ kind: "existing_work_record", label: "An open dispatch session" }],
    confirmation: { mode: "explicit", prompt: "Confirm what you observed on the dispatch test." },
    verification: {
      required: true,
      authority: "operator_observation",
      method: "operator_attestation",
      predicate: "dispatch.outcome",
    },
    execution: { type: "manual", handlerId: "dispatch-observation" },
    ai: { discoverable: true, callable: false, requiresProposal: true, exposure: "local_only" },
    idempotency: { supported: true, fingerprintStrategy: "dispatch_id+observation" },
    evidence: { produces: true, origin: "operator_confirmed", confidence: "verified" },
    dependsOn: ["dispatch.list.read"],
  },
  {
    id: "dispatch.status.check",
    version: 1,
    name: "Check dispatch status (legacy)",
    description: "Superseded by the verified dispatch outcome capability.",
    domain: "dispatch",
    operation: "read",
    risk: "low",
    sideEffects: "none",
    lifecycle: "deprecated",
    dataClass: "internal",
    inputSchema: { dispatchId: "string" },
    outputSchema: { status: "string" },
    resourceScope: { entityTypes: ["dispatch"] },
    permissions: { required: ["portal.read"], minimumRole: "viewer" },
    prerequisites: [],
    ...read,
    verification: { required: false, authority: "dispatch_state", method: "read_only" },
    execution: { type: "service", handlerId: "dispatch-store" },
    ai: { discoverable: false, callable: false, exposure: "none" },
    evidence: { produces: false },
    replacedBy: "dispatch.status.verify",
  },

  /* ---------------- Knowledge / memory (read) ---------------- */
  {
    id: "knowledge.search",
    version: 1,
    name: "Search operational knowledge",
    description:
      "Hybrid keyword + meaning search over the operator's resolutions, change records, runbooks and knowledge notes. Results are evidence with provenance, never verified answers.",
    domain: "knowledge",
    operation: "search",
    risk: "low",
    sideEffects: "none",
    lifecycle: "active",
    dataClass: "internal",
    inputSchema: { query: "string", accountNumber: "string|null", includeHistorical: "boolean|null" },
    outputSchema: { results: "array" },
    resourceScope: { entityTypes: ["knowledge_note", "resolution"], crossEntity: true, crossAccount: true },
    permissions: { required: ["portal.read"], minimumRole: "viewer" },
    prerequisites: [{ kind: "source_system_available", label: "Retrieval index reachable" }],
    ...read,
    verification: { required: false, authority: "knowledge_store", method: "read_only" },
    execution: { type: "copilot_tool", handlerId: "search_operational_knowledge" },
    ai: { discoverable: true, callable: true, exposure: "sanitized" },
    evidence: { produces: true, origin: "retrieved", confidence: "unknown" },
  },
  {
    id: "resolution.search",
    version: 1,
    name: "Search verified resolutions",
    description: "Find prior operator-confirmed resolutions relevant to the current work.",
    domain: "memory",
    operation: "search",
    risk: "low",
    sideEffects: "none",
    lifecycle: "active",
    dataClass: "internal",
    inputSchema: { query: "string", accountNumber: "string|null" },
    outputSchema: { results: "array" },
    resourceScope: { entityTypes: ["resolution"], crossEntity: true, crossAccount: true },
    permissions: { required: ["portal.read"], minimumRole: "viewer" },
    prerequisites: [{ kind: "source_system_available", label: "Retrieval index reachable" }],
    ...read,
    verification: { required: false, authority: "knowledge_store", method: "read_only" },
    execution: { type: "copilot_tool", handlerId: "search_operational_knowledge" },
    ai: { discoverable: true, callable: true, exposure: "sanitized" },
    evidence: { produces: true, origin: "retrieved", confidence: "probable" },
    dependsOn: ["knowledge.search"],
  },
  {
    id: "night_plan.read",
    version: 1,
    name: "Read night plan",
    description: "The current shift Night Plan items with priority and status.",
    domain: "night_plan",
    operation: "read",
    risk: "low",
    sideEffects: "none",
    lifecycle: "active",
    dataClass: "internal",
    inputSchema: {},
    outputSchema: { items: "array" },
    resourceScope: { entityTypes: ["shift"] },
    permissions: { required: ["portal.read"], minimumRole: "viewer" },
    prerequisites: [{ kind: "authenticated_operator", label: "Signed-in operator" }],
    ...read,
    verification: { required: false, authority: "database", method: "read_only" },
    execution: { type: "copilot_tool", handlerId: "get_night_plan" },
    ai: { discoverable: true, callable: true, exposure: "sanitized" },
    evidence: { produces: true, origin: "retrieved", confidence: "probable" },
  },
  {
    id: "work.time.read",
    version: 1,
    name: "Read logged work time",
    description: "Logged work-timer sessions within a recent window.",
    domain: "reporting",
    operation: "read",
    risk: "low",
    sideEffects: "none",
    lifecycle: "active",
    dataClass: "internal",
    inputSchema: { sinceHours: "number|null" },
    outputSchema: { entries: "array" },
    resourceScope: { entityTypes: ["work_record"], crossEntity: true },
    permissions: { required: ["portal.read"], minimumRole: "viewer" },
    prerequisites: [{ kind: "authenticated_operator", label: "Signed-in operator" }],
    ...read,
    verification: { required: false, authority: "database", method: "read_only" },
    execution: { type: "copilot_tool", handlerId: "get_work_time" },
    ai: { discoverable: true, callable: true, exposure: "sanitized" },
    evidence: { produces: true, origin: "retrieved", confidence: "probable" },
  },

  /* ---------------- Governed writes (Safe Action bound) ---------------- */
  ...safeActionCapabilities(),

  /* ---------------- Manual (human) capabilities ---------------- */
  {
    id: "manual.customer_confirmation",
    version: 1,
    name: "Customer confirmation (manual)",
    description:
      "The operator confirms with the customer that the expected behaviour was observed. A human step — never executable by the portal.",
    domain: "system",
    operation: "execute",
    risk: "medium",
    sideEffects: "external",
    lifecycle: "active",
    dataClass: "sensitive",
    inputSchema: { observed: "string" },
    outputSchema: { confirmed: "boolean" },
    resourceScope: { entityTypes: ["account", "ticket"], requiresActiveEntity: true },
    permissions: { required: ["portal.read"], minimumRole: "viewer" },
    prerequisites: [{ kind: "authenticated_operator", label: "Signed-in operator" }],
    confirmation: { mode: "explicit", prompt: "Record what the customer confirmed." },
    verification: {
      required: true,
      authority: "operator_observation",
      method: "operator_attestation",
      predicate: "customer.confirmed",
    },
    execution: { type: "manual", handlerId: "operator-attestation" },
    ai: { discoverable: true, callable: false, requiresProposal: false, exposure: "local_only" },
    idempotency: { supported: false },
    evidence: { produces: true, origin: "operator_confirmed", confidence: "verified" },
  },
];

/** Safe Actions keep their executor; the registry only describes them. */
function safeActionCapabilities(): CapabilityDefinition[] {
  const base = (
    id: string,
    name: string,
    description: string,
    domain: CapabilityDefinition["domain"],
    operation: CapabilityDefinition["operation"],
    actionType: ActionType,
    opts: {
      risk?: CapabilityDefinition["risk"];
      permission: CapabilityDefinition["permissions"]["required"][number];
      entityTypes: CapabilityDefinition["resourceScope"]["entityTypes"];
      verification: CapabilityDefinition["verification"];
      inputSchema: Record<string, string>;
      prerequisites?: CapabilityDefinition["prerequisites"];
      sideEffects?: CapabilityDefinition["sideEffects"];
    },
  ): CapabilityDefinition => ({
    id,
    version: 1,
    name,
    description,
    domain,
    operation,
    risk: opts.risk ?? "medium",
    sideEffects: opts.sideEffects ?? "persistent",
    lifecycle: "active",
    dataClass: "internal",
    inputSchema: opts.inputSchema,
    outputSchema: { actionId: "string", status: "string" },
    resourceScope: { entityTypes: opts.entityTypes, crossAccount: false },
    permissions: { required: [opts.permission], minimumRole: "programmer" },
    prerequisites: opts.prerequisites ?? [
      { kind: "authenticated_operator", label: "Signed-in operator" },
    ],
    confirmation: {
      mode: (opts.risk ?? "medium") === "high" ? "explicit_high_risk" : "explicit",
      prompt: `Apply “${name}”?`,
    },
    verification: opts.verification,
    execution: { type: "safe_action", handlerId: actionType, actionType },
    ai: { discoverable: true, callable: false, requiresProposal: true, exposure: "sanitized" },
    idempotency: { supported: true, fingerprintStrategy: "safe_action_idempotency_key" },
    evidence: { produces: true, origin: "observed", confidence: "verified" },
  });

  return [
    base(
      "night_plan.item.create",
      "Create night plan item",
      "Add an item to tonight's plan.",
      "night_plan",
      "create",
      "add_night_plan_item",
      {
        permission: "night_plan.write",
        entityTypes: ["shift"],
        inputSchema: { task: "string", notes: "string?", priority: "string?" },
        verification: {
          required: true,
          authority: "database",
          method: "reread_night_plan_contains_item",
          predicate: "night_plan.item.exists",
        },
      },
    ),
    base(
      "night_plan.item.complete",
      "Complete night plan item",
      "Mark an existing night plan item complete.",
      "night_plan",
      "update",
      "complete_night_plan_item",
      {
        permission: "night_plan.write",
        entityTypes: ["shift"],
        inputSchema: { task: "string" },
        verification: {
          required: true,
          authority: "database",
          method: "reread_night_plan_item_status",
          predicate: "night_plan.item.status",
        },
      },
    ),
    base(
      "freshdesk.ticket.classify",
      "Set ticket classification",
      "Set the issue classification on a tracked ticket.",
      "freshdesk",
      "update",
      "set_ticket_classification",
      {
        permission: "ticket.write",
        entityTypes: ["ticket"],
        inputSchema: { ticketNumber: "string", classification: "string" },
        verification: {
          required: true,
          authority: "database",
          method: "reread_ticket_classification",
          predicate: "ticket.classification",
        },
      },
    ),
    base(
      "work.timer.start",
      "Start work timer",
      "Start the work timer against a tracked ticket.",
      "additional_work",
      "execute",
      "start_timer",
      {
        risk: "low",
        permission: "timer.write",
        entityTypes: ["ticket", "work_record"],
        sideEffects: "local",
        inputSchema: { ticketNumber: "string" },
        verification: {
          required: true,
          authority: "database",
          method: "reread_active_timer",
          predicate: "timer.running",
        },
      },
    ),
    base(
      "work.completed_entry.create",
      "Create completed work entry",
      "Create one completed work entry in the operator's own work history.",
      "additional_work",
      "create",
      "create_completed_work_entry",
      {
        risk: "low",
        permission: "portal.read",
        entityTypes: ["additional_work"],
        inputSchema: { title: "string", accountNumber: "string?", summary: "string?" },
        verification: {
          required: true,
          authority: "database",
          method: "reread_completed_entry_exists",
          predicate: "additional_work.completed",
        },
      },
    ),
    base(
      "knowledge.note.create",
      "Create knowledge vault note",
      "Create one note in the operator's own knowledge vault.",
      "knowledge",
      "create",
      "create_knowledge_vault_note",
      {
        risk: "low",
        permission: "knowledge.write",
        entityTypes: ["knowledge_note"],
        inputSchema: { title: "string", contentHtml: "string?" },
        verification: {
          required: true,
          authority: "knowledge_store",
          method: "reread_note_exists",
          predicate: "knowledge_note.exists",
        },
      },
    ),
    base(
      "shift.summary_draft.create",
      "Generate shift summary draft",
      "Save one shift summary draft locally for operator review.",
      "reporting",
      "create",
      "create_shift_summary_draft",
      {
        risk: "low",
        permission: "portal.read",
        entityTypes: ["shift"],
        sideEffects: "local",
        inputSchema: { shiftKey: "string", title: "string", body: "string" },
        verification: {
          required: true,
          authority: "database",
          method: "reread_shift_summary_draft",
          predicate: "shift_summary_draft.exists",
        },
      },
    ),
    base(
      "script.fix_finding.record",
      "Record script fix finding",
      "Record one script fix finding against an account, locally.",
      "system",
      "create",
      "record_script_fix_finding",
      {
        risk: "low",
        permission: "portal.read",
        entityTypes: ["system"],
        sideEffects: "local",
        inputSchema: { accountNumber: "string", summary: "string", detail: "string?", ticketNumber: "string?" },
        verification: {
          required: true,
          authority: "database",
          method: "reread_script_fix_finding",
          predicate: "script_fix_finding.exists",
        },
      },
    ),
    base(
      "knowledge.draft.create",
      "Create knowledge draft",
      "Create a draft knowledge note from a promotion packet for operator review.",
      "knowledge",
      "create",
      "create_knowledge_draft",
      {
        permission: "knowledge.write",
        entityTypes: ["knowledge_note"],
        inputSchema: { title: "string", contentHtml: "string", packetId: "string?" },
        verification: {
          required: true,
          authority: "knowledge_store",
          method: "reread_note_exists",
          predicate: "knowledge_note.exists",
        },
      },
    ),
    base(
      "knowledge.note.update",
      "Update knowledge note",
      "Update an existing knowledge note.",
      "knowledge",
      "update",
      "update_knowledge_note",
      {
        permission: "knowledge.write",
        entityTypes: ["knowledge_note"],
        inputSchema: { noteId: "string", contentHtml: "string" },
        verification: {
          required: true,
          authority: "knowledge_store",
          method: "reread_note_content_hash",
          predicate: "knowledge_note.updated_at",
        },
      },
    ),
    base(
      "knowledge.supersede",
      "Supersede knowledge",
      "Mark existing knowledge as superseded by a newer record.",
      "knowledge",
      "update",
      "supersede_knowledge",
      {
        risk: "high",
        permission: "knowledge.write",
        entityTypes: ["knowledge_note", "resolution"],
        inputSchema: { targetId: "string", replacementId: "string" },
        verification: {
          required: true,
          authority: "knowledge_store",
          method: "reread_supersession_link",
          predicate: "knowledge.superseded_by",
        },
      },
    ),
    base(
      "resolution.create",
      "Create resolution memory",
      "Record a new operator-confirmed resolution.",
      "memory",
      "create",
      "create_resolution",
      {
        permission: "memory.write",
        entityTypes: ["resolution"],
        inputSchema: { problem: "string", resolution: "string", accountNumber: "string" },
        verification: {
          required: true,
          authority: "database",
          method: "reread_resolution_exists",
          predicate: "resolution.exists",
        },
      },
    ),
    base(
      "resolution.reinforce",
      "Reinforce resolution",
      "Reinforce an existing resolution with a new confirming occurrence.",
      "memory",
      "update",
      "reinforce_resolution",
      {
        permission: "memory.write",
        entityTypes: ["resolution"],
        inputSchema: { resolutionId: "string" },
        verification: {
          required: true,
          authority: "database",
          method: "reread_resolution_confidence",
          predicate: "resolution.confidence",
        },
      },
    ),
    base(
      "memory.candidate.dismiss",
      "Dismiss memory candidate",
      "Dismiss a curator candidate from review.",
      "memory",
      "update",
      "dismiss_candidate",
      {
        risk: "low",
        permission: "memory.write",
        entityTypes: ["system"],
        sideEffects: "local",
        inputSchema: { candidateId: "string" },
        verification: {
          required: true,
          authority: "database",
          method: "reread_candidate_status",
          predicate: "curator.candidate.status",
        },
      },
    ),
    base(
      "memory.candidate.archive",
      "Archive memory candidate",
      "Archive a curator candidate.",
      "memory",
      "update",
      "archive_candidate",
      {
        risk: "low",
        permission: "memory.write",
        entityTypes: ["system"],
        sideEffects: "local",
        inputSchema: { candidateId: "string" },
        verification: {
          required: true,
          authority: "database",
          method: "reread_candidate_status",
          predicate: "curator.candidate.status",
        },
      },
    ),
  ];
}

/* ------------------------------------------------------------------ */
/* Validation                                                          */
/* ------------------------------------------------------------------ */

export interface RegistryProblem {
  capabilityId: string;
  code:
    | "DUPLICATE_ID"
    | "INVALID_VERSION"
    | "MISSING_SCHEMA"
    | "WRITE_WITHOUT_VERIFICATION"
    | "WRITE_WITHOUT_CONFIRMATION"
    | "INVALID_SCOPE"
    | "DEPENDENCY_MISSING"
    | "DEPENDENCY_CYCLE"
    | "INVALID_OPERATOR_VERIFICATION"
    | "DEPRECATED_WITHOUT_REPLACEMENT";
  message: string;
}

/**
 * Structural rules every capability must satisfy. Violations are programmer
 * errors: the registry refuses to serve an invalid definition.
 */
export function validateDefinitions(defs: CapabilityDefinition[]): RegistryProblem[] {
  const problems: RegistryProblem[] = [];
  const seen = new Set<string>();
  const ids = new Set(defs.map((d) => d.id));

  for (const d of defs) {
    if (seen.has(d.id)) {
      problems.push({ capabilityId: d.id, code: "DUPLICATE_ID", message: "Capability id declared twice." });
    }
    seen.add(d.id);

    if (!Number.isInteger(d.version) || d.version < 1) {
      problems.push({ capabilityId: d.id, code: "INVALID_VERSION", message: "Version must be a positive integer." });
    }
    if (!d.inputSchema || !d.outputSchema) {
      problems.push({ capabilityId: d.id, code: "MISSING_SCHEMA", message: "Input and output schemas are required." });
    }
    if (!d.resourceScope?.entityTypes?.length) {
      problems.push({ capabilityId: d.id, code: "INVALID_SCOPE", message: "At least one entity type is required." });
    }

    const mutating = isMutatingOperation(d.operation);
    if (mutating && !d.verification.required) {
      problems.push({
        capabilityId: d.id,
        code: "WRITE_WITHOUT_VERIFICATION",
        message: "A writable/operational capability must define required verification.",
      });
    }
    if (mutating && (d.confirmation.mode === "none" || d.confirmation.mode === "prepare_only")) {
      problems.push({
        capabilityId: d.id,
        code: "WRITE_WITHOUT_CONFIRMATION",
        message: "A writable/operational capability must require explicit confirmation.",
      });
    }
    // Machine truth beats convenience: only genuinely human-observed outcomes
    // may be closed by operator attestation.
    if (
      d.verification.required &&
      d.verification.authority === "operator_observation" &&
      d.execution.type !== "manual"
    ) {
      problems.push({
        capabilityId: d.id,
        code: "INVALID_OPERATOR_VERIFICATION",
        message: "Operator attestation may only verify manual/human-observed capabilities.",
      });
    }
    if (d.lifecycle === "deprecated" && !d.replacedBy) {
      problems.push({
        capabilityId: d.id,
        code: "DEPRECATED_WITHOUT_REPLACEMENT",
        message: "A deprecated capability should point at its replacement.",
      });
    }
    for (const dep of d.dependsOn ?? []) {
      if (!ids.has(dep)) {
        problems.push({ capabilityId: d.id, code: "DEPENDENCY_MISSING", message: `Unknown dependency ${dep}.` });
      }
    }
  }

  for (const cycle of findCycles(defs)) {
    problems.push({
      capabilityId: cycle[0] ?? "unknown",
      code: "DEPENDENCY_CYCLE",
      message: `Dependency cycle: ${cycle.join(" -> ")}.`,
    });
  }

  return problems;
}

function findCycles(defs: CapabilityDefinition[]): string[][] {
  const byId = new Map(defs.map((d) => [d.id, d]));
  const state = new Map<string, "visiting" | "done">();
  const cycles: string[][] = [];

  const walk = (id: string, path: string[]) => {
    const s = state.get(id);
    if (s === "done") return;
    if (s === "visiting") {
      cycles.push([...path.slice(path.indexOf(id)), id]);
      return;
    }
    state.set(id, "visiting");
    for (const dep of byId.get(id)?.dependsOn ?? []) walk(dep, [...path, id]);
    state.set(id, "done");
  };

  for (const d of defs) walk(d.id, []);
  return cycles;
}

/* ------------------------------------------------------------------ */
/* Access                                                              */
/* ------------------------------------------------------------------ */

const PROBLEMS = validateDefinitions(DEFINITIONS);
const VALID = new Set(
  DEFINITIONS.filter((d) => !PROBLEMS.some((p) => p.capabilityId === d.id)).map((d) => d.id),
);
const BY_ID = new Map(DEFINITIONS.filter((d) => VALID.has(d.id)).map((d) => [d.id, d]));

export function registryProblems(): RegistryProblem[] {
  return PROBLEMS;
}

export function allCapabilities(): CapabilityDefinition[] {
  return [...BY_ID.values()];
}

export function getCapability(id: string): CapabilityDefinition | undefined {
  return BY_ID.get(id);
}

/** Only capabilities that may be offered for NEW use. */
export function discoverableCapabilities(): CapabilityDefinition[] {
  return allCapabilities().filter(
    (d) => d.lifecycle === "active" || d.lifecycle === "experimental",
  );
}

/** Safe Action type -> capability. Every governed write has a descriptor. */
export function capabilityForActionType(type: ActionType): CapabilityDefinition | undefined {
  return allCapabilities().find((d) => d.execution.actionType === type);
}

/** Copilot tool name -> capability (migration adapter, §26). */
export function capabilityForToolName(tool: string): CapabilityDefinition | undefined {
  return allCapabilities().find(
    (d) => d.execution.type === "copilot_tool" && d.execution.handlerId === tool,
  );
}

export { capabilityRef };
