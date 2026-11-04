import type { EventStatus, Prisma } from "@prisma/client";
import { joinPairs } from "@/lib/admin/decisions/kinds/twins";
import { eventOrigin, importCohorts, type EventOrigin, type ImportCohort } from "@/lib/events/origin";
import {
  eventLocalDates,
  hasEnded,
  pictureIsWebPage,
  placeProblems,
  scheduleProblems,
  type ScheduleDayRow,
} from "@/lib/events/readiness";
import { findSeries, type Series } from "@/lib/events/series";
import { looksLikeTradeShow } from "@/lib/events/trade-shows";
import { findTwins, placeGroupIndex } from "@/lib/events/twins";
import { findDuplicateGroups, type DuplicateMemos, type VenueLike } from "@/lib/venues/match";
import {
  addDays,
  formatDay,
  formatMonthDay,
  formatShortDate,
  formatTime,
  formatTimeRange,
  formatTimestamp,
  pacificDate,
  pacificTime,
  saturdayOf,
  startOfPacificDay,
} from "./format";
import { localDayName } from "./local-days";
import { AREAS, areaOf, stateOf, type Area } from "./regions";
import { buildGroupItems, orderWeeks, sortTableRows, type GroupItem } from "./events-list-order";
import type { RailWeek } from "./weekends";

/* ------------------------------------------------------------------------------------------------
 * Filters kept in the URL
 * ---------------------------------------------------------------------------------------------- */

export const EVENTS_SHOW = ["waiting", "live", "everything"] as const;
export const EVENTS_WHEN = ["upcoming", "past", "all"] as const;
export const EVENTS_NEEDS = ["picture", "hours", "tags", "market", "neighborhood"] as const;
export const EVENTS_ONLY = ["twins", "series", "trade-shows"] as const;
export const EVENTS_VIEWS = ["weekends", "table"] as const;
export const EVENTS_SORTS = ["title", "start", "place", "market", "status", "updated"] as const;

export type EventsShow = (typeof EVENTS_SHOW)[number];
export type EventsWhen = (typeof EVENTS_WHEN)[number];
export type EventsNeed = (typeof EVENTS_NEEDS)[number];
export type EventsOnly = (typeof EVENTS_ONLY)[number];
export type EventsView = (typeof EVENTS_VIEWS)[number];
export type EventsSort = (typeof EVENTS_SORTS)[number];
export type SortDir = "asc" | "desc";

export const SHOW_LABELS: Record<EventsShow, string> = { waiting: "Waiting", live: "Live", everything: "Everything" };
export const WHEN_LABELS: Record<EventsWhen, string> = { upcoming: "Upcoming", past: "Past", all: "All" };
export const NEED_LABELS: Record<EventsNeed, string> = {
  picture: "Picture",
  hours: "Daily hours",
  tags: "Tags",
  market: "Market",
  neighborhood: "Neighborhood",
};
export const ONLY_LABELS: Record<EventsOnly, string> = { twins: "Twins", series: "Series", "trade-shows": "Maybe not a market" };

const AREA_PARAMS: Record<string, Area> = {
  spokane: "Spokane",
  "spokane-valley": "Spokane Valley",
  "north-idaho": "North Idaho",
  "farther-out": "Farther out",
};

export function areaParam(area: Area): string {
  return Object.entries(AREA_PARAMS).find(([, value]) => value === area)![0];
}

export const AREA_OPTIONS = AREAS.map((area) => ({ value: areaParam(area), label: area }));

export type EventsListFilters = {
  q: string;
  show: EventsShow;
  /** Upcoming by default for Waiting and Live; All for Everything. */
  when: EventsWhen;
  /** The URL names `when`; otherwise it follows the Show default. */
  whenSet: boolean;
  area: Area | null;
  /** "site", "organizer", "hand" or an import key such as "import-2026-10-30". */
  source: string | null;
  needs: EventsNeed[];
  only: EventsOnly[];
  /** A Saturday, "2026-11-07", or "later" for every week after the rail. */
  week: string | null;
  view: EventsView;
  sort: EventsSort;
  dir: SortDir;
  dirSet: boolean;
};

export type EventsListParams = Record<string, string | string[] | undefined>;

function firstValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function pick<T extends string>(value: string | undefined, allowed: readonly T[]): T | null {
  return allowed.includes(value as T) ? (value as T) : null;
}

