import { ticketsStore, type Ticket } from "../tickets-store";
import { dispatchStore } from "../dispatch-store";
import { additionalWorkStore } from "../additional-work-store";

const FLAG = "aih:reports-seed:v1";

function defaultDetails(over: Partial<Ticket["details"]> = {}): Ticket["details"] {
  return {
    subject: "",
    region: "Central",
    company: "",
    topic: "Account Settings",
    type: "Service Request",
    priority: "Medium",
    group: "Night Operations",
    agent: "L. Park",
    freshdeskUrl: "https://example.freshdesk.com/a/tickets/0",
    ...over,
  };
}

function mkTicket(over: Partial<Ticket>): Ticket {
  const now = Date.now();
  return {
    id: over.id ?? `t-seed-${Math.random().toString(36).slice(2, 7)}`,
    number: "",
    accountNumber: "",
    accountName: "",
    status: "completed",
    updatedAt: now,
    details: defaultDetails(),
    freshdeskNotes: [],
    hubHistory: [],
    freshdeskAttachments: [],
    hubSnips: [],
    ...over,
  };
}

export function runReportsSeed() {
  if (typeof window === "undefined") return;
  if (localStorage.getItem(FLAG)) return;

  const day = 24 * 60 * 60 * 1000;
  const now = Date.now();

  // ----- Freshdesk completed history (covers all classifications + recurring) -----
  const extras: Ticket[] = [
    mkTicket({
      id: "t-seed-completed-script-1",
      number: "30150",
      accountNumber: "6610",
      accountName: "Lakeside Cardiology",
      status: "completed",
      issueClassification: "Scripting Issue",
      updatedAt: now - 3 * day,
      completedAt: now - 3 * day,
      details: defaultDetails({ subject: "After-hours routing fix", company: "Lakeside Cardiology" }),
    }),
    mkTicket({
      id: "t-seed-completed-script-2",
      number: "30120",
      accountNumber: "6610",
      accountName: "Lakeside Cardiology",
      status: "completed",
      issueClassification: "Scripting Issue",
      updatedAt: now - 12 * day,
      completedAt: now - 12 * day,
      details: defaultDetails({ subject: "Greeting branch correction", company: "Lakeside Cardiology" }),
    }),
    mkTicket({
      id: "t-seed-completed-script-3",
      number: "30090",
      accountNumber: "6610",
      accountName: "Lakeside Cardiology",
      status: "completed",
      issueClassification: "Scripting Issue",
      updatedAt: now - 20 * day,
      completedAt: now - 20 * day,
      details: defaultDetails({ subject: "Overnight queue fix", company: "Lakeside Cardiology" }),
    }),
    mkTicket({
      id: "t-seed-completed-script-4",
      number: "30050",
      accountNumber: "6610",
      accountName: "Lakeside Cardiology",
      status: "completed",
      issueClassification: "Scripting Issue",
      updatedAt: now - 27 * day,
      completedAt: now - 27 * day,
      details: defaultDetails({ subject: "Holiday rotation fix", company: "Lakeside Cardiology" }),
    }),
    mkTicket({
      id: "t-seed-completed-change",
      number: "30188",
      accountNumber: "1042",
      accountName: "Riverbend Family Clinic",
      status: "completed",
      issueClassification: "Client Change",
      updatedAt: now - 1 * day,
      completedAt: now - 1 * day,
      details: defaultDetails({ subject: "Added Dr. Reyes to backup list", company: "Riverbend Family Clinic" }),
    }),
    mkTicket({
      id: "t-seed-completed-other",
      number: "30172",
      accountNumber: "4821",
      accountName: "Cedar Oaks Veterinary",
      status: "completed",
      issueClassification: "Other",
      updatedAt: now - 5 * day,
      completedAt: now - 5 * day,
      details: defaultDetails({ subject: "Account note cleanup", company: "Cedar Oaks Veterinary" }),
    }),
  ];
  ticketsStore._seedExtra(extras.map((t) => ({ ...t, isDemo: true })));

  // Seed work-session details for completed tickets so reports & email have real text
  extras.forEach((t) => {
    ticketsStore.updateSession(t.id, {
      issueText: t.details.subject,
      changesText: t.issueClassification === "Scripting Issue"
        ? "Adjusted overnight routing branch and verified live."
        : t.issueClassification === "Client Change"
          ? "Applied client-requested change to overnight contact list."
          : "Account cleanup performed.",
      resultStatus: "completed",
      resultNotes: "Verified in test call. No further action needed.",
    });
  });

  // ----- Dispatch sessions: add a completed one with summary versions for history -----
  const completedDispatch = {
    id: "ds-seed-history",
    accountNumber: "9001",
    accountName: "Harborlight Medical",
    ticketNumber: "30050",
    status: "ready" as const,
    statusReason: "",
    createdAt: now - 2 * day,
    updatedAt: now - 2 * day,
    completedAt: now - 2 * day,
    reasons: [],
    phone: { status: "passed" as const, failureReason: "", changesMade: "", retests: [], notes: "", snipIds: [], checks: {} },
    repeat: { status: "complete" as const, failureReason: "", changesMade: "", retests: [], notes: "", snipIds: [], checks: {} },
    saveSummary: { status: "passed" as const, failureReason: "", changesMade: "", retests: [], notes: "", snipIds: [], checks: {} },
    summaryNotes: "All sections passed cleanly. Ready for activation.",
    summaryVersions: [
      {
        id: "sv-seed-1",
        label: "Final Posted / Marked Used" as const,
        body: "All sections passed cleanly. Ready for activation.",
        createdAt: now - 2 * day,
        postedAt: now - 2 * day,
      },
    ],
    snips: [],
  };
  dispatchStore._seedExtra([{ ...(completedDispatch as any), isDemo: true }]);

  localStorage.setItem(FLAG, "1");
}