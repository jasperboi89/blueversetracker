/** Shared, browser-safe constants for account change records. */

export const CHANGE_TYPES = [
  "on-call-schedule",
  "dispatch-logic",
  "script-prompt",
  "contact-info",
  "holiday-coverage",
  "other",
] as const;

export type ChangeType = (typeof CHANGE_TYPES)[number];

export const CHANGE_TYPE_LABELS: Record<ChangeType, string> = {
  "on-call-schedule": "On-call schedule",
  "dispatch-logic": "Dispatch logic",
  "script-prompt": "Script / prompt",
  "contact-info": "Contact info",
  "holiday-coverage": "Holiday coverage",
  other: "Other",
};

export const CHANGE_RISKS = ["low", "medium", "high"] as const;
export type ChangeRisk = (typeof CHANGE_RISKS)[number];

export const CHANGE_STATUSES = ["draft", "applied", "verified", "rolled-back"] as const;
export type ChangeStatus = (typeof CHANGE_STATUSES)[number];

export const CHANGE_STATUS_LABELS: Record<ChangeStatus, string> = {
  draft: "Draft",
  applied: "Applied",
  verified: "Verified live",
  "rolled-back": "Rolled back",
};

/** Pre-flight checks per change type — the things that get missed at 3am. */
export const CHECKLIST_PRESETS: Record<ChangeType, string[]> = {
  "on-call-schedule": [
    "Confirmed effective start and end dates with the requester",
    "Checked for overlap with an existing rotation entry",
    "Verified time zone and day boundary (midnight rollover)",
    "Confirmed the contact method for each person on call",
    "Test call routed to the correct on-call person",
  ],
  "dispatch-logic": [
    "Confirmed which contact receives which message type",
    "Checked escalation timers and fallback contact",
    "Verified delivery method (page / SMS / email) is live",
    "Ran a test dispatch end to end",
    "Confirmed no duplicate delivery to the same contact",
  ],
  "script-prompt": [
    "Wording approved by the requester",
    "Checked branching still reaches every downstream node",
    "Verified required fields are still required",
    "Ran the script through a test call",
    "Checked shared/common script sections were not affected",
  ],
  "contact-info": [
    "Confirmed spelling of the name and title",
    "Verified number/email format and that it is reachable",
    "Checked whether this contact is used in dispatch or on-call",
    "Removed or updated the old entry rather than leaving both",
  ],
  "holiday-coverage": [
    "Confirmed exact holiday dates and hours",
    "Set an expiry so coverage reverts afterwards",
    "Checked the account's normal hours are restored after the holiday",
    "Confirmed who handles emergencies during the holiday",
    "Test call verified the holiday greeting/routing",
  ],
  other: [
    "Requester and request confirmed in writing",
    "Change tested before leaving it live",
    "Rollback path written down",
  ],
};