function pickList<T extends string>(value: string | undefined, allowed: readonly T[]): T[] {
  const wanted = new Set((value ?? "").split(",").map((v) => v.trim()));
  return allowed.filter((v) => wanted.has(v));
}

const SOURCE_PATTERN = /^(site|organizer|hand|import-\d{4}-\d{2}-\d{2}(-\d{4})?)$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function validIsoDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false;
  const d = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

function defaultWhen(show: EventsShow): EventsWhen {
  return show === "everything" ? "all" : "upcoming";
}

function defaultDir(sort: EventsSort, when: EventsWhen): SortDir {
  if (sort === "updated") return "desc";
  if (sort === "start" && when === "past") return "desc";
  return "asc";
}

/** Reads the Events list filters from the URL; anything unknown falls back to its default. */
export function parseEventsListParams(params: EventsListParams): EventsListFilters {
  const show = pick(firstValue(params.show), EVENTS_SHOW) ?? "waiting";
  const whenParam = pick(firstValue(params.when), EVENTS_WHEN);
  const when = whenParam ?? defaultWhen(show);
  const source = (firstValue(params.source) ?? "").trim();
  const weekParam = (firstValue(params.week) ?? "").trim();
  const week = weekParam === "later" ? "later" : validIsoDate(weekParam) ? saturdayOf(weekParam) : null;
  const sort = pick(firstValue(params.sort), EVENTS_SORTS) ?? "start";
  const dirParam = pick(firstValue(params.dir), ["asc", "desc"] as const);
  return {
    q: (firstValue(params.q) ?? "").trim().slice(0, 100),
    show,
    when,
    whenSet: whenParam !== null,
    area: AREA_PARAMS[firstValue(params.area) ?? ""] ?? null,
    source: SOURCE_PATTERN.test(source) ? source : null,
    needs: pickList(firstValue(params.needs), EVENTS_NEEDS),
    only: pickList(firstValue(params.only), EVENTS_ONLY),
    week,
    view: pick(firstValue(params.view), EVENTS_VIEWS) ?? "weekends",
    sort,
    dir: dirParam ?? defaultDir(sort, when),
    dirSet: dirParam !== null,
  };
}

export type EventsFilterChange = Partial<Omit<EventsListFilters, "whenSet" | "dirSet">>;

/**
 * The filters after a change. Picking a When equal to the Show's default drops it from the URL;
 * changing Show keeps an explicit When. A sort change resets an explicit direction.
 */
export function applyFilterChange(filters: EventsListFilters, change: EventsFilterChange): EventsListFilters {
  const next = { ...filters, ...change };
  if ("when" in change) next.whenSet = change.when !== defaultWhen(next.show);
  if ("show" in change && !("when" in change) && !filters.whenSet) next.when = defaultWhen(next.show);
  if ("sort" in change && !("dir" in change)) next.dirSet = false;
  if ("dir" in change) next.dirSet = true;
  if (!next.dirSet) next.dir = defaultDir(next.sort, next.when);
  return next;
}

/** The query string for a set of filters, naming only what differs from the defaults. */
export function eventsListQuery(filters: EventsListFilters): string {
  const qp = new URLSearchParams();
  if (filters.q) qp.set("q", filters.q);
  if (filters.show !== "waiting") qp.set("show", filters.show);
  if (filters.whenSet && filters.when !== defaultWhen(filters.show)) qp.set("when", filters.when);
  if (filters.area) qp.set("area", areaParam(filters.area));
  if (filters.source) qp.set("source", filters.source);
  if (filters.needs.length) qp.set("needs", filters.needs.join(","));
  if (filters.only.length) qp.set("only", filters.only.join(","));
  if (filters.week) qp.set("week", filters.week);
  if (filters.view !== "weekends") qp.set("view", filters.view);
  if (filters.view === "table" && filters.sort !== "start") qp.set("sort", filters.sort);
  if (filters.view === "table" && filters.dirSet) qp.set("dir", filters.dir);
  return qp.toString();
}

export function eventsListHref(filters: EventsListFilters, change: EventsFilterChange = {}): string {
  const query = eventsListQuery(applyFilterChange(filters, change));
  return query ? `/admin/events?${query}` : "/admin/events";
}

/** True when anything narrows the list beyond the defaults (the view and sort do not count). */
export function hasActiveFilters(filters: EventsListFilters): boolean {
  return (
    !!filters.q ||
    filters.show !== "waiting" ||
    (filters.whenSet && filters.when !== defaultWhen(filters.show)) ||
    !!filters.area ||
    !!filters.source ||
    filters.needs.length > 0 ||
    filters.only.length > 0 ||
    !!filters.week
  );
}

