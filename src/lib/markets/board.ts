/**
 * The Markets board and market page as plain data: season lanes from this month to the same
 * month next year, last season drawn faint, the next date the public page shows, and the notes and
 * next step for each market. Pure; every date is a Pacific calendar date ("YYYY-MM-DD").
 */
import { addDays, daysBetween, formatDay, formatFullDate, formatMonth, formatMonthDay, formatShortDate, pacificDate, saturdayOf } from "@/lib/admin/format";
import { eventLocalDates, slugDisagreesWithTitle, type ScheduleDayRow } from "@/lib/events/readiness";
import { coreTitle, titleOverlap, titleWords } from "@/lib/events/normalize-title";
import { TWIN_OVERLAP } from "@/lib/events/twins";
import { marketDraftFromEvents, type MarketDraft } from "./make-from-events";
import { isSeasonLong, listDates, listingDays, listingRange, planNextSeason, SEASON_SHIFT_DAYS, shiftMonth, weekdayPhrase, type PlannedDate } from "./dates";
import { nextDateText, summarizeNextDate, waitingAhead, type NextDateSummary } from "./next-date";
import { checkTypicalSchedule } from "./schedule-check";

export type BoardEvent = {
  id: string;
  title: string;
  slug: string;
  status: string;
  startDate: Date;
  endDate: Date;
  scheduleDays: ScheduleDayRow[];
  imageUrl: string | null;
  venueId: string;
  venueName: string;
  marketId: string | null;
  deletedAt?: Date | null;
};

export type BoardVenue = { id: string; name: string; address: string; city: string; deletedAt: Date | null };

export type VerificationStatus = "UNVERIFIED" | "PENDING" | "VERIFIED";

export type BoardMarket = {
  id: string;
  name: string;
  slug: string;
  verificationStatus: VerificationStatus;
  deletedAt: Date | null;
  typicalSchedule: string | null;
  venue: BoardVenue;
};

export type LaneStatus = "PUBLISHED" | "PENDING" | "DRAFT" | "CANCELLED";

const LANE_STATUSES: ReadonlySet<string> = new Set(["PUBLISHED", "PENDING", "DRAFT", "CANCELLED"]);
const LISTED: ReadonlySet<string> = new Set(["PUBLISHED", "PENDING", "DRAFT"]);
const WAITING: ReadonlySet<string> = new Set(["PENDING", "DRAFT"]);

const STATUS_WORDS: Record<string, string> = {
  PUBLISHED: "Published",
  PENDING: "Pending",
  DRAFT: "Draft",
  CANCELLED: "Cancelled",
  REJECTED: "Rejected",
};

export function statusWord(status: string): string {
  return STATUS_WORDS[status] ?? status;
}

export type SeasonWindow = {
  today: string;
  /** First day of this month. */
  start: string;
  /** First day of the same month next year; not part of the window. */
  end: string;
  days: number;
  months: { label: string; date: string; x: number }[];
  todayX: number;
};

function addMonths(isoDate: string, months: number): string {
  return `${shiftMonth(isoDate.slice(0, 7), months)}-01`;
}

/** This month to the same month next year, with each month's position from 0 to 1. */
export function seasonWindow(today: string): SeasonWindow {
  const start = `${today.slice(0, 7)}-01`;
  const end = addMonths(start, 12);
  const days = daysBetween(start, end);
  const months = Array.from({ length: 12 }, (_, i) => {
    const date = addMonths(start, i);
    return { label: formatMonth(date), date, x: daysBetween(start, date) / days };
  });
  return { today, start, end, days, months, todayX: daysBetween(start, today) / days };
}

export function laneX(window: SeasonWindow, date: string): number {
  return daysBetween(window.start, date) / window.days;
}

function inWindow(window: SeasonWindow, date: string): boolean {
  return date >= window.start && date < window.end;
}

export type LaneStall = { eventId: string; date: string; status: LaneStatus; x: number; label: string };
export type LaneBar = { eventId: string; from: string; to: string; status: LaneStatus; x0: number; x1: number; label: string };
export type LaneGhost = { date: string; x: number };
export type LaneGhostBar = { from: string; to: string; x0: number; x1: number };

export type Lane = {
  stalls: LaneStall[];
  bars: LaneBar[];
  /** Last season moved 52 weeks, only in months with no date of their own yet. */
  ghosts: LaneGhost[];
  ghostBars: LaneGhostBar[];
  /** "last season Wed May 20 to Sep 16", or null. */
  lastSeason: string | null;
  /** Dates after the window. */
  later: number;
};

