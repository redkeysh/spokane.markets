import { cache } from "react";
import { db } from "@/lib/db";
import { eventLocalDates } from "@/lib/events/readiness";
import {
  addDays,
  dateColumnToIso,
  formatDay,
  formatMonth,
  formatShortDate,
  formatTime,
  formatWeekday,
  pacificDate,
  pacificTime,
  saturdayOf,
  startOfPacificDay,
  weekdayIndex,
} from "./format";
import { localDayName } from "./local-days";

export type RailStatus = "PUBLISHED" | "PENDING" | "DRAFT";

export type RailStall = { id: string; title: string; status: RailStatus; startLabel: string; kind: "event" | "submission" };

export type RailWeek = {
  /** The Saturday as "2026-11-07", or "later". */
  key: string;
  /** "2026-11-07"; null for Later. */
  saturday: string | null;
  /** "Nov 7" or "Later". */
  label: string;
  /** "This Saturday" ("This weekend" on Sunday), "Next Saturday", a local day name, "Jan to Oct 2027" for Later, or null. */
  name: string | null;
  live: number;
  pending: number;
  draft: number;
  /** Ordered Published, Pending, Draft. */
  stalls: RailStall[];
};

export type WeekendRail = {
  /** Pacific date, "2026-11-03". */
  today: string;
  /** 0 = Monday through 6 = Sunday. */
  todayWeekday: number;
  /** The next 7 Saturdays (the first is this week's), then Later. */
  weeks: RailWeek[];
};

export const RAIL_WEEKS = 7;

export type RailScheduleDay = { date: string; startTime: string; allDay: boolean };

export type RailEventInput = {
  id: string;
  title: string;
  status: string;
  startDate: Date;
  endDate: Date;
  /** Pacific dates. */
  scheduleDays: RailScheduleDay[];
};

export type RailSubmissionInput = {
  id: string;
  title: string;
  /** Pacific dates with the start time, or null when all day. */
  days: { date: string; startTime: string | null }[];
};

export type RailInput = { events: RailEventInput[]; submissions: RailSubmissionInput[] };

const STATUS_ORDER: Record<RailStatus, number> = { PUBLISHED: 0, PENDING: 1, DRAFT: 2 };

/** A day an event or submission happens; `time` is null when the day is all day or its hours are unknown. */
type DayStart = { date: string; time: string | null; allDay: boolean };

type Placed = RailStall & DayStart;

function dayStart(event: RailEventInput, date: string): DayStart {
  const day = event.scheduleDays.find((d) => d.date === date);
  if (day) return { date, time: day.allDay ? null : day.startTime, allDay: day.allDay };
  if (date !== pacificDate(event.startDate)) return { date, time: null, allDay: false };
  const time = pacificTime(event.startDate);
  return time === "00:00" ? { date, time: null, allDay: true } : { date, time, allDay: false };
}

/** "Sat 11 am", "Sat, all day"; in Later the full date: "Thu Jan 28, 2027, 11 am". */
function startLabel(day: DayStart, inLater: boolean, now: Date): string {
  const base = inLater ? formatDay(day.date, now) : formatWeekday(day.date);
  if (day.time) return `${base}${inLater ? "," : ""} ${formatTime(day.time, { dense: true })}`;
  return day.allDay ? `${base}, all day` : base;
}

function laterName(dates: string[]): string | null {
  if (dates.length === 0) return null;
  const sorted = [...dates].sort();
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  const firstYear = first.slice(0, 4);
  const lastYear = last.slice(0, 4);
  if (first.slice(0, 7) === last.slice(0, 7)) return `${formatMonth(first)} ${firstYear}`;
  if (firstYear === lastYear) return `${formatMonth(first)} to ${formatMonth(last)} ${lastYear}`;
  return `${formatMonth(first)} ${firstYear} to ${formatMonth(last)} ${lastYear}`;
}

/**
 * Files events and pending submissions into every Monday-to-Sunday week they
 * touch on or after today (Pacific): the next RAIL_WEEKS weeks by their
 * Saturday, and Later for everything after.
 */
