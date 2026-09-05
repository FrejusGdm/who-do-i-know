/** Calendar dates are deliberately separate from timestamps and server timezone. */
export type CalendarInterval = { count: number; unit: "days" | "weeks" | "months" };

export function isCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  if (year < 1900 || year > 9999 || month < 1 || month > 12 || day < 1) return false;
  return day <= new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function dateParts(value: string) {
  if (!isCalendarDate(value)) throw new Error("Invalid calendar date");
  return value.split("-").map(Number);
}

function formatDate(year: number, month: number, day: number): string {
  const result = `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  if (!isCalendarDate(result)) throw new Error("Calendar date outside supported range");
  return result;
}

function validateInterval(interval: CalendarInterval) {
  if (!Number.isInteger(interval.count) || interval.count < 1 || interval.count > 120 ||
      !["days", "weeks", "months"].includes(interval.unit)) {
    throw new Error("Invalid calendar interval");
  }
}

export function addCalendarInterval(anchor: string, interval: CalendarInterval, occurrences = 1): string {
  validateInterval(interval);
  if (!Number.isInteger(occurrences) || occurrences < 0 || occurrences > 120000) {
    throw new Error("Invalid occurrence count");
  }
  const [year, month, day] = dateParts(anchor);
  const amount = interval.count * occurrences;
  if (interval.unit === "months") {
    const absoluteMonth = year * 12 + month - 1 + amount;
    const nextYear = Math.floor(absoluteMonth / 12);
    const nextMonth = absoluteMonth % 12 + 1;
    const lastDay = new Date(Date.UTC(nextYear, nextMonth, 0)).getUTCDate();
    return formatDate(nextYear, nextMonth, Math.min(day, lastDay));
  }
  const date = new Date(Date.UTC(year, month - 1, day + amount * (interval.unit === "weeks" ? 7 : 1)));
  return formatDate(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
}

/** Always calculate from the original anchor: Jan 31 → Feb 28 → Mar 31. */
export function nextOccurrenceAfter(anchor: string, interval: CalendarInterval, after: string): string {
  validateInterval(interval);
  const [year, month, day] = dateParts(anchor);
  const [afterYear, afterMonth, afterDay] = dateParts(after);
  if (anchor > after) return anchor;
  const elapsed = interval.unit === "months"
    ? (afterYear - year) * 12 + afterMonth - month
    : (Date.UTC(afterYear, afterMonth - 1, afterDay) - Date.UTC(year, month - 1, day)) / 86400000;
  const step = interval.count * (interval.unit === "weeks" ? 7 : 1);
  const occurrence = Math.max(0, Math.floor(elapsed / step));
  const candidate = addCalendarInterval(anchor, interval, occurrence);
  return candidate > after ? candidate : addCalendarInterval(anchor, interval, occurrence + 1);
}

export function todayInTimezone(timezone: string, now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(now);
  const part = (type: string) => parts.find((value) => value.type === type)!.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export function isTimezone(value: string): boolean {
  try { todayInTimezone(value); return true; } catch { return false; }
}

export function contactAdvancesPlan(lastContactOn: string | null, occurredOn: string | null, qualifies: boolean): boolean {
  return Boolean(qualifies && occurredOn && isCalendarDate(occurredOn) && (!lastContactOn || occurredOn > lastContactOn));
}

export function visibleCheckInDate(dueOn: string, snoozedUntil: string | null): string {
  return snoozedUntil && snoozedUntil > dueOn ? snoozedUntil : dueOn;
}