/** Every filter off, keeping the view. */
export function clearedFiltersHref(filters: EventsListFilters): string {
  return filters.view === "table" ? "/admin/events?view=table" : "/admin/events";
}

/* ------------------------------------------------------------------------------------------------
 * The database prefilter
 * ---------------------------------------------------------------------------------------------- */

const WAITING_STATUSES: EventStatus[] = ["PENDING", "DRAFT"];

/**
 * The SQL part of the list: Show, When and the search. The date bounds are loose on purpose
 * (an event ending at 12:00 am belongs to the day before); buildEventsList refines them.
 */
export function buildEventsListWhere(
  filters: Pick<EventsListFilters, "show" | "when" | "q">,
  now: Date
): Prisma.EventWhereInput {
  const startOfToday = startOfPacificDay(pacificDate(now));
  const where: Prisma.EventWhereInput = {};
  if (filters.show === "waiting") {
    where.status = { in: WAITING_STATUSES };
    where.deletedAt = null;
  } else if (filters.show === "live") {
    where.status = "PUBLISHED";
    where.deletedAt = null;
  }
  if (filters.when === "upcoming") where.endDate = { gte: startOfToday };
  else if (filters.when === "past") where.startDate = { lt: startOfToday };
  const q = filters.q.trim();
  if (q) {
    const contains = { contains: q, mode: "insensitive" as const };
    where.OR = [
      { title: contains },
      { slug: contains },
      { venue: { name: contains } },
      { venue: { city: contains } },
      { market: { name: contains } },
    ];
  }
  return where;
}

/* ------------------------------------------------------------------------------------------------
 * Building the list
 * ---------------------------------------------------------------------------------------------- */

export type ListVenue = {
  id: string;
  name: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  neighborhood: string | null;
  deletedAt: Date | null;
};

export type ListSourceEvent = {
  id: string;
  title: string;
  slug: string;
  status: string;
  deletedAt: Date | null;
  startDate: Date;
  endDate: Date;
  createdAt: Date;
  updatedAt: Date;
  /** Pacific calendar dates. */
  scheduleDays: ScheduleDayRow[];
  imageUrl: string | null;
  tagCount: number;
  marketId: string | null;
  marketName: string | null;
  venue: ListVenue | null;
  /** The account that submitted it; `alertsOn` is false when organizer alerts are off. */
  submittedBy: { name: string; role: string; alertsOn: boolean } | null;
  fromSubmission: boolean;
};

/** Upcoming Pending, Draft and Published events, the ground for twins, series and weekend facts. */
export type ListContextEvent = {
  id: string;
  title: string;
  status: string;
  startDate: Date;
  endDate: Date;
  scheduleDays: { date: string }[];
  venueId: string;
  marketId: string | null;
};

export type EventsListInput = {
  now: Date;
  /** What buildEventsListWhere returned. */
  events: ListSourceEvent[];
  context: ListContextEvent[];
  /** Every place; the active ones form the duplicate groups twins are found across. */
  venues: (VenueLike & { id: string; deletedAt: Date | null })[];
  /** Creation times of every event, for telling imports apart. */
  importRows: { id: string; createdAt: Date }[];
  /** Pair keys the owner marked as different events. */
  notSameEvent: string[];
  /** Pairs of places the owner marked as different or as the same place. */
  placeMemos?: DuplicateMemos;
  /** The weekend rail's weeks: a weekend it covers takes its waiting and live counts from it, and Later starts after its last Saturday. */
  rail: RailCounts[];
  /** Replaces findSeries, for tests. */
  series?: Series[];
};

export type ListMark = "PUBLISHED" | "PENDING" | "DRAFT" | "CANCELLED" | "REJECTED" | "ARCHIVED";

export type EventListRow = {
  id: string;
  title: string;
  slug: string;
  mark: ListMark;
  archived: boolean;
  /** Pending or Draft and not archived. */
  waiting: boolean;
  /** "Kootenai County Fairgrounds, Coeur d'Alene". */
  placeLine: string;
  marketName: string | null;
  /** Short words, most important first; rows show two. */
  flags: string[];
  needs: EventsNeed[];
  area: Area;
  source: string;
  sourceLabel: string;
  twin: { key: string; maybe: boolean } | null;
  series: { key: string; name: string; index: number; total: number; noMarket: boolean } | null;
  tradeShow: boolean;
  /** Who a publish or rejection tells. */
  tells: string | null;
  /** First date in scope, Pacific. */
  firstDate: string;
  startIso: string;
  /** "Sat Nov 7, 11 am". */
  startLabel: string;
  updatedIso: string;
  /** "Nov 3, 2026 at 9:41 am". */
  updatedLabel: string;
};

