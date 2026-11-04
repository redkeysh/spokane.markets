/**
 * Admin date and time wording. Calendar dates are "YYYY-MM-DD" strings in
 * Pacific time; instants are Dates, read in America/Los_Angeles.
 */

export const ADMIN_TIME_ZONE = "America/Los_Angeles";

const pacificParts = new Intl.DateTimeFormat("en-CA", {
  timeZone: ADMIN_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

function partsOf(instant: Date) {
  const parts = pacificParts.formatToParts(instant);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? "00";
  return { date: `${get("year")}-${get("month")}-${get("day")}`, time: `${get("hour")}:${get("minute")}` };
}

/** The Pacific calendar date of an instant, "2026-11-07". */
export function pacificDate(instant: Date): string {
  return partsOf(instant).date;
}

/** The Pacific wall-clock time of an instant, "18:00". */
export function pacificTime(instant: Date): string {
  return partsOf(instant).time;
}

const HOUR_MS = 3_600_000;

/**
 * The instant a Pacific calendar date begins, also on the days the clocks
 * change (midnight is then 07:00 or 08:00 UTC, not the offset at noon).
 */
export function startOfPacificDay(isoDate: string): Date {
  const wanted = Date.parse(`${isoDate}T00:00:00.000Z`);
  const guess = wanted + 8 * HOUR_MS;
  const parts = partsOf(new Date(guess));
  const seen = Date.parse(`${parts.date}T${parts.time}:00.000Z`);
  return new Date(guess - (seen - wanted));
}

/** Noon UTC on a calendar date: the same date in every time zone used here. */
function noonUtc(isoDate: string): Date {
  return new Date(`${isoDate}T12:00:00.000Z`);
}

export function addDays(isoDate: string, days: number): string {
  const d = noonUtc(isoDate);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Whole days from `a` to `b` (negative when `b` is earlier). */
export function daysBetween(a: string, b: string): number {
  return Math.round((noonUtc(b).getTime() - noonUtc(a).getTime()) / 86_400_000);
}

/** 0 = Monday through 6 = Sunday. */
export function weekdayIndex(isoDate: string): number {
  return (noonUtc(isoDate).getUTCDay() + 6) % 7;
}

/** The Saturday of the Monday-to-Sunday week that holds the date. */
export function saturdayOf(isoDate: string): string {
  return addDays(isoDate, 5 - weekdayIndex(isoDate));
}

/** A calendar date stored in a @db.Date column, as "YYYY-MM-DD". */
export function dateColumnToIso(value: Date): string {
  return value.toISOString().slice(0, 10);
}

const weekdayFormat = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", weekday: "short" });
const monthDayFormat = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "short", day: "numeric" });
const monthDayYearFormat = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "short", day: "numeric", year: "numeric" });
const monthFormat = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "short" });
const longDayFormat = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", weekday: "long", month: "long", day: "numeric" });

function sameYear(isoDate: string, now: Date) {
  return isoDate.slice(0, 4) === pacificDate(now).slice(0, 4);
}

/** "Sat Nov 7", or "Sat Jan 9, 2027" outside the current Pacific year. */
export function formatDay(isoDate: string, now: Date = new Date()): string {
  return `${formatWeekday(isoDate)} ${formatMonthDay(isoDate, now)}`;
}

/** "Sat" */
export function formatWeekday(isoDate: string): string {
  return weekdayFormat.format(noonUtc(isoDate));
}

/** "Nov 7", or "Jan 9, 2027" outside the current Pacific year. */
export function formatMonthDay(isoDate: string, now: Date = new Date()): string {
  return (sameYear(isoDate, now) ? monthDayFormat : monthDayYearFormat).format(noonUtc(isoDate));
}

/** "Nov 3, 2026", always with the year. */
export function formatFullDate(isoDate: string): string {
  return monthDayYearFormat.format(noonUtc(isoDate));
}

