/**
 * BlueVerse visual style helpers — safe alpha mixing for any CSS color,
 * including var(--*) references that string-replace hacks would break.
 */

export function alphaMix(color: string, amount = 30) {
  return `color-mix(in oklab, ${color} ${amount}%, transparent)`;
}

export function glowMix(color: string, amount = 45) {
  return `color-mix(in oklab, ${color} ${amount}%, transparent)`;
}

export const moduleAccents = {
  freshdesk: {
    label: "Freshdesk",
    color: "var(--cyan-glow)",
    rail: "linear-gradient(180deg, var(--cyan-glow), var(--electric))",
  },
  intelligence: {
    label: "Intel",
    color: "var(--violet-glow)",
    rail: "linear-gradient(180deg, var(--violet-glow), var(--cyan-glow))",
  },
  dispatch: {
    label: "Dispatch",
    color: "var(--violet-glow)",
    rail: "linear-gradient(180deg, var(--violet-glow), var(--electric))",
  },
  additional: {
    label: "Additional Work",
    color: "var(--gold-glow)",
    rail: "linear-gradient(180deg, var(--gold-glow), var(--cyan-glow))",
  },
  accounts: {
    label: "Accounts",
    color: "var(--electric)",
    rail: "linear-gradient(180deg, var(--electric), var(--cyan-glow))",
  },
  completed: {
    label: "Completed",
    color: "var(--green-glow)",
    rail: "linear-gradient(180deg, var(--green-glow), var(--cyan-glow))",
  },
  reports: {
    label: "Reports",
    color: "oklch(0.95 0.05 230)",
    rail: "linear-gradient(180deg, oklch(0.95 0.05 230), var(--cyan-glow))",
  },
  alert: {
    label: "Alert",
    color: "var(--gold-glow)",
    rail: "linear-gradient(180deg, var(--gold-glow), oklch(0.66 0.24 22))",
  },
} as const;