const firstAndLast = listingRange;

/** The days still to come of some listings, a season-long one counted week by week. */
export function aheadDays(events: readonly BoardEvent[], today: string): string[] {
  return [...new Set(events.flatMap((e) => listingDays(e).map((d) => d.date)).filter((d) => d >= today))].sort();
}

function endOf(event: BoardEvent): string {
  return listingRange(event)[1];
}

function clipBar(window: SeasonWindow, from: string, to: string) {
  const a = from < window.start ? window.start : from;
  const b = to >= window.end ? addDays(window.end, -1) : to;
  return a <= b ? { x0: laneX(window, a), x1: laneX(window, addDays(b, 1)) } : null;
}

/** "last season Wed May 20 to Sep 16" or "last season Sat Sep 26". */
function lastSeasonPhrase(from: string, to: string, now: Date): string {
  if (from === to) return `last season ${formatDay(from, now)}`;
  return `last season ${formatDay(from, now)} to ${formatMonthDay(to, now)}`;
}

/**
 * One lane: a stall per listing at its first date (a bar for a listing that runs all season),
 * dates after the window counted, and last season's dates as faint ghosts where this season has
 * no date in that month yet.
 */
export function buildLane(events: readonly BoardEvent[], window: SeasonWindow, now: Date): Lane {
  const stalls: LaneStall[] = [];
  const bars: LaneBar[] = [];
  let later = 0;
  const busyMonths = new Set<string>();

  for (const event of events) {
    if (!LANE_STATUSES.has(event.status) || event.deletedAt) continue;
    const status = event.status as LaneStatus;
    const [first, last] = firstAndLast(event);
    if (first >= window.end) {
      later += 1;
      continue;
    }
    if (isSeasonLong(event)) {
      const clipped = clipBar(window, first, last);
      if (!clipped) continue;
      bars.push({ eventId: event.id, from: first, to: last, status, ...clipped, label: `${formatDay(first, now)} to ${formatMonthDay(last, now)}, ${statusWord(status)}` });
      for (let m = first.slice(0, 7); m <= last.slice(0, 7); m = shiftMonth(m, 1)) busyMonths.add(m);
      continue;
    }
    if (!inWindow(window, first)) continue;
    stalls.push({ eventId: event.id, date: first, status, x: laneX(window, first), label: `${formatDay(first, now)}, ${statusWord(status)}` });
    busyMonths.add(first.slice(0, 7));
  }

  const since = addDays(window.today, -SEASON_SHIFT_DAYS);
  const ghosts = new Map<string, LaneGhost>();
  const ghostBars: LaneGhostBar[] = [];
  let lastFrom: string | null = null;
  let lastTo: string | null = null;
  for (const event of events) {
    if (!LISTED.has(event.status) || event.deletedAt) continue;
    const [first, last] = firstAndLast(event);
    if (last >= window.today || last < since) continue;
    if (!lastFrom || first < lastFrom) lastFrom = first;
    if (!lastTo || last > lastTo) lastTo = last;
    if (isSeasonLong(event)) {
      const from = addDays(first < since ? since : first, SEASON_SHIFT_DAYS);
      const to = addDays(last, SEASON_SHIFT_DAYS);
      const clipped = clipBar(window, from, to);
      if (clipped && !busyMonths.has(from.slice(0, 7))) ghostBars.push({ from, to, ...clipped });
      continue;
    }
    for (const day of listingDays(event)) {
      if (day.date >= window.today || day.date < since) continue;
      const date = addDays(day.date, SEASON_SHIFT_DAYS);
      if (!inWindow(window, date) || busyMonths.has(date.slice(0, 7))) continue;
      ghosts.set(date, { date, x: laneX(window, date) });
    }
  }

  stalls.sort((a, b) => a.date.localeCompare(b.date) || a.eventId.localeCompare(b.eventId));
  return {
    stalls,
    bars,
    ghosts: [...ghosts.values()].sort((a, b) => a.date.localeCompare(b.date)),
    ghostBars,
    lastSeason: lastFrom && lastTo ? lastSeasonPhrase(lastFrom, lastTo, now) : null,
    later,
  };
}

