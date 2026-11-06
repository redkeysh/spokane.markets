import { addDays, formatDay, formatTime, pacificDate, pacificTime } from "@/lib/admin/format";
import { slugify } from "@/lib/utils";

export type ScheduleDayRow = { date: string; startTime: string; endTime: string; allDay: boolean };

export type ReadinessVenue = {
  id: string;
  name: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  neighborhood: string | null;
  deletedAt: Date | null;
};

export type ReadinessEvent = {
  status: string;
  title: string;
  slug: string;
  startDate: Date;
  endDate: Date;
  /** Pacific calendar dates, "YYYY-MM-DD". */
  scheduleDays: ScheduleDayRow[];
  imageUrl: string | null;
  description: string | null;
  tagCount: number;
  featureCount: number;
  venue: ReadinessVenue | null;
};

export type BlockingFlag =
  | "not-waiting"
  | "ended"
  | "place-archived"
  | "place-incomplete"
  | "multi-day-no-hours"
  | "closes-before-opens"
  | "opens-at-midnight";

export type WarningFlag =
  | "no-picture"
  | "no-tags"
  | "no-features"
  | "importer-note"
  | "slug-mismatch"
  | "picture-is-page"
  | "place-listed-twice"
  | "no-neighborhood";

export type ReadinessFlag = BlockingFlag | WarningFlag;

export type ReadinessIssue = { flag: ReadinessFlag; message: string; dates?: string[] };

export type Readiness = { ready: boolean; blocking: ReadinessIssue[]; warnings: ReadinessIssue[] };

export type ReadinessContext = {
  /** Pacific date of today, "YYYY-MM-DD". */
  today: string;
  /** Active venues that sit in a duplicate group. */
  duplicateVenueIds?: ReadonlySet<string>;
};

const WAITING = new Set(["PENDING", "DRAFT"]);

/** The Pacific date of the last day: an end at exactly 12:00 am belongs to the day before. */
export function lastLocalDay(startDate: Date, endDate: Date): string {
  const end = pacificDate(endDate);
  return pacificTime(endDate) === "00:00" && endDate > startDate && end > pacificDate(startDate) ? addDays(end, -1) : end;
}

/**
 * The Pacific dates an event takes place, on or after `from` when given:
 * its schedule days when it has any, otherwise every date from its start to
 * its end. At most `maxDays` dates are returned.
 */
export function eventLocalDates(
  event: { startDate: Date; endDate: Date; scheduleDays: { date: string }[] },
  options: { from?: string; maxDays?: number } = {}
): string[] {
  const from = options.from ?? "";
  const maxDays = options.maxDays ?? 400;
  if (event.scheduleDays.length > 0) {
    return [...new Set(event.scheduleDays.map((d) => d.date))].filter((d) => d >= from).sort().slice(0, maxDays);
  }
  const dates: string[] = [];
  const start = pacificDate(event.startDate);
  const last = lastLocalDay(event.startDate, event.endDate);
  for (let d = start > from ? start : from; d <= last && dates.length < maxDays; d = addDays(d, 1)) dates.push(d);
  return dates;
}

/** The Pacific date an event ends: its last schedule day, or its end. */
export function eventEndDate(event: { startDate: Date; endDate: Date; scheduleDays: { date: string }[] }): string {
  const dates = event.scheduleDays.map((d) => d.date).sort();
  return dates.length > 0 ? dates[dates.length - 1] : lastLocalDay(event.startDate, event.endDate);
}

/** True when the event's last day is before today (Pacific). */
export function hasEnded(event: { startDate: Date; endDate: Date; scheduleDays: { date: string }[] }, today: string): boolean {
  return eventEndDate(event) < today;
}

const VENUE_PARTS = [
  ["name", "name"],
  ["address", "street"],
  ["city", "city"],
  ["state", "state"],
  ["zip", "ZIP"],
] as const;

/** The parts of a place's address that are blank, in words ("street", "ZIP"). */
export function missingVenueParts(venue: Pick<ReadinessVenue, "name" | "address" | "city" | "state" | "zip">): string[] {
  return VENUE_PARTS.filter(([key]) => !venue[key]?.trim()).map(([, word]) => word);
}

/** Phrases an import pipeline left in a description instead of facts. */
export const IMPORTER_NOTE_PATTERNS = [
  /admission (?:is |was )?not published/i,
  /at the time of this run/i,
  /had not been announced/i,
];

export function hasImporterNote(description: string | null | undefined): boolean {
  return !!description && IMPORTER_NOTE_PATTERNS.some((pattern) => pattern.test(description));
}

const SLUG_IGNORED = new Set(["a", "an", "and", "at", "for", "in", "of", "on", "the", "with"]);

/** True when the web address names words the title does not ("rathdrum-craft-and-farmers-market-2027-10-16" for "Family Fall Festival 2027"). */
export function slugDisagreesWithTitle(title: string, slug: string): boolean {
  const titleWords = new Set(slugify(title).split("-"));
  return slug
    .replace(/-\d{4}-\d{2}-\d{2}(?:-\d+)?$/, "")
    .split("-")
    .some((word) => word !== "" && !/^\d+$/.test(word) && !SLUG_IGNORED.has(word) && !titleWords.has(word));
}

