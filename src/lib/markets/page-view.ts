/**
 * The market page's words, from its listings: dates by season, what each date copies, and how its
 * history reads. Pure.
 */
import { addDays, formatDay, formatShortDate, formatTimeRange, pacificDate, weekdayIndex } from "@/lib/admin/format";
import { eventLocalDates } from "@/lib/events/readiness";
import { WEEKDAY_NAMES, isSeasonLong, listingDays, planNextSeason, weekdayPhrase, type DateHours, type PlannedDate } from "./dates";
import { addressNamesAnotherEvent, describePlan, statusWord, type BoardEvent, type BoardMarket, type SeasonGroup } from "./board";

const WAITING = new Set(["PENDING", "DRAFT"]);
const LISTED = new Set(["PUBLISHED", "PENDING", "DRAFT"]);

export type DateRow = {
  id: string;
  href: string;
  date: string;
  when: string;
  title: string | null;
  place: string | null;
  status: "PUBLISHED" | "PENDING" | "DRAFT" | "CANCELLED" | "REJECTED";
  waiting: boolean;
  flags: string[];
};

export type SeasonRows = {
  key: string;
  heading: string;
  fact: string;
  ended: boolean;
  rows: DateRow[];
  repeat: { plan: PlannedDate[]; summary: string; year: string; eventIds: string[] } | null;
};

function hoursText(hours: DateHours): string {
  return hours.allDay ? "all day" : formatTimeRange(hours.startTime, hours.endTime);
}

/** "Fri Nov 27, 12:00 to 4:00 pm"; "Sat Dec 12 to Sun Dec 13"; "Wednesdays, Wed May 20 to Wed Sep 16". */
export function whenText(event: BoardEvent, now: Date): string {
  const days = listingDays(event);
  const first = days[0];
  if (!first) return formatDay(pacificDate(event.startDate), now);
  const last = days[days.length - 1].date;
  if (isSeasonLong(event)) return `${weekdayPhrase(days.map((d) => d.date))}, ${formatDay(first.date, now)} to ${formatDay(last, now)}`;
  if (last !== first.date) return `${formatDay(first.date, now)} to ${formatDay(last, now)}`;
  return `${formatDay(first.date, now)}, ${hoursText(first)}`;
}

function seasonFact(events: readonly BoardEvent[], ended: boolean, now: Date): string {
  if (ended) {
    const statuses = new Set(events.map((e) => e.status));
    return statuses.size === 1 ? `${statusWord([...statuses][0])}, ended` : "Ended";
  }
  const live = events.filter((e) => e.status === "PUBLISHED").length;
  const waiting = events.filter((e) => WAITING.has(e.status) && e.startDate >= now).length;
  const n = events.length;
  return [`${n} ${n === 1 ? "date" : "dates"}`, live ? `${live} live` : null, waiting ? `${waiting} waiting` : null].filter(Boolean).join(", ");
}

/** Dates the market already lists (not rejected or cancelled). */
export function takenDates(events: readonly BoardEvent[]): string[] {
  return [...new Set(events.filter((e) => LISTED.has(e.status)).flatMap((e) => eventLocalDates(e)))].sort();
}

/** Each season's heading, fact and date rows; a past season-long listing offers next year's weekly dates. */
export function seasonRows(seasons: readonly SeasonGroup[], market: BoardMarket, events: readonly BoardEvent[], now: Date): SeasonRows[] {
  const today = pacificDate(now);
  const taken = takenDates(events);
  return seasons.map((season) => {
    const title = season.title ? `: ${season.title}` : "";
    const summary = season.summary ? `, ${season.summary}` : "";
    const longListing = season.ended && season.seasonLong ? season.events[0] : null;
    const plan = longListing ? planNextSeason([longListing], today, taken) : [];
    return {
      key: season.key,
      heading: `${season.name}${title}${summary}`,
      fact: seasonFact(season.events, season.ended, now),
      ended: season.ended,
      rows: season.events.map((e) => ({
        id: e.id,
        href: `/admin/events/${e.id}?from=markets&back=${encodeURIComponent(`/admin/markets/${market.id}`)}`,
        date: listingDays(e)[0]?.date ?? pacificDate(e.startDate),
        when: whenText(e, now),
        title: e.title !== season.title ? e.title : null,
        place: e.venueId !== market.venue.id ? e.venueName : null,
        status: (["PUBLISHED", "PENDING", "DRAFT", "CANCELLED", "REJECTED"].includes(e.status) ? e.status : "DRAFT") as DateRow["status"],
        waiting: WAITING.has(e.status) && e.startDate >= now,
        flags: [e.imageUrl ? null : "No picture", addressNamesAnotherEvent(e, market.name) ? "Web address says otherwise" : null].filter((f): f is string => !!f),
      })),
      repeat:
        longListing && plan.length > 0
          ? { plan, summary: describePlan(plan.map((p) => p.date), now), year: plan[0].date.slice(0, 4), eventIds: [longListing.id] }
          : null,
    };
  });
}

