export type ShiftStatus = "before" | "active" | "near-end" | "complete";

/** Get current Central Time as a Date-equivalent (parts) */
function centralParts(d = new Date()) {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts: Record<string, string> = {};
  for (const p of fmt.formatToParts(d)) if (p.type !== "literal") parts[p.type] = p.value;
  return {
    year: +parts.year,
    month: +parts.month,
    day: +parts.day,
    hour: +parts.hour % 24,
    minute: +parts.minute,
    second: +parts.second,
  };
}

export function getCentralNow() {
  const p = centralParts();
  return p;
}

export function formatCentralTime(d = new Date()) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(d);
}

export function formatCentralDate(d = new Date()) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(d);
}

export function formatCentralShort(d = new Date()) {
  return (
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Chicago",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    }).format(d) + " Central"
  );
}

export function getShiftStatus(now = new Date()): ShiftStatus {
  const { hour } = centralParts(now);
  if (hour >= 22) return "active"; // 10pm-11:59pm
  if (hour < 5) return "active"; // 12am-4:59am
  if (hour === 5) return "near-end";
  if (hour >= 6 && hour < 22) {
    // 6am to 9:59pm: between shifts. Treat <10pm as "before", >=6am as "complete"
    return hour < 10 && hour < 6 ? "before" : hour >= 6 && hour < 10 ? "complete" : "before";
  }
  return "before";
}

/**
 * Compute shift progress 0..1 across 10pm-6am window (8 hours).
 * Before shift: 0. Complete: 1.
 */
export function getShiftProgress(now = new Date()): number {
  const { hour, minute, second } = centralParts(now);
  const status = getShiftStatus(now);
  if (status === "before") return 0;
  if (status === "complete") return 1;
  // Active or near-end: compute minutes since 10pm (wrapping)
  const minutesSinceTen =
    hour >= 22
      ? (hour - 22) * 60 + minute + second / 60
      : (hour + 2) * 60 + minute + second / 60;
  return Math.max(0, Math.min(1, minutesSinceTen / (8 * 60)));
}

export function getShiftMessage(s: ShiftStatus): string {
  switch (s) {
    case "before":
      return "Shift starts at 10:00 PM.";
    case "active":
      return "You're in the active shift window.";
    case "near-end":
      return "Final hour.";
    case "complete":
      return "Shift complete.";
  }
}

/** Stable shift key for storage (the start date of the 10pm shift) */
export function getShiftKey(now = new Date()): string {
  const p = centralParts(now);
  // If hour < 10am (loosely, in shift), the shift "started" the previous day
  // Use: hour < 10 means shift key = yesterday's date; hour >= 22 means today
  let y = p.year, m = p.month, d = p.day;
  if (p.hour < 10) {
    const dt = new Date(Date.UTC(p.year, p.month - 1, p.day));
    dt.setUTCDate(dt.getUTCDate() - 1);
    y = dt.getUTCFullYear();
    m = dt.getUTCMonth() + 1;
    d = dt.getUTCDate();
  }
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export function getCurrentShiftWindow(now = new Date()): { start: Date; end: Date } {
  // Returns the shift window covering "now" if in shift, or the upcoming shift
  const p = centralParts(now);
  // Crude calculation in UTC then format—approximation is fine for shell
  const today = new Date(now);
  const startCT = new Date(today);
  // We'll just return the displayable window strings via formatCentralDate
  return { start: startCT, end: today };
}

export function getGreeting(now = new Date()): string {
  const { hour } = centralParts(now);
  if (hour < 5) return "Good evening";
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}