/** Not archived, not rejected or cancelled, and not over yet. */
export function isAhead(event: BoardEvent, today: string): boolean {
  return LISTED.has(event.status) && !event.deletedAt && endOf(event) >= today;
}

export type MarketNote = {
  kind: "home-archived" | "slug-mismatch" | "look-alikes" | "other-place" | "same-place-twice" | "schedule";
  text: string;
  /** Where the owner fixes it, when that is another page. */
  href?: string;
  eventIds?: string[];
};

export type RowAction =
  | { kind: "fix-place"; label: string; href: string }
  | { kind: "review"; label: string; href: string }
  | { kind: "link"; label: string; eventIds: string[] }
  | { kind: "publish"; label: string; eventIds: string[] }
  | { kind: "repeat"; label: string }
  | { kind: "add"; label: string; href: string };

export type MarketRow = {
  market: BoardMarket;
  events: BoardEvent[];
  lane: Lane;
  next: NextDateSummary<BoardEvent>;
  nextText: string;
  /** Pending and Draft dates that would show as "Next date" once published. */
  waiting: BoardEvent[];
  /** Listed dates not over yet, by date. */
  ahead: BoardEvent[];
  plan: PlannedDate[];
  lookAlikes: BoardEvent[];
  notes: MarketNote[];
  actions: RowAction[];
  /** 0 dates waiting, 1 live dates only, 2 last season only, 3 no dates. */
  tier: 0 | 1 | 2 | 3;
  sortDate: string | null;
};

export type PlaceGroups = ReadonlyMap<string, string>;

function groupOf(groups: PlaceGroups, venueId: string): string {
  return groups.get(venueId) ?? venueId;
}

function listTitles(events: readonly BoardEvent[]): string {
  const titles = [...new Set(events.map((e) => e.title))];
  if (titles.length <= 2) return titles.join(" and ");
  return `${titles.slice(0, 2).join(", ")} and ${titles.length - 2} more`;
}

function joinDates(dates: readonly string[], now: Date): string {
  const words = [...new Set(dates)].map((d) => formatMonthDay(d, now));
  if (words.length <= 2) return words.join(" and ");
  return `${words.slice(0, -1).join(", ")} and ${words[words.length - 1]}`;
}

const SEASON_WORDS: Record<string, string> = {
  spring: "spring",
  summer: "summer",
  fall: "fall",
  autumn: "fall",
  winter: "winter",
  holiday: "winter",
  christmas: "winter",
};

function seasonsNamed(title: string): Set<string> {
  return new Set([...titleWords(title)].map((w) => SEASON_WORDS[w]).filter(Boolean));
}

/** "Spring Craft Fair" and "Fall Craft Fair" name different seasons; a title without a season names none. */
function seasonsConflict(a: string, b: string): boolean {
  const sa = seasonsNamed(a);
  const sb = seasonsNamed(b);
  return sa.size > 0 && sb.size > 0 && ![...sa].some((s) => sb.has(s));
}

/**
 * Unlinked listings that look like a market's own: still ahead, at the market's home place or a
 * place its dates use (or one listed twice with them), with a title close to the market's name or
 * one of its dates' titles, and not naming another season.
 */
export function findLookAlikes(market: BoardMarket, own: readonly BoardEvent[], unlinked: readonly BoardEvent[], groups: PlaceGroups, today: string): BoardEvent[] {
  const places = new Set([groupOf(groups, market.venue.id), ...own.map((e) => groupOf(groups, e.venueId))]);
  const names = [market.name, ...new Set(own.map((e) => e.title))];
  return unlinked
    .filter((e) => isAhead(e, today) && places.has(groupOf(groups, e.venueId)))
    .filter((e) => names.some((name) => titleOverlap(e.title, name) >= TWIN_OVERLAP && !seasonsConflict(e.title, name)))
    .sort((a, b) => a.startDate.getTime() - b.startDate.getTime());
}

/**
 * A date titled as another event while its web address says otherwise ("Family Fall Festival 2027"
 * at rathdrum-craft-and-farmers-market-2027-10-16). A title that shares a word with the market's
 * name is not one, so dates whose address is just the market's name pass.
 */
export function addressNamesAnotherEvent(event: Pick<BoardEvent, "title" | "slug">, marketName: string): boolean {
  return slugDisagreesWithTitle(event.title, event.slug) && titleOverlap(event.title, marketName) === 0;
}