/** One row's place in a weekend: the day the leaf shows and that day's hours. */
export type GroupEntry = {
  id: string;
  day: string;
  /** Opening time that day as "HH:MM", empty when all day or unknown; for ordering. */
  at: string;
  /** "11 am to 4 pm", "All day", "From 6 pm", or empty when the hours are unknown. */
  time: string;
  /** Further days of the event in the same week. */
  extraDays: number;
};

export type WeekendGroup = {
  /** The Saturday. */
  key: string;
  /** "Weekend of Nov 28, Small Business Saturday". */
  heading: string;
  /** "21 waiting, 1 live". */
  fact: string;
  items: GroupItem[];
};

export type EventsListResult = {
  today: string;
  /** Every listed event once, in table order. */
  rows: EventListRow[];
  groups: WeekendGroup[];
  sourceOptions: { value: string; label: string }[];
  /** "Weekend of Nov 7", or "Later, after the weekend of Dec 19". */
  weekLabel: string | null;
  /** Every date of each series a listed row belongs to, in date order, for "Tick the whole series". */
  seriesIds: Record<string, string[]>;
};

const WAITING = new Set(["PENDING", "DRAFT"]);

export type RailCounts = Pick<RailWeek, "saturday" | "live" | "pending" | "draft">;

/** The last day the rail covers: the Sunday after its last Saturday. */
export function lastRailDay(rail: readonly RailCounts[]): string {
  const saturdays = rail.flatMap((w) => (w.saturday ? [w.saturday] : [])).sort();
  return addDays(saturdays[saturdays.length - 1], 1);
}

export function sourceKey(origin: EventOrigin): string {
  if (origin.kind === "submission") return "site";
  if (origin.kind === "organizer") return "organizer";
  if (origin.kind === "hand" || !origin.cohort) return "hand";
  return importKey(origin.cohort);
}

function importKey(cohort: ImportCohort): string {
  const date = pacificDate(cohort.at);
  return cohort.label.includes(" at ") ? `import-${date}-${pacificTime(cohort.at).replace(":", "")}` : `import-${date}`;
}

const FIXED_SOURCES = [
  { value: "site", label: "Sent from the site" },
  { value: "organizer", label: "Organizer accounts" },
  { value: "hand", label: "Added by hand" },
];

function sourceOptions(cohorts: Map<string, ImportCohort>): { value: string; label: string }[] {
  const imports = new Map<string, ImportCohort>();
  for (const cohort of cohorts.values()) imports.set(cohort.key, cohort);
  const sorted = [...imports.values()].sort((a, b) => a.at.getTime() - b.at.getTime());
  return [...sorted.map((c) => ({ value: importKey(c), label: c.label })), ...FIXED_SOURCES];
}

function placeLine(venue: ListVenue | null): string {
  if (!venue) return "No place";
  return venue.city?.trim() ? `${venue.name}, ${venue.city.trim()}` : venue.name;
}

function needsOf(event: ListSourceEvent): EventsNeed[] {
  const needs: EventsNeed[] = [];
  if (!event.imageUrl?.trim() || pictureIsWebPage(event.imageUrl)) needs.push("picture");
  if (scheduleProblems(event).length > 0) needs.push("hours");
  if (event.tagCount === 0) needs.push("tags");
  if (!event.marketId) needs.push("market");
  const venue = event.venue;
  if (venue && !venue.neighborhood && stateOf(venue.city, venue.state) !== "ID") needs.push("neighborhood");
  return needs;
}

