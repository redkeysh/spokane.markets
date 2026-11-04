/**
 * Market dates as plain data: weekly, monthly and picked patterns, last season moved a year on,
 * and the titles and web addresses of new dates. No database access, so the Add dates form runs
 * the same rules in the browser; src/lib/markets/create-dates.ts writes the dates.
 */
import { addDays, daysBetween, formatDay, pacificDate, pacificTime, weekdayIndex } from "@/lib/admin/format";
import { lastLocalDay, type ScheduleDayRow } from "@/lib/events/readiness";
import { EVENT_SLUG_MAX_LENGTH, RESERVED_EVENT_SLUGS } from "@/lib/events/slug-rules";
import { slugify } from "@/lib/utils";

/** Day names by weekdayIndex: Monday is 0, Sunday is 6. */
export const WEEKDAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"] as const;
export const WEEKDAY_PLURALS = ["Mondays", "Tuesdays", "Wednesdays", "Thursdays", "Fridays", "Saturdays", "Sundays"] as const;
export const WEEKDAY_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
export const ORDINAL_WORDS = ["first", "second", "third", "fourth", "fifth"] as const;

/**
 * How new dates repeat. Weekdays count from Monday (0) to Sunday (6). A monthly `nth` is 1 to 5,
 * or -1 for the last of its weekday in the month.
 */
export type DatePattern =
  | { kind: "weekly"; weekdays: number[]; from: string; to: string }
  | { kind: "monthly"; nth: number; weekday: number; from: string; to: string }
  | { kind: "dates"; dates: string[] };

/** The most dates one request creates. */
export const MAX_NEW_DATES = 100;

/** A weekly or monthly pattern covers at most this many days. */
export const MAX_PATTERN_DAYS = 731;

/** 52 weeks: the same weekday a year later. */
export const SEASON_SHIFT_DAYS = 364;

/** A listing whose first and last dates are further apart than this runs as one listing all season. */
export const SEASON_LONG_DAYS = 7;

/** A pattern or a date that cannot make dates; the message is safe to show. */
export class DatePatternError extends Error {}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const CLOCK = /^([01]\d|2[0-3]):[0-5]\d$/;