const PAGE_HOSTS = /(^|\.)(facebook\.com|fb\.com|fb\.me|instagram\.com|eventbrite\.com|linktr\.ee)$/i;

/** True when an image link points at a web page rather than an image file. */
export function pictureIsWebPage(url: string | null | undefined): boolean {
  if (!url || url.startsWith("/uploads/")) return false;
  try {
    const parsed = new URL(url);
    if (/\.(jpe?g|png|webp|gif|avif|svg)$/i.test(parsed.pathname)) return false;
    return PAGE_HOSTS.test(parsed.hostname) || /\.(html?|aspx?|php)$/i.test(parsed.pathname);
  } catch {
    return true;
  }
}

function isAllDayRange(day: ScheduleDayRow) {
  return day.allDay || (day.startTime === "00:00" && day.endTime === "23:59");
}

/** Problems with the hours visitors would see, for live events as well as waiting ones. */
export function scheduleProblems(event: Pick<ReadinessEvent, "startDate" | "endDate" | "scheduleDays">): ReadinessIssue[] {
  const issues: ReadinessIssue[] = [];
  if (event.scheduleDays.length === 0) {
    const days = eventLocalDates(event, { maxDays: 8 });
    if (days.length > 1) {
      issues.push({
        flag: "multi-day-no-hours",
        message: `Runs ${days.length >= 8 ? "more than a week" : `${days.length} days`} with no daily hours.`,
      });
    }
    return issues;
  }
  const timed = event.scheduleDays.filter((d) => !isAllDayRange(d));
  const backwards = timed.filter((d) => d.endTime < d.startTime);
  if (backwards.length > 0) {
    const day = backwards[0];
    issues.push({
      flag: "closes-before-opens",
      message: `${formatDay(day.date)} closes at ${formatTime(day.endTime)}, before it opens at ${formatTime(day.startTime)}.`,
      dates: backwards.map((d) => d.date),
    });
  }
  const midnight = timed.filter((d) => d.startTime === "00:00");
  if (midnight.length > 0) {
    issues.push({
      flag: "opens-at-midnight",
      message: `${formatDay(midnight[0].date)} opens at 12:00 am, as if one stretch were split at midnight.`,
      dates: midnight.map((d) => d.date),
    });
  }
  return issues;
}

/** Why an event at this place cannot be published: no place, an archived one, or a blank address part. */
export function placeProblems(
  venue: Pick<ReadinessVenue, "name" | "address" | "city" | "state" | "zip" | "deletedAt"> | null
): ReadinessIssue[] {
  if (!venue) return [{ flag: "place-incomplete", message: "Can't publish yet: no place." }];
  const issues: ReadinessIssue[] = [];
  if (venue.deletedAt) issues.push({ flag: "place-archived", message: `Its place, ${venue.name}, is archived.` });
  const missing = missingVenueParts(venue);
  if (missing.length > 0) issues.push({ flag: "place-incomplete", message: `Can't publish yet: no ${missing.join(", no ")}.` });
  return issues;
}

/**
 * Whether a waiting event can be published as part of a ready batch: Pending
 * or Draft, not ended, at an active place with a full address, and with no
 * blocking flag. Warnings never block.
 */
export function readiness(event: ReadinessEvent, context: ReadinessContext): Readiness {
  const blocking: ReadinessIssue[] = [];
  const warnings: ReadinessIssue[] = [];

  if (!WAITING.has(event.status)) blocking.push({ flag: "not-waiting", message: "It is not waiting for review." });
  if (hasEnded(event, context.today)) blocking.push({ flag: "ended", message: "It already happened." });

  const venue = event.venue;
  blocking.push(...placeProblems(venue));
  blocking.push(...scheduleProblems(event));

  if (!event.imageUrl?.trim()) warnings.push({ flag: "no-picture", message: "No picture" });
  else if (pictureIsWebPage(event.imageUrl)) {
    warnings.push({ flag: "picture-is-page", message: "The picture link is a web page, not a picture" });
  }
  if (event.tagCount === 0) warnings.push({ flag: "no-tags", message: "No tags" });
  if (event.featureCount === 0) warnings.push({ flag: "no-features", message: "No features" });
  if (hasImporterNote(event.description)) {
    warnings.push({ flag: "importer-note", message: "The description has an importer note" });
  }
  if (slugDisagreesWithTitle(event.title, event.slug)) {
    warnings.push({ flag: "slug-mismatch", message: `The web address says ${event.slug}` });
  }
  if (venue && context.duplicateVenueIds?.has(venue.id)) {
    warnings.push({ flag: "place-listed-twice", message: `${venue.name} is listed twice` });
  }
  if (venue && !venue.neighborhood) warnings.push({ flag: "no-neighborhood", message: `${venue.name} has no neighborhood` });

  return { ready: blocking.length === 0, blocking, warnings };
}