/** The listing with its days filled in, so a schedule read from it names weekdays, not every day of its span. */
export function withListingDays<T extends BoardEvent>(event: T): T {
  return { ...event, scheduleDays: listingDays(event) };
}

/** Everything the board and the market page say about one market, besides its lane. */
export function marketNotes(market: BoardMarket, events: readonly BoardEvent[], lookAlikes: readonly BoardEvent[], groups: PlaceGroups, now: Date): MarketNote[] {
  const today = pacificDate(now);
  const notes: MarketNote[] = [];
  const ahead = events.filter((e) => isAhead(e, today)).sort((a, b) => a.startDate.getTime() - b.startDate.getTime());

  if (market.venue.deletedAt) {
    notes.push({ kind: "home-archived", text: "Its home place is archived.", href: `/admin/venues/${market.venue.id}` });
  }

  const mismatched = ahead.filter((e) => addressNamesAnotherEvent(e, market.name));
  if (mismatched.length > 0) {
    const first = mismatched[0];
    const more = mismatched.length > 1 ? ` ${mismatched.length - 1} more ${mismatched.length === 2 ? "date does" : "dates do"} the same.` : "";
    notes.push({
      kind: "slug-mismatch",
      text: `${formatMonthDay(firstAndLast(first)[0], now)} is titled "${first.title}"; its web address says otherwise.${more}`,
      eventIds: mismatched.map((e) => e.id),
    });
  }

  if (lookAlikes.length > 0) {
    const n = lookAlikes.length;
    notes.push({
      kind: "look-alikes",
      text: `${n} more ${n === 1 ? "looks" : "look"} like theirs: ${listTitles(lookAlikes)}, ${joinDates(lookAlikes.map((e) => firstAndLast(e)[0]), now)}.`,
      eventIds: lookAlikes.map((e) => e.id),
    });
  }

  const home = groupOf(groups, market.venue.id);
  const elsewhere = ahead.filter((e) => groupOf(groups, e.venueId) !== home);
  if (elsewhere.length === 1) {
    const e = elsewhere[0];
    notes.push({ kind: "other-place", text: `Its ${formatMonthDay(firstAndLast(e)[0], now)} date is at ${e.venueName}, not the market's home place.` });
  } else if (elsewhere.length > 1) {
    notes.push({ kind: "other-place", text: `${elsewhere.length} of its dates are at other places, such as ${elsewhere[0].venueName}.` });
  }

  const twice = ahead.filter((e) => e.venueId !== market.venue.id && groupOf(groups, e.venueId) === home);
  if (twice.length > 0) {
    const venueName = twice[0].venueName;
    const count = twice.length === 1 ? "One date uses" : `${twice.length} dates use`;
    notes.push({
      kind: "same-place-twice",
      text: `${count} ${venueName}, the same place as ${market.venue.name} listed twice.`,
      href: "/admin/venues?view=duplicates",
    });
  }

  const check = checkTypicalSchedule(market.typicalSchedule, aheadDays(ahead, today));
  if (check) notes.push({ kind: "schedule", text: check.message });

  return notes;
}

export function marketHref(id: string): string {
  return `/admin/markets/${id}`;
}

/** The next step for a market, first the inline one, then the rest for its menu. */
export function rowActions(row: Pick<MarketRow, "market" | "waiting" | "lookAlikes" | "plan" | "notes" | "ahead">): RowAction[] {
  const actions: RowAction[] = [];
  const href = marketHref(row.market.id);
  if (row.market.venue.deletedAt) actions.push({ kind: "fix-place", label: "Fix place", href: `/admin/venues/${row.market.venue.id}` });
  const mismatch = row.notes.find((n) => n.kind === "slug-mismatch");
  if (mismatch && row.waiting.length > 0) actions.push({ kind: "review", label: `Review ${row.waiting.length}`, href });
  if (row.lookAlikes.length > 0) {
    actions.push({ kind: "link", label: `Link ${row.lookAlikes.length} ${row.lookAlikes.length === 1 ? "date" : "dates"}`, eventIds: row.lookAlikes.map((e) => e.id) });
  }
  if (row.waiting.length > 0 && !row.market.venue.deletedAt) {
    actions.push({ kind: "publish", label: `Publish ${row.waiting.length}`, eventIds: row.waiting.map((e) => e.id) });
  }
  if (row.plan.length > 0 && !row.market.venue.deletedAt) actions.push({ kind: "repeat", label: "Repeat last season" });
  if (row.ahead.length === 0 && row.plan.length === 0 && !row.market.venue.deletedAt) actions.push({ kind: "add", label: "Add dates", href: `${href}?add=1` });
  return actions;
}

