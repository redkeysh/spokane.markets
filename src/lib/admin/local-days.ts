import { addDays, weekdayIndex } from "./format";

/**
 * Local days that name a week on the admin rail in place of "Saturday". The
 * list is edited by hand; each entry computes its Saturday for any year. When
 * two entries name the same week, the earlier one wins.
 */
export type LocalDayRule = {
  name: string;
  /** How the date is found, in words. */
  rule: string;
  /** The Saturday of the weekend the day names. */
  saturdayFor(year: number): string;
};

function iso(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** The nth (1-based) weekday (0 = Monday) of a month. */
function nthWeekday(year: number, month: number, weekday: number, n: number): string {
  const first = iso(year, month, 1);
  const offset = (weekday - weekdayIndex(first) + 7) % 7;
  return addDays(first, offset + (n - 1) * 7);
}

const MONDAY = 0;
const THURSDAY = 3;
const SATURDAY = 5;
const SUNDAY = 6;

const thanksgiving = (year: number) => nthWeekday(year, 11, THURSDAY, 4);

export const LOCAL_DAYS: LocalDayRule[] = [
  {
    name: "Small Business Saturday",
    rule: "The Saturday after Thanksgiving",
    saturdayFor: (year) => addDays(thanksgiving(year), 2),
  },
  {
    name: "Thanksgiving weekend",
    rule: "The weekend after the fourth Thursday of November",
    saturdayFor: (year) => addDays(thanksgiving(year), 2),
  },
  {
    name: "Saturday before Christmas",
    rule: "The last Saturday before December 25",
    saturdayFor: (year) => {
      const christmas = iso(year, 12, 25);
      return addDays(christmas, -(((weekdayIndex(christmas) - SATURDAY + 7) % 7) || 7));
    },
  },
  {
    name: "Bloomsday weekend",
    rule: "The weekend of the first Sunday of May",
    saturdayFor: (year) => addDays(nthWeekday(year, 5, SUNDAY, 1), -1),
  },
  {
    name: "Lilac parade Saturday",
    rule: "The third Saturday of May",
    saturdayFor: (year) => nthWeekday(year, 5, SATURDAY, 3),
  },
  {
    name: "Hoopfest weekend",
    rule: "The last weekend of June whose Sunday is still in June",
    saturdayFor: (year) => {
      const lastSaturday = addDays(nthWeekday(year, 7, SATURDAY, 1), -7);
      return lastSaturday.slice(5, 7) === "06" && addDays(lastSaturday, 1).slice(5, 7) === "06"
        ? lastSaturday
        : addDays(lastSaturday, -7);
    },
  },
  {
    name: "Labor Day weekend",
    rule: "The weekend before the first Monday of September",
    saturdayFor: (year) => addDays(nthWeekday(year, 9, MONDAY, 1), -2),
  },
];

/** The last year the list has been reviewed for. */
export const LOCAL_DAYS_CHECKED_THROUGH = 2027;

/** Every local day of a year, in calendar order. */
export function localDaysFor(year: number): { name: string; saturday: string }[] {
  return LOCAL_DAYS.map((day) => ({ name: day.name, saturday: day.saturdayFor(year) })).sort((a, b) =>
    a.saturday.localeCompare(b.saturday)
  );
}

/** Every local-day name for the week of a Saturday, first match first. */
export function localDayNames(saturday: string): string[] {
  const year = Number(saturday.slice(0, 4));
  return LOCAL_DAYS.filter((day) => day.saturdayFor(year) === saturday).map((day) => day.name);
}

/** The name the rail shows for the week of a Saturday, or null. */
export function localDayName(saturday: string): string | null {
  return localDayNames(saturday)[0] ?? null;
}

/** True when the list should be checked again before the coming year. */
export function localDaysNeedCheck(today: string): boolean {
  return Number(today.slice(0, 4)) + 1 > LOCAL_DAYS_CHECKED_THROUGH;
}