export type CopyChoice = { id: string; label: string; date: string; hours: DateHours };

/** The listings Add dates can copy, newest first: "Kendall Yards Christmas Market, Sun Dec 13". */
export function copyChoices(events: readonly BoardEvent[], now: Date): CopyChoice[] {
  return [...events]
    .filter((e) => e.status !== "REJECTED")
    .sort((a, b) => b.startDate.getTime() - a.startDate.getTime())
    .map((e) => {
      const first = listingDays(e)[0] ?? { date: pacificDate(e.startDate), startTime: "10:00", endTime: "14:00", allDay: false };
      return {
        id: e.id,
        label: `${e.title}, ${formatDay(first.date, now)}`,
        date: first.date,
        hours: { startTime: first.startTime, endTime: first.endTime, allDay: first.allDay },
      };
    });
}

/** The first day new dates can start: the day after the market's last listed date, or today. */
export function firstFreeDay(events: readonly BoardEvent[], today: string): string {
  const taken = takenDates(events);
  const last = taken[taken.length - 1];
  return last && last >= today ? addDays(last, 1) : today;
}

/** "Today, Tuesday Nov 3", "Monday Nov 2": a history day heading. */
export function historyDay(isoDate: string, today: string): string {
  const day = `${WEEKDAY_NAMES[weekdayIndex(isoDate)]} ${formatShortDate(isoDate)}`;
  const year = isoDate.slice(0, 4) !== today.slice(0, 4) ? `, ${isoDate.slice(0, 4)}` : "";
  return `${isoDate === today ? "Today, " : isoDate === addDays(today, -1) ? "Yesterday, " : ""}${day}${year}`;
}

const MARKET_FIELD_WORDS: Record<string, string> = {
  name: "name",
  slug: "web address",
  venueId: "home place",
  baseArea: "neighborhood",
  typicalSchedule: "typical schedule",
  description: "description",
  contactEmail: "contact email",
  contactPhone: "contact phone",
  ownerId: "owner",
  participationMode: "vendor settings",
  vendorCapacity: "vendor settings",
  publicIntentListEnabled: "vendor settings",
  publicIntentNamesEnabled: "vendor settings",
  publicRosterEnabled: "vendor settings",
  vendorWorkflowMode: "vendor settings",
  vendorApplicationState: "vendor applications",
  imageUrl: "picture",
  imageFocalX: "picture",
  imageFocalY: "picture",
  websiteUrl: "website",
  facebookUrl: "Facebook link",
  instagramUrl: "Instagram link",
  listingCommunityBadgeIds: "community badges",
  complianceFlagged: "flag",
  complianceNotes: "notes",
  verificationStatus: "verification",
};

export function marketFieldWord(field: string): string {
  return MARKET_FIELD_WORDS[field] ?? field;
}

/**
 * A market history line in the owner's words, for the actions the shared history does not word
 * yet; null keeps the shared sentence.
 */
export function marketHistorySentence(
  entry: { action: string; actor: string; title: string | null; newValue: Record<string, unknown> | null }
): string | null {
  const name = entry.title ?? "this market";
  switch (entry.action) {
    case "UPDATE_MARKET": {
      const next = entry.newValue ?? {};
      const fields = Object.keys(next);
      if (fields.length === 1 && fields[0] === "verificationStatus") {
        const status = next.verificationStatus;
        if (status === "VERIFIED") return `${entry.actor} verified ${name}.`;
        if (status === "PENDING") return `${entry.actor} marked ${name} as waiting for verification.`;
        return `${entry.actor} marked ${name} as not verified.`;
      }
      const words = [...new Set(fields.map(marketFieldWord))];
      return `${entry.actor} changed ${name}${words.length ? `: ${words.join(", ")}` : ""}.`;
    }
    case "SOFT_DELETE_MARKET":
      return `${entry.actor} archived ${name}.`;
    case "RESTORE_MARKET":
      return `${entry.actor} restored ${name}.`;
    default:
      return null;
  }
}

/** Before and after values of a change, as words for the Details disclosure. */
export function changeDetails(previous: Record<string, unknown> | null, next: Record<string, unknown> | null): { label: string; before: string | null; after: string | null }[] {
  if (!next) return [];
  const show = (v: unknown): string | null => {
    if (v === null || v === undefined || v === "") return null;
    if (Array.isArray(v)) return v.length ? `${v.length} chosen` : null;
    if (typeof v === "boolean") return v ? "On" : "Off";
    if (typeof v === "object") return JSON.stringify(v);
    return String(v);
  };
  return Object.keys(next).map((key) => ({ label: marketFieldWord(key), before: show(previous?.[key]), after: show(next[key]) }));
}
