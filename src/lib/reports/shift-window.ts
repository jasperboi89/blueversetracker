export interface ShiftWindow {
  start: Date;
  end: Date;
  label: string;     // "Jun 11 into Jun 12"
  timeLabel: string; // "10:00 PM – 6:00 AM Central"
  kind: "current" | "custom";
}

function centralYMD(d: Date): { y: number; m: number; d: number; hour: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "0";
  return {
    y: +get("year"),
    m: +get("month"),
    d: +get("day"),
    hour: +get("hour") % 24,
  };
}

function fmtDay(d: Date) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(d);
}

function fmtTime(d: Date) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(d);
}

function asCentralDate(y: number, m: number, d: number, hh: number, mm = 0): Date {
  // Build a UTC-anchored estimate, then adjust by the Central offset.
  // America/Chicago is UTC-5 (CDT) or UTC-6 (CST). We compute the actual offset.
  const guess = new Date(Date.UTC(y, m - 1, d, hh, mm, 0));
  const parts = centralYMD(guess);
  // Adjust based on observed hour in Central.
  const diff = (hh - parts.hour + 24) % 24;
  return new Date(guess.getTime() + diff * 60 * 60 * 1000);
}

/**
 * Returns the canonical shift window covering `now` per the spec rules:
 * - between 10pm-11:59pm → tonight 10pm → tomorrow 6am
 * - between 12am-5:59am → yesterday 10pm → today 6am
 * - outside (6am-9:59pm) → still computes "upcoming/last" shift = tonight 10pm → tomorrow 6am
 */
export function currentShiftWindow(now = new Date()): ShiftWindow {
  const c = centralYMD(now);
  let startY = c.y, startM = c.m, startD = c.d;
  if (c.hour < 6) {
    // shift started yesterday Central
    const y = new Date(Date.UTC(c.y, c.m - 1, c.d));
    y.setUTCDate(y.getUTCDate() - 1);
    startY = y.getUTCFullYear();
    startM = y.getUTCMonth() + 1;
    startD = y.getUTCDate();
  }
  const start = asCentralDate(startY, startM, startD, 22, 0);
  const end = new Date(start.getTime() + 8 * 60 * 60 * 1000);
  return {
    start,
    end,
    kind: "current",
    label: `${fmtDay(start)} into ${fmtDay(end)}`,
    timeLabel: `${fmtTime(start)} – ${fmtTime(end)} Central`,
  };
}

export function windowFromRange(startISO: string, endISO: string): ShiftWindow {
  const start = new Date(startISO);
  const end = new Date(endISO);
  return {
    start,
    end,
    kind: "custom",
    label: `${fmtDay(start)} into ${fmtDay(end)}`,
    timeLabel: `${fmtTime(start)} – ${fmtTime(end)} Central`,
  };
}

export function isInWindow(ts: number | undefined, w: ShiftWindow): boolean {
  if (!ts) return false;
  return ts >= w.start.getTime() && ts <= w.end.getTime();
}

export function isInWindowEither(updatedAt: number | undefined, completedAt: number | undefined, w: ShiftWindow): boolean {
  return isInWindow(updatedAt, w) || isInWindow(completedAt, w);
}

export function formatWindow(w: ShiftWindow): string {
  return `Shift: ${w.label}\nWindow: ${w.timeLabel}`;
}

export function shiftLabelFromKey(shiftKey: string): string {
  // shiftKey = YYYY-MM-DD (start of the 10pm shift)
  const [y, m, d] = shiftKey.split("-").map((x) => +x);
  if (!y || !m || !d) return shiftKey;
  const start = new Date(Date.UTC(y, m - 1, d));
  const end = new Date(Date.UTC(y, m - 1, d + 1));
  const fmt = (dt: Date) =>
    new Intl.DateTimeFormat("en-US", {
      timeZone: "UTC",
      month: "short",
      day: "numeric",
    }).format(dt);
  return `${fmt(start)} into ${fmt(end)}`;
}