function flagsOf(
  event: ListSourceEvent,
  extra: { twin: EventListRow["twin"]; series: EventListRow["series"]; tradeShow: boolean }
): string[] {
  if (event.deletedAt) return [];
  const flags: string[] = [];
  if (extra.twin) flags.push(extra.twin.maybe ? "Maybe a twin" : "Twin");
  if (extra.tradeShow) flags.push("Maybe not a market");
  if (extra.series) {
    flags.push(extra.series.noMarket ? "Series, no market" : `Series ${extra.series.index} of ${extra.series.total}`);
  }
  for (const problem of placeProblems(event.venue)) {
    flags.push(problem.flag === "place-archived" ? "Place archived" : "Place incomplete");
  }
  for (const problem of scheduleProblems(event)) {
    flags.push(problem.flag === "multi-day-no-hours" ? "No daily hours" : "Hours look wrong");
  }
  if (!event.imageUrl?.trim()) flags.push("No picture");
  else if (pictureIsWebPage(event.imageUrl)) flags.push("Picture is a page");
  if (event.tagCount === 0) flags.push("No tags");
  return [...new Set(flags)];
}

function markOf(event: Pick<ListSourceEvent, "status" | "deletedAt">): ListMark {
  if (event.deletedAt) return "ARCHIVED";
  const status = event.status as ListMark;
  return ["PUBLISHED", "PENDING", "DRAFT", "CANCELLED", "REJECTED"].includes(status) ? status : "DRAFT";
}

function inShow(event: ListSourceEvent, show: EventsShow): boolean {
  if (show === "everything") return true;
  if (event.deletedAt) return false;
  return show === "waiting" ? WAITING.has(event.status) : event.status === "PUBLISHED";
}

function inWhen(ended: boolean, when: EventsWhen): boolean {
  if (when === "upcoming") return !ended;
  if (when === "past") return ended;
  return true;
}

function matchesQuery(event: ListSourceEvent, q: string): boolean {
  if (!q) return true;
  const needle = q.toLowerCase();
  return [event.title, event.slug, event.venue?.name, event.venue?.city, event.marketName].some(
    (text) => !!text && text.toLowerCase().includes(needle)
  );
}

/** The dates that place an event on weekends: upcoming ones while it runs, all of them once it has ended. */
function scopeDates(event: ListSourceEvent, today: string, ended: boolean): string[] {
  const dates = ended ? eventLocalDates(event) : eventLocalDates(event, { from: today });
  return dates.length > 0 ? dates : [pacificDate(event.startDate)];
}

/** The hours of one day of an event, in dense form. */
export function dayHours(
  event: Pick<ListSourceEvent, "startDate" | "endDate" | "scheduleDays">,
  day: string
): string {
  const scheduled = event.scheduleDays.find((d) => d.date === day);
  if (scheduled) {
    if (scheduled.allDay || (scheduled.startTime === "00:00" && scheduled.endTime === "23:59")) return "All day";
    return formatTimeRange(scheduled.startTime, scheduled.endTime, { dense: true });
  }
  if (event.scheduleDays.length > 0) return "";
  const startDay = pacificDate(event.startDate);
  const endDay = pacificDate(event.endDate);
  const start = pacificTime(event.startDate);
  const end = pacificTime(event.endDate);
  if (day === startDay && day === endDay) return start === "00:00" ? "" : formatTimeRange(start, end, { dense: true });
  if (day === startDay) return start === "00:00" ? "" : `From ${formatTime(start, { dense: true })}`;
  if (day === endDay && end !== "00:00") return `Until ${formatTime(end, { dense: true })}`;
  return "";
}

/** The opening time of one day as "HH:MM", or "" when it is all day or unknown. */
export function dayOpening(event: Pick<ListSourceEvent, "startDate" | "scheduleDays">, day: string): string {
  const scheduled = event.scheduleDays.find((d) => d.date === day);
  if (scheduled) return scheduled.allDay ? "" : scheduled.startTime;
  if (event.scheduleDays.length > 0 || day !== pacificDate(event.startDate)) return "";
  const start = pacificTime(event.startDate);
  return start === "00:00" ? "" : start;
}

function startLabelOf(event: ListSourceEvent, firstDate: string, now: Date): string {
  const opening = dayOpening(event, firstDate);
  return opening ? `${formatDay(firstDate, now)}, ${formatTime(opening, { dense: true })}` : formatDay(firstDate, now);
}

/** "Weekend of Nov 7", "Weekend of Nov 28, Small Business Saturday", "Weekend of Jan 9, 2027". */
export function weekendHeading(saturday: string, now: Date): string {
  const name = localDayName(saturday);
  return `Weekend of ${formatMonthDay(saturday, now)}${name ? `, ${name}` : ""}`;
}

export function weekFilterLabel(week: string | null, railEnd: string, now: Date): string | null {
  if (!week) return null;
  if (week === "later") return `Later, after the weekend of ${formatShortDate(addDays(railEnd, -1))}`;
  return weekendHeading(week, now);
}