/** Each market's row on the board, in board order. */
export function buildMarketRows(
  markets: readonly BoardMarket[],
  events: readonly BoardEvent[],
  groups: PlaceGroups,
  now: Date
): { window: SeasonWindow; rows: MarketRow[]; claimed: Set<string> } {
  const today = pacificDate(now);
  const window = seasonWindow(today);
  const byMarket = new Map<string, BoardEvent[]>();
  const unlinked: BoardEvent[] = [];
  for (const e of events) {
    if (e.deletedAt) continue;
    if (e.marketId) byMarket.set(e.marketId, [...(byMarket.get(e.marketId) ?? []), e]);
    else unlinked.push(e);
  }

  const claimed = new Set<string>();
  const rows = markets.map((market): MarketRow => {
    const own = (byMarket.get(market.id) ?? []).sort((a, b) => a.startDate.getTime() - b.startDate.getTime());
    const lookAlikes = market.deletedAt ? [] : findLookAlikes(market, own, unlinked, groups, today);
    for (const e of lookAlikes) claimed.add(e.id);
    const ahead = own.filter((e) => isAhead(e, today));
    const waiting = waitingAhead(own, now);
    const taken = own.filter((e) => LISTED.has(e.status)).flatMap((e) => eventLocalDates(e));
    const plan = planNextSeason(own, today, taken);
    const next = summarizeNextDate(own, now);
    const notes = marketNotes(market, own, lookAlikes, groups, now);
    const partial = { market, waiting, lookAlikes, plan, notes, ahead };
    const tier: MarketRow["tier"] = waiting.length > 0 ? 0 : ahead.length > 0 ? 1 : plan.length > 0 ? 2 : 3;
    const sortDate =
      tier === 0
        ? pacificDate(waiting[0].startDate)
        : tier === 1
          ? firstAndLast(ahead[0])[0]
          : tier === 2
            ? plan[0].date
            : null;
    return {
      ...partial,
      events: own,
      lane: buildLane(own, window, now),
      next,
      nextText: nextDateText(next, now),
      actions: rowActions(partial),
      tier,
      sortDate,
    };
  });

  rows.sort(
    (a, b) =>
      Number(!!a.market.deletedAt) - Number(!!b.market.deletedAt) ||
      a.tier - b.tier ||
      (a.sortDate ?? "").localeCompare(b.sortDate ?? "") ||
      a.market.name.localeCompare(b.market.name)
  );
  return { window, rows, claimed };
}

export type BoardFilter = "all" | "waiting" | "nothing-ahead" | "not-verified" | "archived";

export function rowMatches(row: MarketRow, filter: BoardFilter): boolean {
  if (filter === "archived") return !!row.market.deletedAt;
  if (row.market.deletedAt) return false;
  switch (filter) {
    case "all":
      return true;
    case "waiting":
      return row.waiting.length > 0;
    case "nothing-ahead":
      return row.ahead.length === 0;
    case "not-verified":
      return row.market.verificationStatus !== "VERIFIED";
  }
}

export function filterCounts(rows: readonly MarketRow[]): Record<BoardFilter, number> {
  const filters: BoardFilter[] = ["all", "waiting", "nothing-ahead", "not-verified", "archived"];
  return Object.fromEntries(filters.map((f) => [f, rows.filter((r) => rowMatches(r, f)).length])) as Record<BoardFilter, number>;
}

export type RepeatGroup = {
  key: string;
  name: string;
  venueId: string;
  venueName: string;
  events: BoardEvent[];
  lane: Lane;
  /** "4 weekends, Nov 27 to Dec 20, Silver Lake Mall, Pending". */
  description: string;
  /** Every date is over. */
  ended: boolean;
  /** Next season's dates when every date is over, for "Repeat for 2027". */
  plan: PlannedDate[];
  draft: MarketDraft;
};

/**
 * Listings without a market that repeat: the same core title at one place (or places listed
 * twice) on two or more dates, or one listing that runs all season, with a date this season or
 * last. Rejected, cancelled and archived listings and `exclude` (look-alikes of a market) are left out.
 */
