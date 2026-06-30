import { getDateOnlyInTimezone } from "@/lib/utils";

const PACIFIC_TZ = "America/Los_Angeles";

type CalendarScheduleDay = {
  date: Date | string;
};

export type CalendarEventLike = {
  startDate: Date | string;
  endDate: Date | string;
  scheduleDays: CalendarScheduleDay[];
};

function toDate(value: Date | string): Date {
  return value instanceof Date ? new Date(value) : new Date(value);
}

function getUtcDayParts(value: Date | string) {
  const date = toDate(value);
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth(),
    day: date.getUTCDate(),
  };
}

export function getEventDaysInMonth(
  event: CalendarEventLike,
  year: number,
  month: number
): number[] {
  const daysToShow = new Set<number>();

  if (event.scheduleDays.length > 0) {
    for (const scheduleDay of event.scheduleDays) {
      const day = getUtcDayParts(scheduleDay.date);
      if (day.year === year && day.month === month) {
        daysToShow.add(day.day);
      }
    }
    return [...daysToShow].sort((a, b) => a - b);
  }

  // Bucket the start-end span by Pacific calendar days, matching the
  // scheduleDays branch (which reads UTC-midnight @db.Date values). Local server
  // getters drifted the day by one on UTC-deployed servers.
  const startStr = getDateOnlyInTimezone(toDate(event.startDate), PACIFIC_TZ);
  const endStr = getDateOnlyInTimezone(toDate(event.endDate), PACIFIC_TZ);
  // Anchor each calendar day at UTC noon so DST never shifts the day index.
  const cursor = new Date(`${startStr}T12:00:00Z`);
  const endAnchor = new Date(`${endStr}T12:00:00Z`);
  while (cursor <= endAnchor) {
    if (cursor.getUTCFullYear() === year && cursor.getUTCMonth() === month) {
      daysToShow.add(cursor.getUTCDate());
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return [...daysToShow].sort((a, b) => a - b);
}

export function eventOccursInMonth(
  event: CalendarEventLike,
  year: number,
  month: number
): boolean {
  return getEventDaysInMonth(event, year, month).length > 0;
}