type Tally = { waiting: Set<string>; live: Set<string>; off: Set<string> };

/** "21 waiting, 1 live", "8 waiting, nothing live", "3 live, 2 kept off the site". */
export function weekendFact(tally: { waiting: number; live: number; off: number }): string {
  const parts: string[] = [];
  if (tally.waiting > 0) parts.push(`${tally.waiting} waiting`);
  if (tally.live > 0) parts.push(`${tally.live} live`);
  else if (tally.waiting > 0) parts.push("nothing live");
  if (tally.off > 0) parts.push(`${tally.off} kept off the site`);
  return parts.join(", ");
}

/**
 * The Events list from the rows the database returned: refines Show and When, applies the
 * filters that need derived facts (area, source, needs, twins, series, maybe not a market, week),
 * and files every row under each weekend it happens on.
 */
export function buildEventsList(input: EventsListInput, filters: EventsListFilters): EventsListResult {
  const { now } = input;
  const today = pacificDate(now);
  const railEnd = lastRailDay(input.rail);

  const activeVenues = input.venues.filter((v) => !v.deletedAt);
  const placeGroups = placeGroupIndex(findDuplicateGroups(activeVenues, input.placeMemos));
  const pairs = findTwins(
    input.context.map((e) => ({ id: e.id, title: e.title, startDate: e.startDate, venueId: e.venueId })),
    placeGroups,
    input.notSameEvent
  );
  const twinOf = new Map<string, { key: string; maybe: boolean }>();
  for (const [list, maybe] of [
    [pairs.maybe, true],
    [pairs.twins, false],
  ] as const) {
    for (const group of joinPairs(list)) {
      const key = `${maybe ? "maybe-twins" : "twins"}:${[...group.ids].sort().join("|")}`;
      for (const id of group.ids) twinOf.set(id, { key, maybe });
    }
  }

  const seriesList =
    input.series ??
    findSeries(
      input.context.map((e) => ({ id: e.id, title: e.title, startDate: e.startDate, venueId: e.venueId, marketId: e.marketId })),
      placeGroups
    );
  const seriesOf = new Map<string, NonNullable<EventListRow["series"]>>();
  for (const s of seriesList) {
    s.eventIds.forEach((id, i) =>
      seriesOf.set(id, { key: s.key, name: s.name, index: i + 1, total: s.eventIds.length, noMarket: s.suggestMarket })
    );
  }

  const cohorts = importCohorts(input.importRows);

  const rows: EventListRow[] = [];
  const weeksOf = new Map<string, string[]>();
  const datesOf = new Map<string, string[]>();
  const sourceById = new Map<string, ListSourceEvent>();

  for (const event of input.events) {
    const ended = hasEnded(event, today);
    if (!inShow(event, filters.show) || !inWhen(ended, filters.when) || !matchesQuery(event, filters.q)) continue;
    const area = areaOf(event.venue?.city, event.venue?.state);
    if (filters.area && area !== filters.area) continue;
    const origin = eventOrigin(
      {
        id: event.id,
        createdAt: event.createdAt,
        fromSubmission: event.fromSubmission,
        submittedByRole: event.submittedBy?.role ?? null,
      },
      cohorts
    );
    const source = sourceKey(origin);
    if (filters.source && source !== filters.source) continue;
    const needs = needsOf(event);
    if (filters.needs.length > 0 && !filters.needs.some((n) => needs.includes(n))) continue;

    const listed = !event.deletedAt && !ended && ["PENDING", "DRAFT", "PUBLISHED"].includes(event.status);
    const twin = listed ? (twinOf.get(event.id) ?? null) : null;
    const series = listed ? (seriesOf.get(event.id) ?? null) : null;
    const tradeShow = looksLikeTradeShow(event.title);
    if (filters.only.length > 0) {
      const kinds: EventsOnly[] = [];
      if (twin) kinds.push("twins");
      if (series) kinds.push("series");
      if (tradeShow) kinds.push("trade-shows");
      if (!filters.only.some((o) => kinds.includes(o))) continue;
    }

    let dates = scopeDates(event, today, ended);
    if (filters.week === "later") dates = dates.filter((d) => d > railEnd);
    else if (filters.week) dates = dates.filter((d) => saturdayOf(d) === filters.week);
    if (dates.length === 0) continue;

    const mark = markOf(event);
    rows.push({
      id: event.id,
      title: event.title.trim(),
      slug: event.slug,
      mark,
      archived: !!event.deletedAt,
      waiting: !event.deletedAt && WAITING.has(event.status),
      placeLine: placeLine(event.venue),
      marketName: event.marketName,
      flags: flagsOf(event, { twin, series, tradeShow }),
      needs,
      area,
      source,
      sourceLabel: origin.source,
      twin,
      series,
      tradeShow,
      tells: event.submittedBy?.alertsOn ? event.submittedBy.name : null,
      firstDate: dates[0],
      startIso: event.startDate.toISOString(),
      startLabel: startLabelOf(event, dates[0], now),
      updatedIso: event.updatedAt.toISOString(),
      updatedLabel: formatTimestamp(event.updatedAt),
    });
    datesOf.set(event.id, dates);
    weeksOf.set(event.id, [...new Set(dates.map(saturdayOf))]);
    sourceById.set(event.id, event);
  }

  const tallies = new Map<string, Tally>();
  const tally = (week: string) => {
    let t = tallies.get(week);
    if (!t) {
      t = { waiting: new Set(), live: new Set(), off: new Set() };
      tallies.set(week, t);
    }
    return t;
  };
  for (const event of input.context) {
    for (const date of eventLocalDates(event, { from: today })) {
      const t = tally(saturdayOf(date));
      if (event.status === "PUBLISHED") t.live.add(event.id);
      else if (WAITING.has(event.status)) t.waiting.add(event.id);
    }
  }
  const rowById = new Map(rows.map((r) => [r.id, r]));
  for (const row of rows) {
    for (const week of weeksOf.get(row.id) ?? []) {
      const t = tally(week);
      if (row.mark === "PUBLISHED") t.live.add(row.id);
      else if (row.waiting) t.waiting.add(row.id);
      else t.off.add(row.id);
    }
  }

  const entriesByWeek = new Map<string, GroupEntry[]>();
  for (const row of rows) {
    const event = sourceById.get(row.id)!;
    const dates = datesOf.get(row.id)!;
    for (const week of weeksOf.get(row.id)!) {
      const inWeek = dates.filter((d) => saturdayOf(d) === week);
      const entry: GroupEntry = {
        id: row.id,
        day: inWeek[0],
        at: dayOpening(event, inWeek[0]),
        time: dayHours(event, inWeek[0]),
        extraDays: inWeek.length - 1,
      };
      entriesByWeek.set(week, [...(entriesByWeek.get(week) ?? []), entry]);
    }
  }

  const railWeek = new Map(input.rail.flatMap((w) => (w.saturday ? [[w.saturday, w] as const] : [])));
  const groups: WeekendGroup[] = orderWeeks([...entriesByWeek.keys()], saturdayOf(today)).map((week) => {
    const t = tallies.get(week)!;
    const onRail = railWeek.get(week);
    const counts = onRail
      ? { waiting: onRail.pending + onRail.draft, live: onRail.live, off: t.off.size }
      : { waiting: t.waiting.size, live: t.live.size, off: t.off.size };
    return {
      key: week,
      heading: weekendHeading(week, now),
      fact: weekendFact(counts),
      items: buildGroupItems(entriesByWeek.get(week)!, rowById),
    };
  });

  const seriesIds: Record<string, string[]> = {};
  for (const s of seriesList) {
    if (rows.some((r) => r.series?.key === s.key)) seriesIds[s.key] = s.eventIds;
  }

  return {
    today,
    rows: sortTableRows(rows, filters.sort, filters.dir),
    groups,
    sourceOptions: sourceOptions(cohorts),
    weekLabel: weekFilterLabel(filters.week, railEnd, now),
    seriesIds,
  };
}