export function findRepeatsWithoutMarket(events: readonly BoardEvent[], groups: PlaceGroups, now: Date, exclude: ReadonlySet<string> = new Set()): RepeatGroup[] {
  const today = pacificDate(now);
  const window = seasonWindow(today);
  const since = addDays(today, -SEASON_SHIFT_DAYS);
  const buckets = new Map<string, BoardEvent[]>();
  for (const e of events) {
    if (e.marketId || e.deletedAt || !LISTED.has(e.status) || exclude.has(e.id)) continue;
    if (endOf(e) < since) continue;
    const key = `${coreTitle(e.title)}@${groupOf(groups, e.venueId)}`;
    buckets.set(key, [...(buckets.get(key) ?? []), e]);
  }

  const out: RepeatGroup[] = [];
  for (const [key, list] of buckets) {
    const sorted = [...list].sort((a, b) => a.startDate.getTime() - b.startDate.getTime());
    const firstDates = new Set(sorted.map((e) => firstAndLast(e)[0]));
    const seasonLong = sorted.length === 1 && isSeasonLong(sorted[0]);
    if (firstDates.size < 2 && !seasonLong) continue;
    const ended = sorted.every((e) => endOf(e) < today);
    const draft = marketDraftFromEvents(sorted.map(withListingDays));
    const venue = sorted.find((e) => e.venueId === draft.venueId) ?? sorted[0];
    out.push({
      key: `repeat:${key}`,
      name: draft.name,
      venueId: draft.venueId,
      venueName: venue.venueName,
      events: sorted,
      lane: buildLane(sorted, window, now),
      description: describeRepeat(sorted, venue.venueName, now),
      ended,
      plan: ended ? planNextSeason(sorted, today) : [],
      draft,
    });
  }
  const stillWaiting = (g: RepeatGroup) => g.events.some((e) => WAITING.has(e.status));
  return out.sort((a, b) => {
    if (a.ended !== b.ended) return Number(a.ended) - Number(b.ended);
    if (!a.ended) return firstAhead(a.events, today).localeCompare(firstAhead(b.events, today)) || a.name.localeCompare(b.name);
    return (
      Number(stillWaiting(b)) - Number(stillWaiting(a)) ||
      firstAhead(b.events, today).localeCompare(firstAhead(a.events, today)) ||
      a.name.localeCompare(b.name)
    );
  });
}

function firstAhead(events: readonly BoardEvent[], today: string): string {
  const ahead = events.filter((e) => endOf(e) >= today).map((e) => firstAndLast(e)[0]).sort();
  return ahead[0] ?? events.map((e) => firstAndLast(e)[0]).sort().at(-1) ?? "";
}

/** "4 weekends, Nov 27 to Dec 20, Silver Lake Mall, Pending", "Saturdays Nov 7 to Nov 21 (and Oct 31, gone by), Coeur d'Alene Park", "Wednesdays, last season". */
export function describeRepeat(events: readonly BoardEvent[], venueName: string, now: Date): string {
  const today = pacificDate(now);
  const statuses = new Set(events.map((e) => e.status));
  const status = statuses.size === 1 ? `, ${statusWord([...statuses][0])}` : "";
  const ahead = events.filter((e) => endOf(e) >= today);
  const gone = events.filter((e) => endOf(e) < today);
  if (ahead.length === 0) {
    const days = events.flatMap((e) => listingDays(e).map((d) => d.date));
    return `${weekdayPhrase(days)}, last season`;
  }
  const firsts = ahead.map((e) => firstAndLast(e)[0]).sort();
  const lasts = ahead.map((e) => firstAndLast(e)[1]).sort();
  const from = formatMonthDay(firsts[0], now);
  const to = formatMonthDay(lasts[lasts.length - 1], now);
  const weekends = new Set(firsts.map(saturdayOf));
  const multiDay = ahead.some((e) => !isSeasonLong(e) && listingDays(e).length > 1);
  const goneText = gone.length ? ` (and ${joinDates(gone.map((e) => firstAndLast(e)[0]).sort(), now)}, gone by)` : "";
  if (multiDay || weekends.size < firsts.length) {
    return `${weekends.size} ${weekends.size === 1 ? "weekend" : "weekends"}, ${from} to ${to}${goneText}, ${venueName}${status}`;
  }
  return `${weekdayPhrase(firsts)} ${from} to ${to}${goneText}, ${venueName}${status}`;
}

