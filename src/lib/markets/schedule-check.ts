import { weekdayIndex } from "@/lib/admin/format";
import { ORDINAL_WORDS, WEEKDAY_NAMES, weekdayOfMonth, weekdayPhrase } from "./dates";

/** What a typical schedule text says about days: the weekdays it names, and "second" in "second Saturday". */
export type NamedDays = { weekdays: Set<number>; nth: number | null; text: string };

const DAY_WORDS: [RegExp, number][] = [
  [/^mon(day)?s?$/, 0],
  [/^tue(s|sday)?s?$/, 1],
  [/^wed(nesday)?s?$/, 2],
  [/^thu(r|rs|rsday)?s?$/, 3],
  [/^fri(day)?s?$/, 4],
  [/^sat(urday)?s?$/, 5],
  [/^sun(day)?s?$/, 6],
];

const NTH_WORDS: Record<string, number> = { first: 1, "1st": 1, second: 2, "2nd": 2, third: 3, "3rd": 3, fourth: 4, "4th": 4, last: -1 };

function dayOf(word: string): number | null {
  for (const [pattern, day] of DAY_WORDS) if (pattern.test(word)) return day;
  return null;
}

/**
 * The days a typical schedule names: "Every Saturday", "Fridays to Sundays", "Fri-Sun",
 * "Wednesdays and Saturdays", "weekends", "daily", "Second Saturday of the month". Null when it
 * names no day, so there is nothing to check.
 */
export function namedDays(text: string | null | undefined): NamedDays | null {
  if (!text?.trim()) return null;
  const words = text
    .toLowerCase()
    .replace(/[‐-―]/g, "-")
    .replace(/(\w)-(\w)/g, "$1 to $2")
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
  const weekdays = new Set<number>();
  let nth: number | null = null;
  for (let i = 0; i < words.length; i += 1) {
    const word = words[i];
    if (word === "daily" || (word === "every" && words[i + 1] === "day")) for (let d = 0; d < 7; d += 1) weekdays.add(d);
    if (word === "weekend" || word === "weekends") {
      weekdays.add(5);
      weekdays.add(6);
    }
    if (word === "weekday" || word === "weekdays") for (let d = 0; d < 5; d += 1) weekdays.add(d);
    const day = dayOf(word);
    if (day === null) continue;
    if (i > 0 && NTH_WORDS[words[i - 1]] !== undefined) nth = NTH_WORDS[words[i - 1]];
    const joiner = words[i + 1];
    const end = joiner === "to" || joiner === "through" || joiner === "thru" ? dayOf(words[i + 2] ?? "") : null;
    if (end !== null) {
      for (let d = day; ; d = (d + 1) % 7) {
        weekdays.add(d);
        if (d === end) break;
      }
      i += 2;
    } else {
      weekdays.add(day);
    }
  }
  if (weekdays.size === 0) return null;
  return { weekdays, nth, text: text.trim() };
}

export type ScheduleCheck = {
  /** One line for the owner, e.g. 'The typical schedule says "Every Saturday", but 4 dates fall on Fridays and Sundays.' */
  message: string;
  /** The dates that do not fit. */
  offDates: string[];
};

function nthWord(nth: number): string {
  return nth === -1 ? "last" : ORDINAL_WORDS[nth - 1];
}

/**
 * Checks a market's typical schedule text against its dates (Pacific calendar dates). Null when
 * the text names no day, there are no dates, or every date fits.
 */
export function checkTypicalSchedule(text: string | null | undefined, dates: readonly string[]): ScheduleCheck | null {
  const named = namedDays(text);
  const unique = [...new Set(dates)].sort();
  if (!named || unique.length === 0) return null;

  const offDay = unique.filter((d) => !named.weekdays.has(weekdayIndex(d)));
  if (offDay.length > 0) {
    const count = offDay.length === unique.length ? (unique.length === 1 ? "its date falls" : `its ${unique.length} dates fall`) : `${offDay.length} of its ${unique.length} dates fall`;
    return {
      message: `The typical schedule says "${named.text}", but ${count} on ${weekdayPhrase(offDay)}.`,
      offDates: offDay,
    };
  }

  if (named.nth !== null && named.weekdays.size === 1) {
    const wrongWeek = unique.filter((d) => {
      const at = weekdayOfMonth(d);
      return named.nth === -1 ? !at.last : at.nth !== named.nth;
    });
    if (wrongWeek.length > 0) {
      const day = WEEKDAY_NAMES[[...named.weekdays][0]];
      return {
        message: `The typical schedule says "${named.text}", but ${wrongWeek.length === 1 ? "1 date is not" : `${wrongWeek.length} dates are not`} the ${nthWord(named.nth)} ${day} of its month.`,
        offDates: wrongWeek,
      };
    }
  }
  return null;
}