export function buildWeekendRail(input: RailInput, now: Date): WeekendRail {
  const today = pacificDate(now);
  const saturdays = Array.from({ length: RAIL_WEEKS }, (_, i) => addDays(saturdayOf(today), i * 7));
  const lastRailDay = addDays(saturdays[RAIL_WEEKS - 1], 1);
  const placed = new Map<string, Placed[]>([...saturdays, "later"].map((key) => [key, []]));
  const laterDates: string[] = [];

  const place = (stall: RailStall, days: DayStart[]) => {
    const seen = new Set<string>();
    for (const day of days) {
      if (day.date < today) continue;
      const key = day.date > lastRailDay ? "later" : saturdayOf(day.date);
      if (key === "later") laterDates.push(day.date);
      if (seen.has(key)) continue;
      seen.add(key);
      placed.get(key)!.push({ ...stall, ...day, startLabel: startLabel(day, key === "later", now) });
    }
  };

  for (const event of input.events) {
    if (!(event.status in STATUS_ORDER)) continue;
    const days = eventLocalDates(event, { from: today }).map((date) => dayStart(event, date));
    place({ id: event.id, title: event.title, status: event.status as RailStatus, startLabel: "", kind: "event" }, days);
  }
  for (const submission of input.submissions) {
    const days = [...submission.days]
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((d) => ({ date: d.date, time: d.startTime, allDay: d.startTime === null }));
    place({ id: submission.id, title: submission.title, status: "PENDING", startLabel: "", kind: "submission" }, days);
  }

  const toWeek = (key: string): RailWeek => {
    const rows = placed
      .get(key)!
      .sort(
        (a, b) =>
          STATUS_ORDER[a.status] - STATUS_ORDER[b.status] ||
          a.date.localeCompare(b.date) ||
          (a.time ?? "").localeCompare(b.time ?? "") ||
          a.title.localeCompare(b.title)
      );
    const count = (status: RailStatus) => rows.filter((r) => r.status === status).length;
    const stalls = rows.map(({ id, title, status, startLabel, kind }) => ({ id, title, status, startLabel, kind }));
    if (key === "later") {
      return { key, saturday: null, label: "Later", name: laterName(laterDates), live: count("PUBLISHED"), pending: count("PENDING"), draft: count("DRAFT"), stalls };
    }
    const index = saturdays.indexOf(key);
    const thisWeek = key < today ? "This weekend" : "This Saturday";
    const relative = index === 0 ? thisWeek : index === 1 ? "Next Saturday" : null;
    return {
      key,
      saturday: key,
      label: formatShortDate(key),
      name: localDayName(key) ?? relative,
      live: count("PUBLISHED"),
      pending: count("PENDING"),
      draft: count("DRAFT"),
      stalls,
    };
  };

  return { today, todayWeekday: weekdayIndex(today), weeks: [...saturdays, "later"].map(toWeek) };
}

type SubmissionDayJson = { date?: unknown; startTime?: unknown; allDay?: unknown };

/** The Pacific days of a submission: its schedule days when set, otherwise its first date. */
export function submissionDays(submission: {
  eventDate: string;
  eventTime: string;
  allDay: boolean;
  scheduleDays: unknown;
}): { date: string; startTime: string | null }[] {
  if (Array.isArray(submission.scheduleDays) && submission.scheduleDays.length > 0) {
    return (submission.scheduleDays as SubmissionDayJson[])
      .filter((d): d is { date: string; startTime?: unknown; allDay?: unknown } => typeof d?.date === "string")
      .map((d) => ({ date: d.date, startTime: d.allDay === true || typeof d.startTime !== "string" ? null : d.startTime }));
  }
  return [{ date: submission.eventDate, startTime: submission.allDay ? null : submission.eventTime || null }];
}

/**
 * The rows the rail counts: listed events still running on or after `from` (and starting before
 * `before`, when given), and every pending submission.
 */
export async function loadRailRows(from: string, before?: string): Promise<RailInput> {
  const [events, submissions] = await Promise.all([
    db.event.findMany({
      where: {
        deletedAt: null,
        status: { in: ["PUBLISHED", "PENDING", "DRAFT"] },
        ...(before ? { startDate: { lt: startOfPacificDay(before) } } : {}),
        endDate: { gte: startOfPacificDay(from) },
      },
      select: {
        id: true,
        title: true,
        status: true,
        startDate: true,
        endDate: true,
        scheduleDays: { select: { date: true, startTime: true, allDay: true } },
      },
    }),
    db.submission.findMany({
      where: { status: "PENDING" },
      select: { id: true, eventTitle: true, eventDate: true, eventTime: true, allDay: true, scheduleDays: true },
    }),
  ]);
  return {
    events: events.map((e) => ({
      ...e,
      scheduleDays: e.scheduleDays.map((d) => ({ date: dateColumnToIso(d.date), startTime: d.startTime, allDay: d.allDay })),
    })),
    submissions: submissions.map((s) => ({ id: s.id, title: s.eventTitle, days: submissionDays(s) })),
  };
}

const loadRailInput = cache((today: string) => loadRailRows(today));

/** The weekend rail for the admin layout. The database read is shared by every caller in one request. */
export async function getWeekendRail(now: Date = new Date()): Promise<WeekendRail> {
  return buildWeekendRail(await loadRailInput(pacificDate(now)), now);
}