/* ------------------------------------------------------------------------------------------------
 * Words for the screen
 * ---------------------------------------------------------------------------------------------- */

function orList(words: string[]): string {
  if (words.length <= 1) return words.join("");
  return `${words.slice(0, -1).join(", ")} or ${words[words.length - 1]}`;
}

const NEED_WORDS: Record<EventsNeed, string> = {
  picture: "a picture",
  hours: "daily hours",
  tags: "tags",
  market: "a market",
  neighborhood: "a neighborhood",
};

const ONLY_WORDS: Record<EventsOnly, string> = {
  twins: "listed twice",
  series: "part of a series",
  "trade-shows": "maybe not a market",
};

function sourceWords(source: string, options: { value: string; label: string }[]): string {
  if (source === "site") return "sent from the site";
  if (source === "organizer") return "from organizer accounts";
  if (source === "hand") return "added by hand";
  const label = options.find((o) => o.value === source)?.label ?? "that import";
  return `from the ${label.charAt(0).toLowerCase()}${label.slice(1)}`;
}

/**
 * The empty state names the filters that emptied the list:
 * "No waiting events in the weekend of Nov 21 match 'bridal'."
 */
export function emptyMessage(
  filters: EventsListFilters,
  context: { weekLabel: string | null; sourceOptions: { value: string; label: string }[] }
): { text: string; clear: "search" | "filters" | null } {
  if (!hasActiveFilters(filters)) return { text: "No events are waiting. Everything coming up is decided.", clear: null };
  const noun = filters.show === "waiting" ? "waiting events" : filters.show === "live" ? "live events" : "events";
  const parts: string[] = [`No ${filters.when === "past" ? "past " : ""}${noun}`];
  if (filters.week && context.weekLabel) {
    parts.push(
      filters.week === "later"
        ? context.weekLabel.replace(/^Later, /, "")
        : `in the ${context.weekLabel.charAt(0).toLowerCase()}${context.weekLabel.slice(1)}`
    );
  }
  if (filters.area) parts.push(`in ${filters.area}`);
  if (filters.source) parts.push(sourceWords(filters.source, context.sourceOptions));
  const clauses: string[] = [];
  if (filters.needs.length) clauses.push(`need ${orList(filters.needs.map((n) => NEED_WORDS[n]))}`);
  if (filters.only.length) clauses.push(`are ${orList(filters.only.map((o) => ONLY_WORDS[o]))}`);
  let text = parts.join(" ");
  if (clauses.length) text += ` that ${clauses.join(" and ")}`;
  if (filters.q) text += `${clauses.length ? " and" : ""} match '${filters.q}'`;
  return { text: `${text}.`, clear: filters.q ? "search" : "filters" };
}