/** "Nov 7" without a year, for rail columns. */
export function formatShortDate(isoDate: string): string {
  return monthDayFormat.format(noonUtc(isoDate));
}

/** "Jan", the short month name of a date. */
export function formatMonth(isoDate: string): string {
  return monthFormat.format(noonUtc(isoDate));
}

/** "Tuesday, November 3" */
export function formatLongDay(isoDate: string): string {
  return longDayFormat.format(noonUtc(isoDate));
}

/** "Fri Nov 6 to Sun Nov 8"; one day reads as formatDay. */
export function formatDayRange(startIso: string, endIso: string, now: Date = new Date()): string {
  if (startIso === endIso) return formatDay(startIso, now);
  return `${formatDay(startIso, now)} to ${formatDay(endIso, now)}`;
}

/** The Friday to Sunday around a Saturday: "Nov 6 to 8", "Oct 30 to Nov 1", "Dec 31, 2027 to Jan 2, 2028". */
export function formatWeekendSpan(saturday: string, now: Date = new Date()): string {
  const friday = addDays(saturday, -1);
  const sunday = addDays(saturday, 1);
  if (friday.slice(0, 4) !== sunday.slice(0, 4)) {
    return `${monthDayYearFormat.format(noonUtc(friday))} to ${monthDayYearFormat.format(noonUtc(sunday))}`;
  }
  const yearSuffix = sameYear(saturday, now) ? "" : `, ${saturday.slice(0, 4)}`;
  if (friday.slice(5, 7) === sunday.slice(5, 7)) {
    return `${formatShortDate(friday)} to ${Number(sunday.slice(8, 10))}${yearSuffix}`;
  }
  return `${formatShortDate(friday)} to ${formatShortDate(sunday)}${yearSuffix}`;
}

function clockParts(hhmm: string) {
  const [h, m] = hhmm.split(":").map(Number);
  return { hour: h % 12 || 12, minute: m, meridiem: h < 12 ? "am" : "pm" };
}

/**
 * "10:00 am", "12:00 pm". With `dense`, a time on the hour drops its minutes
 * ("11 am").
 */
export function formatTime(hhmm: string, options: { dense?: boolean } = {}): string {
  if (!/^\d{2}:\d{2}$/.test(hhmm)) return hhmm;
  const { hour, minute, meridiem } = clockParts(hhmm);
  if (options.dense && minute === 0) return `${hour} ${meridiem}`;
  return `${hour}:${String(minute).padStart(2, "0")} ${meridiem}`;
}

/** "10:00 am to 4:00 pm"; both in the afternoon reads "12:00 to 4:00 pm". */
export function formatTimeRange(start: string, end: string, options: { dense?: boolean } = {}): string {
  const startText = formatTime(start, options);
  const endText = formatTime(end, options);
  if (clockParts(start).meridiem === clockParts(end).meridiem) {
    return `${startText.replace(/ (am|pm)$/, "")} to ${endText}`;
  }
  return `${startText} to ${endText}`;
}

/** "9:41 am" in Pacific time. */
export function formatClock(instant: Date): string {
  return formatTime(pacificTime(instant));
}

/** "Nov 3, 2026 at 9:41 am" in Pacific time. */
export function formatTimestamp(instant: Date): string {
  return `${formatFullDate(pacificDate(instant))} at ${formatClock(instant)}`;
}

/** "Sat 11 am": the weekday and dense start time of an instant. */
export function formatWeekdayTime(instant: Date): string {
  return `${formatWeekday(pacificDate(instant))} ${formatTime(pacificTime(instant), { dense: true })}`;
}

/** "Saved just now", "Saved 2 min ago", "Saved 1 hr ago", else null (show the timestamp). */
export function savedAgo(savedAt: number, now: number): string | null {
  const minutes = Math.floor((now - savedAt) / 60_000);
  if (minutes < 1) return "Saved just now";
  if (minutes < 60) return `Saved ${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 12) return `Saved ${hours} hr ago`;
  return null;
}