export type SeasonGroup = {
  key: string;
  /** "Winter 2026". */
  name: string;
  /** The title most of its dates share, when they share one. */
  title: string | null;
  events: BoardEvent[];
  first: string;
  last: string;
  ended: boolean;
  /** One listing that runs all season. */
  seasonLong: boolean;
  /** "Wednesdays May 20 to Sep 16 (one listing)", for a season-long listing. */
  summary: string | null;
};

/** A gap longer than this between two dates starts a new season. */
export const SEASON_GAP_DAYS = 60;

/** Nov to Feb is winter (named by the year it starts), Mar to May spring, Jun to Aug summer, Sep and Oct fall. */
export function seasonName(date: string): string {
  const month = Number(date.slice(5, 7));
  const year = Number(date.slice(0, 4));
  if (month >= 11) return `Winter ${year}`;
  if (month <= 2) return `Winter ${year - 1}`;
  if (month <= 5) return `Spring ${year}`;
  if (month <= 8) return `Summer ${year}`;
  return `Fall ${year}`;
}

/**
 * A market's dates in seasons: runs of dates with no gap over SEASON_GAP_DAYS, named by the
 * season of their middle day. Seasons still ahead come first, earliest first; past seasons
 * follow, latest first.
 */
export function seasonsOf(events: readonly BoardEvent[], now: Date): SeasonGroup[] {
  const today = pacificDate(now);
  const sorted = [...events].sort((a, b) => a.startDate.getTime() - b.startDate.getTime() || a.title.localeCompare(b.title));
  const runs: BoardEvent[][] = [];
  let lastEnd: string | null = null;
  for (const e of sorted) {
    const [first, last] = firstAndLast(e);
    if (lastEnd === null || daysBetween(lastEnd, first) > SEASON_GAP_DAYS) {
      runs.push([e]);
      lastEnd = last;
    } else {
      runs[runs.length - 1].push(e);
      if (last > lastEnd) lastEnd = last;
    }
  }
  const groups = runs.map((run): SeasonGroup => {
    const first = run.map((e) => firstAndLast(e)[0]).sort()[0];
    const last = run.map((e) => firstAndLast(e)[1]).sort().at(-1)!;
    const middle = addDays(first, Math.floor(daysBetween(first, last) / 2));
    const counts = new Map<string, number>();
    for (const e of run) counts.set(e.title, (counts.get(e.title) ?? 0) + 1);
    const [topTitle, topCount] = [...counts].sort((a, b) => b[1] - a[1])[0];
    const seasonLong = run.length === 1 && isSeasonLong(run[0]);
    const days = seasonLong ? listingDays(run[0]).map((d) => d.date) : [];
    return {
      key: `${first}:${run[0].id}`,
      name: seasonName(middle),
      title: topCount * 2 >= run.length ? topTitle : null,
      events: run,
      first,
      last,
      ended: last < today,
      seasonLong,
      summary: seasonLong ? `${weekdayPhrase(days)} ${formatMonthDay(days[0], now)} to ${formatMonthDay(days[days.length - 1], now)} (one listing)` : null,
    };
  });
  const ahead = groups.filter((g) => !g.ended);
  const past = groups.filter((g) => g.ended).reverse();
  return [...ahead, ...past];
}

/** "Wednesdays May 19 to Sep 15, 2027": the shape of a set of new dates. */
export function describePlan(dates: readonly string[], now: Date): string {
  const sorted = [...new Set(dates)].sort();
  if (sorted.length === 0) return "";
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  if (sorted.length <= 3) return listDates(sorted, now);
  const thisYear = pacificDate(now).slice(0, 4);
  const range =
    first.slice(0, 4) === last.slice(0, 4)
      ? `${formatShortDate(first)} to ${last.startsWith(thisYear) ? formatShortDate(last) : formatFullDate(last)}`
      : `${formatMonthDay(first, now)} to ${formatMonthDay(last, now)}`;
  return `${weekdayPhrase(sorted)} ${range}`;
}

export type WaitingDate = { id: string; title: string; day: string };

