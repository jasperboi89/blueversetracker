import type { PortalContextEnvelope } from "@/lib/core/portal-context";

/**
 * Deterministic contextual Copilot suggestions (Phase 10 §12).
 *
 * A static capability map per workspace — deciding button labels never costs
 * a model call.
 */

export interface ContextSuggestion {
  label: string;
  prompt: string;
}

const BY_AREA: Record<string, ContextSuggestion[]> = {
  freshdesk_work: [
    { label: "Summarize issue", prompt: "Summarize the issue on the ticket I'm working." },
    { label: "What should I check next?", prompt: "What should I check next on this ticket?" },
    { label: "What remains unverified?", prompt: "Show what remains unverified on this ticket." },
    { label: "Compare with previous resolution", prompt: "Compare this ticket with the previous resolution that looks relevant." },
    { label: "Similar prior work", prompt: "Find similar prior work for this ticket." },
    { label: "Account instructions", prompt: "Find account instructions relevant to this ticket." },
    { label: "What next?", prompt: "What should I check next on this ticket?" },
    { label: "Draft work note", prompt: "Draft a work note for what has been done on this ticket so far." },
    { label: "Resolution memory", prompt: "Search Resolution Memory for this problem." },
  ],
  accounts: [
    { label: "Recent activity", prompt: "Summarize recent activity for this account." },
    { label: "Recurring issues", prompt: "Show recurring issues for this account." },
    { label: "Verified fixes", prompt: "Show verified fixes for this account." },
    { label: "Recent changes", prompt: "Show recent change records for this account." },
    { label: "Account risks", prompt: "Explain the operational risks on this account." },
  ],
  contact_dispatch: [
    { label: "What remains to verify?", prompt: "What remains to verify in this dispatch session?" },
    { label: "Show prior failures", prompt: "Show prior dispatch failures for this account." },
    { label: "Explain current test state", prompt: "Explain the current test state of this dispatch session." },
    { label: "Related account history", prompt: "Check related account history for this dispatch session." },
    { label: "Prior dispatch issues", prompt: "Find prior dispatch issues for this account." },
    { label: "Testing state", prompt: "Summarize the testing state of this dispatch session." },
    { label: "What's left?", prompt: "What remains to verify in this dispatch session?" },
  ],
  knowledge_vault: [
    { label: "Check against recent work", prompt: "Check this procedure against recent work." },
    { label: "Show conflicting evidence", prompt: "Show conflicting evidence for the note I have open." },
    { label: "What needs review?", prompt: "What in this note needs review?" },
    { label: "Related notes", prompt: "Find notes related to the note I have open." },
    { label: "Related tickets", prompt: "Find tickets related to the note I have open." },
    { label: "Improve this guide", prompt: "Suggest improvements to the note I have open." },
    { label: "Turn into procedure", prompt: "Turn the note I have open into a step-by-step procedure." },
    { label: "Conflicting guidance", prompt: "Check for guidance that conflicts with the note I have open." },
  ],
  additional_work: [
    { label: "Remaining information", prompt: "What information is still missing on this work item?" },
    { label: "Recommended follow-up", prompt: "What follow-up should I record for this work item?" },
    { label: "Summarize work", prompt: "Summarize the additional work item I'm on." },
    { label: "Related documentation", prompt: "Find documentation related to this work item." },
    { label: "Prior fixes", prompt: "Find prior fixes related to this work item." },
    { label: "Draft completion notes", prompt: "Draft completion notes for this work item." },
  ],
  assigned_inbox: [
    { label: "What's overdue?", prompt: "What's overdue right now?" },
    { label: "Triage my inbox", prompt: "Help me triage what's assigned to me." },
  ],
  completed_work: [
    { label: "Summarize shift", prompt: "Summarize what I completed this shift." },
    { label: "Patterns", prompt: "Any patterns across what I completed recently?" },
  ],
  reports: [
    { label: "Programming email", prompt: "Summarize what belongs in tonight's programming status email." },
    { label: "Recurring issues", prompt: "Show recurring issues across accounts this week." },
  ],
};

const DEFAULTS: ContextSuggestion[] = [
  { label: "What's overdue?", prompt: "What's overdue right now?" },
  { label: "Shift so far", prompt: "Summarize my shift so far." },
  { label: "What next?", prompt: "What should I work next?" },
  { label: "Plan my top 3", prompt: "Add my top 3 to the night plan." },
];

/** Suggestions for the operator's current workspace, plus state-driven extras. */
export function suggestionsForContext(env: PortalContextEnvelope): ContextSuggestion[] {
  const base = BY_AREA[env.location.area] ?? DEFAULTS;
  const extra: ContextSuggestion[] = [];
  if (env.blockers.length > 0) {
    extra.push({ label: "Unblock me", prompt: "What can I do about my current blockers?" });
  }
  if (env.workState.unsavedChanges) {
    extra.push({ label: "Wrap up", prompt: "Help me wrap up what I'm editing before I move on." });
  }
  return [...base, ...extra].slice(0, 6);
}