export function isIsoDate(value: unknown): value is string {
  if (typeof value !== "string" || !ISO_DATE.test(value)) return false;
  const d = new Date(`${value}T12:00:00.000Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

export function isClock(value: unknown): value is string {
  return typeof value === "string" && CLOCK.test(value);
}

/** A month ("YYYY-MM") moved by `by` months, either way. */
export function shiftMonth(month: string, by: number): string {
  const [y, m] = month.split("-").map(Number);
  const index = y * 12 + (m - 1) + by;
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, "0")}`;
}

/** The nth weekday of a month ("YYYY-MM"), or null when the month has no such day (a fifth Monday). */
export function nthWeekdayOfMonth(month: string, nth: number, weekday: number): string | null {
  if (nth === -1) {
    const last = addDays(`${shiftMonth(month, 1)}-01`, -1);
    return addDays(last, -((weekdayIndex(last) - weekday + 7) % 7));
  }
  const first = `${month}-01`;
  const date = addDays(first, ((weekday - weekdayIndex(first) + 7) % 7) + (nth - 1) * 7);
  return date.slice(0, 7) === month ? date : null;
}

/** Which weekday of its month a date is: Sat Nov 14, 2026 is { nth: 2, weekday: 5, last: false }. */
export function weekdayOfMonth(date: string): { nth: number; weekday: number; last: boolean } {
  return {
    nth: Math.ceil(Number(date.slice(8, 10)) / 7),
    weekday: weekdayIndex(date),
    last: addDays(date, 7).slice(0, 7) !== date.slice(0, 7),
  };
}

/** The dates a pattern makes, sorted and without repeats. Throws DatePatternError for a pattern that cannot work. */
export function datesForPattern(pattern: DatePattern): string[] {
  if (pattern.kind === "dates") {
    const bad = pattern.dates.find((d) => !isIsoDate(d));
    if (bad !== undefined) throw new DatePatternError(`"${bad}" is not a date.`);
    return [...new Set(pattern.dates)].sort();
  }
  const { from, to } = pattern;
  if (!isIsoDate(from) || !isIsoDate(to)) throw new DatePatternError("Pick a first and a last date.");
  if (to < from) throw new DatePatternError("The last date is before the first one.");
  if (daysBetween(from, to) > MAX_PATTERN_DAYS) throw new DatePatternError("Pick a range of two years or less.");

  if (pattern.kind === "weekly") {
    const weekdays = new Set(pattern.weekdays.filter((d) => Number.isInteger(d) && d >= 0 && d <= 6));
    if (weekdays.size === 0) throw new DatePatternError("Pick at least one day of the week.");
    const out: string[] = [];
    for (let d = from; d <= to; d = addDays(d, 1)) if (weekdays.has(weekdayIndex(d))) out.push(d);
    return out;
  }

  const { nth, weekday } = pattern;
  if (!(nth === -1 || (Number.isInteger(nth) && nth >= 1 && nth <= 5))) throw new DatePatternError("Pick which week of the month.");
  if (!(Number.isInteger(weekday) && weekday >= 0 && weekday <= 6)) throw new DatePatternError("Pick a day of the week.");
  const out: string[] = [];
  for (let month = from.slice(0, 7); month <= to.slice(0, 7); month = shiftMonth(month, 1)) {
    const date = nthWeekdayOfMonth(month, nth, weekday);
    if (date && date >= from && date <= to) out.push(date);
  }
  return out;
}

/** "Fri Nov 26, Sat Nov 27, Sun Nov 28, Fri Dec 3, and 8 more". */
export function listDates(dates: readonly string[], now: Date = new Date(), shown = 4): string {
  if (dates.length === 0) return "";
  const head = dates.slice(0, shown).map((d) => formatDay(d, now));
  const rest = dates.length - head.length;
  if (rest <= 0) {
    if (head.length === 1) return head[0];
    return `${head.slice(0, -1).join(", ")} and ${head[head.length - 1]}`;
  }
  return `${head.join(", ")}, and ${rest} more`;
}

/** "Wednesdays", "Fridays and Saturdays", "Fridays to Sundays". */
export function weekdayPhrase(dates: readonly string[]): string {
  const sorted = [...new Set(dates.map(weekdayIndex))].sort((a, b) => a - b);
  if (sorted.length === 0) return "";
  const consecutive = sorted.every((d, i) => i === 0 || d === sorted[i - 1] + 1);
  if (sorted.length >= 3 && consecutive) return `${WEEKDAY_PLURALS[sorted[0]]} to ${WEEKDAY_PLURALS[sorted[sorted.length - 1]]}`;
  const words = sorted.map((d) => WEEKDAY_PLURALS[d]);
  return words.length <= 2 ? words.join(" and ") : `${words.slice(0, -1).join(", ")} and ${words[words.length - 1]}`;
}

export type DateHours = { startTime: string; endTime: string; allDay: boolean };
export type ListingDay = DateHours & { date: string };

export type SeasonSourceEvent = {
  id: string;
  status: string;
  startDate: Date;
  endDate: Date;
  /** Pacific calendar dates. */
  scheduleDays: ScheduleDayRow[];
};

function spanHours(startDate: Date, endDate: Date): DateHours {
  const startTime = pacificTime(startDate);
  const endTime = pacificTime(endDate);
  if (startTime === "00:00" && (endTime === "23:59" || endTime === "00:00")) return { startTime: "00:00", endTime: "23:59", allDay: true };
  return startTime < endTime ? { startTime, endTime, allDay: false } : { startTime: "00:00", endTime: "23:59", allDay: true };
}

type SpanEvent = Pick<SeasonSourceEvent, "startDate" | "endDate" | "scheduleDays">;

function byDate(days: readonly ScheduleDayRow[]): ScheduleDayRow[] {
  return [...days].sort((a, b) => a.date.localeCompare(b.date));
}

/** Schedule days that stop more than a week before the listing ends are incomplete; null then. */
function completeScheduleDays(event: SpanEvent): ScheduleDayRow[] | null {
  if (event.scheduleDays.length === 0) return null;
  const days = byDate(event.scheduleDays);
  const end = lastLocalDay(event.startDate, event.endDate);
  return daysBetween(days[days.length - 1].date, end) > SEASON_LONG_DAYS ? null : days;
}

/** The first and last day of a listing: its schedule days when complete, else its start and end. */
export function listingRange(event: SpanEvent): [string, string] {
  const days = completeScheduleDays(event);
  if (days) return [days[0].date, days[days.length - 1].date];
  const first = event.scheduleDays.length ? byDate(event.scheduleDays)[0].date : pacificDate(event.startDate);
  const last = lastLocalDay(event.startDate, event.endDate);
  return [first, last < first ? first : last];
}

/** True for one listing that runs across a whole season (Kendall Yards Night Market, May 20 to Sep 16). */
export function isSeasonLong(event: SpanEvent): boolean {
  const [first, last] = listingRange(event);
  return daysBetween(first, last) > SEASON_LONG_DAYS;
}

/**
 * The days a listing takes place, each with its hours: its schedule days when they are complete;
 * for a listing that runs all season without them, every week on its first day's weekday;
 * otherwise every date from its start to its end.
 */
export function listingDays(event: SeasonSourceEvent): ListingDay[] {
  const complete = completeScheduleDays(event);
  if (complete) {
    return complete.map((d) => (d.allDay ? { date: d.date, startTime: "00:00", endTime: "23:59", allDay: true } : { ...d, allDay: false }));
  }
  const [first, last] = listingRange(event);
  const firstDay = event.scheduleDays.length ? byDate(event.scheduleDays)[0] : null;
  const hours: DateHours = firstDay
    ? firstDay.allDay
      ? { startTime: "00:00", endTime: "23:59", allDay: true }
      : { startTime: firstDay.startTime, endTime: firstDay.endTime, allDay: false }
    : spanHours(event.startDate, event.endDate);
  const step = daysBetween(first, last) > SEASON_LONG_DAYS ? 7 : 1;
  const days: ListingDay[] = [];
  for (let d = first; d <= last && days.length < 400; d = addDays(d, step)) days.push({ date: d, ...hours });
  return days;
}

export type PlannedDate = ListingDay & { sourceEventId: string; sourceDate: string };

/**
 * Last season moved 52 weeks, so Wednesdays stay Wednesdays: every day a market's listings had in
 * the 364 days before `today`, a year on, skipping days before today and days in `taken` (dates
 * the market already lists). Each planned date copies the listing it came from.
 */
export function planNextSeason(events: readonly SeasonSourceEvent[], today: string, taken: Iterable<string> = []): PlannedDate[] {
  const skip = new Set(taken);
  const since = addDays(today, -SEASON_SHIFT_DAYS);
  const planned = new Map<string, PlannedDate>();
  const ordered = [...events].sort((a, b) => a.startDate.getTime() - b.startDate.getTime());
  for (const event of ordered) {
    if (event.status === "REJECTED" || event.status === "CANCELLED") continue;
    for (const day of listingDays(event)) {
      if (day.date >= today || day.date < since) continue;
      const date = addDays(day.date, SEASON_SHIFT_DAYS);
      if (date < today || skip.has(date) || planned.has(date)) continue;
      planned.set(date, { ...day, date, sourceEventId: event.id, sourceDate: day.date });
    }
  }
  return [...planned.values()].sort((a, b) => a.date.localeCompare(b.date));
}

/** A year in a title follows the date: "Family Fall Festival 2027" copied to 2028 reads "Family Fall Festival 2028". */
export function retitleForDate(title: string, fromDate: string, toDate: string): string {
  const fromYear = fromDate.slice(0, 4);
  const toYear = toDate.slice(0, 4);
  if (fromYear === toYear) return title;
  return title.replace(new RegExp(`\\b${fromYear}\\b`, "g"), toYear);
}

/** "kendall-yards-christmas-market-2027-11-26": the title without years, then the date. */
export function dateSlug(title: string, date: string): string {
  const suffix = `-${date}`;
  const base = slugify(title.replace(/\b(19|20)\d{2}\b/g, " ")).slice(0, EVENT_SLUG_MAX_LENGTH - suffix.length - 3).replace(/-+$/, "");
  return `${base || "market-date"}${suffix}`;
}

/** Each wanted slug, or the first of slug-2, slug-3, ... not taken; picked slugs are added to `taken`. */
export function pickSlugs(wanted: readonly string[], taken: Set<string>): string[] {
  return wanted.map((slug) => {
    let candidate = slug;
    for (let n = 2; taken.has(candidate) || RESERVED_EVENT_SLUGS.has(candidate); n += 1) candidate = `${slug}-${n}`;
    taken.add(candidate);
    return candidate;
  });
}

export type NewDate = {
  date: string;
  startTime?: string;
  endTime?: string;
  allDay?: boolean;
  /** The listing this date copies; falls back to the request's copyFromEventId, then to the market. */
  sourceEventId?: string | null;
};

export type NewDateStatus = "DRAFT" | "PUBLISHED";

export function isNewDateStatus(value: unknown): value is NewDateStatus {
  return value === "DRAFT" || value === "PUBLISHED";
}

/** Checks dates and hours before anything is read; returns them normalized. With `today`, a date before it is refused. */
export function validateNewDates(dates: readonly NewDate[], today?: string): (NewDate & DateHours)[] {
  if (dates.length === 0) throw new DatePatternError("There are no dates to create.");
  if (dates.length > MAX_NEW_DATES) throw new DatePatternError(`Create at most ${MAX_NEW_DATES} dates at a time.`);
  return dates.map((d) => {
    if (!isIsoDate(d.date)) throw new DatePatternError(`"${d.date}" is not a date.`);
    if (today && d.date < today) throw new DatePatternError(`${formatDay(d.date)} has gone by. New dates start today or later.`);
    if (d.allDay) return { ...d, startTime: "00:00", endTime: "23:59", allDay: true };
    if (!isClock(d.startTime) || !isClock(d.endTime)) throw new DatePatternError("Give each date an opening and a closing time, or make it all day.");
    if (d.startTime >= d.endTime) throw new DatePatternError("The closing time is before the opening time.");
    return { ...d, startTime: d.startTime, endTime: d.endTime, allDay: false };
  });
}

