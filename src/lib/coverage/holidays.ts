/**
 * US holiday calendar used for answering-service coverage checks.
 * Dates are plain YYYY-MM-DD strings (no timezone math needed — coverage is
 * confirmed per calendar day, not per instant).
 */
export interface Holiday {
  /** YYYY-MM-DD */
  date: string;
  name: string;
  /** Holidays where offices are most likely to run reduced/on-call coverage. */
  major: boolean;
}

function iso(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** nth weekday (0=Sun) of a month; nth = -1 means last. */
function nthWeekday(year: number, month: number, weekday: number, nth: number): number {
  if (nth > 0) {
    const first = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
    const offset = (weekday - first + 7) % 7;
    return 1 + offset + (nth - 1) * 7;
  }
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const last = new Date(Date.UTC(year, month - 1, lastDay)).getUTCDay();
  return lastDay - ((last - weekday + 7) % 7);
}

export function holidaysForYear(year: number): Holiday[] {
  const thanksgiving = nthWeekday(year, 11, 4, 4);
  return [
    { date: iso(year, 1, 1), name: "New Year's Day", major: true },
    { date: iso(year, 1, nthWeekday(year, 1, 1, 3)), name: "MLK Jr. Day", major: false },
    { date: iso(year, 2, nthWeekday(year, 2, 1, 3)), name: "Presidents' Day", major: false },
    { date: iso(year, 5, nthWeekday(year, 5, 1, -1)), name: "Memorial Day", major: true },
    { date: iso(year, 6, 19), name: "Juneteenth", major: false },
    { date: iso(year, 7, 4), name: "Independence Day", major: true },
    { date: iso(year, 9, nthWeekday(year, 9, 1, 1)), name: "Labor Day", major: true },
    { date: iso(year, 10, nthWeekday(year, 10, 1, 2)), name: "Columbus / Indigenous Peoples' Day", major: false },
    { date: iso(year, 11, 11), name: "Veterans Day", major: false },
    { date: iso(year, 11, thanksgiving), name: "Thanksgiving", major: true },
    { date: iso(year, 11, thanksgiving + 1), name: "Day after Thanksgiving", major: true },
    { date: iso(year, 12, 24), name: "Christmas Eve", major: true },
    { date: iso(year, 12, 25), name: "Christmas Day", major: true },
    { date: iso(year, 12, 31), name: "New Year's Eve", major: true },
  ];
}

export function todayIso(now = new Date()): string {
  // Central time is the operating timezone for the shift.
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Chicago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  return parts;
}

export function daysUntil(dateIso: string, now = new Date()): number {
  const a = Date.parse(`${todayIso(now)}T00:00:00Z`);
  const b = Date.parse(`${dateIso}T00:00:00Z`);
  return Math.round((b - a) / 86_400_000);
}

/** Holidays falling within the next `days` days (inclusive of today). */
export function upcomingHolidays(days = 45, now = new Date()): Holiday[] {
  const year = Number(todayIso(now).slice(0, 4));
  return [...holidaysForYear(year), ...holidaysForYear(year + 1)]
    .map((h) => ({ h, d: daysUntil(h.date, now) }))
    .filter(({ d }) => d >= 0 && d <= days)
    .sort((a, b) => a.d - b.d)
    .map(({ h }) => h);
}

export function formatHolidayDate(dateIso: string): string {
  const d = new Date(`${dateIso}T12:00:00Z`);
  return d.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}