/** For the live region: "21 events in 1 weekend", "104 events". */
export function resultSummary(result: Pick<EventsListResult, "rows" | "groups">, view: EventsView): string {
  const count = result.rows.length;
  const events = `${count} ${count === 1 ? "event" : "events"}`;
  if (count === 0) return "No events match.";
  if (view === "table") return `${events}.`;
  const weekends = result.groups.length;
  return `${events} in ${weekends} ${weekends === 1 ? "weekend" : "weekends"}.`;
}

/* ------------------------------------------------------------------------------------------------
 * The CSV export's filter (the data export route uses it)
 * ---------------------------------------------------------------------------------------------- */

export type AdminEventsTimeScope = "active" | "past" | "all_records";

export function resolveAdminEventsTimeScope({
  archived,
  past,
}: {
  archived: boolean;
  past: boolean;
}): AdminEventsTimeScope {
  if (archived) return "all_records";
  if (past) return "past";
  return "active";
}

export interface BuildAdminEventsWhereOptions {
  statusFilter?: EventStatus;
  timeScope: AdminEventsTimeScope;
  q: string;
  /** Pinned per request so a count and its rows see the same cutoff. */
  now: Date;
}

/**
 * active: not archived and not ended. past: not archived and ended. all_records: everything,
 * archived included.
 */
export function buildAdminEventsWhere(options: BuildAdminEventsWhereOptions): Prisma.EventWhereInput {
  const { statusFilter, timeScope, q, now } = options;

  const where: Prisma.EventWhereInput = {};

  if (statusFilter) {
    where.status = statusFilter;
  }

  if (timeScope === "active") {
    where.deletedAt = null;
    where.endDate = { gte: now };
  } else if (timeScope === "past") {
    where.deletedAt = null;
    where.endDate = { lt: now };
  }

  if (q) {
    where.OR = [
      { title: { contains: q, mode: "insensitive" } },
      { slug: { contains: q, mode: "insensitive" } },
      { venue: { name: { contains: q, mode: "insensitive" } } },
    ];
  }

  return where;
}

/** The export searches title and slug only, with the same archive rules. */
export function buildAdminEventsExportWhere(options: BuildAdminEventsWhereOptions): Prisma.EventWhereInput {
  const where = buildAdminEventsWhere(options);
  if (where.OR && options.q) {
    where.OR = [
      { title: { contains: options.q, mode: "insensitive" } },
      { slug: { contains: options.q, mode: "insensitive" } },
    ];
  }
  return where;
}