/** A market row as the board draws it: plain strings and numbers only. */
export type BoardRowView = {
  id: string;
  name: string;
  href: string;
  /** The public market page, while the market is not archived. */
  publicHref: string | null;
  archived: boolean;
  verification: VerificationStatus;
  /** "Verified. Kendall Yards". */
  meta: string;
  note: string | null;
  lane: Lane;
  nextText: string;
  nextTone: "live" | "waiting" | "none";
  actions: RowAction[];
  waiting: WaitingDate[];
  plan: PlannedDate[];
  planSummary: string;
  planX: { date: string; x: number }[];
  /** For phones: the next three dates as date leaves. */
  nextThree: { date: string; status: LaneStatus }[];
  /** The row's facts for assistive tech, since the lane is drawn only. */
  srSummary: string;
  /** No dates and not verified: folded under "N more with no dates". */
  folded: boolean;
};

const BOARD_NOTE_ORDER: MarketNote["kind"][] = ["home-archived", "slug-mismatch", "look-alikes", "other-place", "schedule", "same-place-twice"];

const VERIFICATION_PREFIX: Record<VerificationStatus, string> = {
  VERIFIED: "Verified",
  PENDING: "Waiting for verification",
  UNVERIFIED: "",
};

export function boardRowView(row: MarketRow, window: SeasonWindow, now: Date): BoardRowView {
  const today = pacificDate(now);
  const first = [...row.notes].sort((a, b) => BOARD_NOTE_ORDER.indexOf(a.kind) - BOARD_NOTE_ORDER.indexOf(b.kind))[0];
  const note = first?.text ?? (row.events.length === 0 ? "No dates yet." : null);
  const meta = [VERIFICATION_PREFIX[row.market.verificationStatus], row.market.venue.name].filter(Boolean).join(". ");
  const nextThree = row.ahead
    .map((e) => ({ date: isSeasonLong(e) ? (aheadDays([e], today)[0] ?? "") : firstAndLast(e)[0], status: e.status as LaneStatus }))
    .filter((d) => d.date)
    .slice(0, 3);
  const aheadText = row.ahead.length === 0 ? "No dates ahead" : `${row.ahead.length} ${row.ahead.length === 1 ? "date" : "dates"} ahead`;
  const waitingText = row.waiting.length ? `, ${row.waiting.length} waiting` : "";
  const seasonText = row.lane.lastSeason ? `. ${row.lane.lastSeason[0].toUpperCase()}${row.lane.lastSeason.slice(1)}` : "";
  return {
    id: row.market.id,
    name: row.market.name,
    href: marketHref(row.market.id),
    publicHref: row.market.deletedAt ? null : `/markets/${row.market.slug}`,
    archived: !!row.market.deletedAt,
    verification: row.market.verificationStatus,
    meta,
    note,
    lane: row.lane,
    nextText: row.nextText,
    nextTone: row.next.kind === "live" ? "live" : row.next.kind === "waiting" ? "waiting" : "none",
    actions: row.market.deletedAt ? [] : row.actions,
    waiting: row.waiting.map((e) => ({ id: e.id, title: e.title, day: formatDay(pacificDate(e.startDate), now) })),
    plan: row.plan,
    planSummary: describePlan(row.plan.map((p) => p.date), now),
    planX: row.plan.filter((p) => inWindow(window, p.date)).map((p) => ({ date: p.date, x: laneX(window, p.date) })),
    nextThree,
    srSummary: `${aheadText}${waitingText}. Next date on the site: ${row.nextText}${seasonText}.`,
    folded: row.tier === 3 && row.market.verificationStatus !== "VERIFIED" && !row.market.deletedAt,
  };
}

/** A group of repeating listings without a market, as the board draws it. */
export type RepeatView = {
  key: string;
  name: string;
  venueId: string;
  venueName: string;
  description: string;
  lane: Lane;
  eventIds: string[];
  ended: boolean;
  plan: PlannedDate[];
  planSummary: string;
  /** The year next season's dates fall in, for "Repeat for 2027". */
  planYear: string | null;
  draft: MarketDraft;
  /** The Events list, searched for this name. */
  eventsHref: string;
};

export function repeatView(group: RepeatGroup, now: Date): RepeatView {
  return {
    key: group.key,
    name: group.name,
    venueId: group.venueId,
    venueName: group.venueName,
    description: group.description,
    lane: group.lane,
    eventIds: group.events.map((e) => e.id),
    ended: group.ended,
    plan: group.plan,
    planSummary: describePlan(group.plan.map((p) => p.date), now),
    planYear: group.plan[0]?.date.slice(0, 4) ?? null,
    draft: group.draft,
    eventsHref: `/admin/events?q=${encodeURIComponent(group.name)}`,
  };
}
