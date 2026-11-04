import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { eventEndDate, eventLocalDates } from "@/lib/events/readiness";
import { addDays, dateColumnToIso, formatDay, formatDayRange, pacificDate, saturdayOf, startOfPacificDay } from "./format";
import { localDayName } from "./local-days";
import { buildWeekendRail, loadRailRows, RAIL_WEEKS, type RailWeek } from "./weekends";

/**
 * Jump's search over events, markets, places, vendors and people, plus the
 * weekend a typed date falls in. Every text field is matched with a
 * case-insensitive contains; each word of the query has to match one field.
 */

export const GROUP_LIMIT = 5;
export const MIN_QUERY_LENGTH = 2;
export const MAX_QUERY_LENGTH = 100;
const MAX_TERMS = 6;
/** Name matches read per group before ranking prefix matches first. */
const RANK_POOL = 50;
/** A typed date without a year is read as the next one, or one up to this many days ago. */
const RECENT_DAYS = 60;

/** The subset of the admin status marks Jump shows. */
export type JumpStatus =
  | "PUBLISHED"
  | "PENDING"
  | "DRAFT"
  | "CANCELLED"
  | "REJECTED"
  | "ARCHIVED"
  | "VERIFICATION_PENDING";

export type JumpHit = {
  id: string;
  href: string;
  title: string;
  /** One line under the title: dates and place, an address, an email. */
  meta: string | null;
  /** A status mark on the right. */
  status: JumpStatus | null;
  /** A plain word on the right when there is no status mark, such as a person's role. */
  note: string | null;
};

export type JumpGroupKey = "events" | "markets" | "places" | "vendors" | "people";

export type JumpGroup = {
  key: JumpGroupKey;
  heading: string;
  hits: JumpHit[];
  /** The list page searched for the query, when more than GROUP_LIMIT match. */
  moreHref: string | null;
};

export type JumpWeekend = {
  /** "2026-12-12" */
  saturday: string;
  /** "Weekend of Sat Dec 12" */
  title: string;
  meta: string | null;
  /** The week counted the way the rail counts it; stalls are left out. */
  week: RailWeek;
  /** One of the weeks on the rail, so To do has a lane for it. */
  onRail: boolean;
};

export type JumpResults = {
  /** The query as searched, after trimming. */
  query: string;
  weekend: JumpWeekend | null;
  /** Groups with at least one hit, in the order Jump shows them. */
  groups: JumpGroup[];
};

/** Collapses spaces and caps the length. */
export function normalizeQuery(q: string): string {
  return q.replace(/\s+/g, " ").trim().slice(0, MAX_QUERY_LENGTH);
}

/** The words of a query, without surrounding quotes or commas, each once. */
export function searchTerms(q: string): string[] {
  const seen = new Set<string>();
  const terms: string[] = [];
  for (const raw of normalizeQuery(q).split(" ")) {
    const term = raw.replace(/^["“”,;:]+|["“”,;:]+$/g, "");
    const key = term.toLowerCase();
    if (!term || seen.has(key)) continue;
    seen.add(key);
    terms.push(term);
    if (terms.length === MAX_TERMS) break;
  }
  return terms;
}

/** A term with straight and curly apostrophes, so "farmers'" finds "Farmers’ Market". */
function termVariants(term: string): string[] {
  return [...new Set([term, term.replace(/'/g, "’"), term.replace(/’/g, "'")])];
}

type Contains = { contains: string; mode: "insensitive" };

/**
 * Every term has to match at least one of the fields. `field` turns a contains
 * filter into a where clause for one field.
 */
export function everyTermMatches<W>(terms: string[], fields: ((match: Contains) => W)[]): { AND: { OR: W[] }[] } {
  return {
    AND: terms.map((term) => ({
      OR: termVariants(term).flatMap((variant) =>
        fields.map((field) => field({ contains: variant, mode: "insensitive" }))
      ),
    })),
  };
}

const MONTHS = [
  "january",
  "february",
  "march",
  "april",
  "may",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december",
];
const WEEKDAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];

/** "dec", "Dec.", "sept" and "december" are month 12, 12, 9 and 12; three letters at least. */
function monthNumber(word: string): number | null {
  const w = word.toLowerCase().replace(/\.$/, "");
  if (w.length < 3) return null;
  const index = MONTHS.findIndex((m) => m.startsWith(w));
  return index === -1 ? null : index + 1;
}

function isWeekdayWord(word: string): boolean {
  const w = word.toLowerCase().replace(/\.$/, "");
  return w.length >= 3 && WEEKDAYS.some((d) => d.startsWith(w));
}

function isoDate(year: number, month: number, day: number): string | null {
  if (month < 1 || month > 12 || day < 1 || day > 31 || year < 2000 || year > 2100) return null;
  const d = new Date(Date.UTC(year, month - 1, day, 12));
  if (d.getUTCMonth() !== month - 1) return null;
  return d.toISOString().slice(0, 10);
}

/** Without a year: this year's date unless it is more than RECENT_DAYS ago, then the next valid one. */
function inferYear(month: number, day: number, today: string): string | null {
  const year = Number(today.slice(0, 4));
  const earliest = addDays(today, -RECENT_DAYS);
  for (let y = year; y <= year + 4; y++) {
    const date = isoDate(y, month, day);
    if (date && date >= earliest) return date;
  }
  return null;
}

function withYear(month: number, day: number, year: string | undefined, today: string): string | null {
  if (!year) return inferYear(month, day, today);
  const y = Number(year);
  return isoDate(year.length === 2 ? 2000 + y : y, month, day);
}

/**
 * The calendar date a query names, or null when it is not a date. Reads
 * "dec 12", "Sat Dec 12", "December 12th, 2026", "12 dec", "12/12",
 * "12/12/26", "2026-12-12", "today", "tomorrow", "this weekend" and
 * "next weekend", optionally after "weekend of".
 */
export function parseDateQuery(q: string, today: string): string | null {
  let s = normalizeQuery(q).toLowerCase();
  s = s.replace(/^(the )?(weekend|week) of /, "");

  if (s === "today") return today;
  if (s === "tomorrow") return addDays(today, 1);
  if (/^this (weekend|week|saturday|sat)$/.test(s)) return saturdayOf(today);
  if (/^next (weekend|week|saturday|sat)$/.test(s)) return addDays(saturdayOf(today), 7);

  const lead = /^([a-z]+\.?),? (.+)$/.exec(s);
  if (lead && isWeekdayWord(lead[1]) && monthNumber(lead[1]) === null) s = lead[2];

  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
  if (m) return isoDate(Number(m[1]), Number(m[2]), Number(m[3]));

  m = /^(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{4}|\d{2}))?$/.exec(s);
  if (m) return withYear(Number(m[1]), Number(m[2]), m[3], today);

  m = /^([a-z]+\.?) (\d{1,2})(?:st|nd|rd|th)?(?:,? (\d{4}))?$/.exec(s);
  if (m) {
    const month = monthNumber(m[1]);
    return month ? withYear(month, Number(m[2]), m[3], today) : null;
  }

  m = /^(\d{1,2})(?:st|nd|rd|th)? ([a-z]+\.?)(?:,? (\d{4}))?$/.exec(s);
  if (m) {
    const month = monthNumber(m[2]);
    return month ? withYear(month, Number(m[1]), m[3], today) : null;
  }

  return null;
}

/**
 * Orders rows for a type-ahead: live rows before archived ones, then whole
 * matches, names that start with the query, names that start with its first
 * word, names with a word that starts with it, and the rest; ties keep the
 * order the rows came in.
 */
export function rankByName<T>(rows: T[], query: string, names: (row: T) => string[], archived: (row: T) => boolean): T[] {
  const q = normalizeQuery(query).toLowerCase();
  const first = searchTerms(query)[0]?.toLowerCase() ?? q;
  const score = (row: T) =>
    Math.min(
      ...names(row).map((raw) => {
        const name = raw.toLowerCase();
        if (name === q) return 0;
        if (name.startsWith(q)) return 1;
        if (name.startsWith(first)) return 2;
        if (name.split(/[\s'’\-./@]+/).some((word) => word.startsWith(first))) return 3;
        return 4;
      })
    );
  return rows
    .map((row, index) => ({ row, index, archived: archived(row) ? 1 : 0, score: score(row) }))
    .sort((a, b) => a.archived - b.archived || a.score - b.score || a.index - b.index)
    .map((r) => r.row);
}

/** Parts joined with commas, leaving out blanks and repeats. */
export function joinMeta(parts: (string | null | undefined)[]): string | null {
  const seen = new Set<string>();
  const kept: string[] = [];
  for (const part of parts) {
    const text = part?.trim();
    if (!text || seen.has(text.toLowerCase())) continue;
    seen.add(text.toLowerCase());
    kept.push(text);
  }
  return kept.length > 0 ? kept.join(", ") : null;
}

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

function listHref(path: string, query: string): string {
  return `${path}?q=${encodeURIComponent(query)}`;
}

const ACTIVE_FIRST = { deletedAt: { sort: "asc", nulls: "first" } } as const;

const ROLE_WORD: Record<string, string> = { USER: "Member", VENDOR: "Vendor", ORGANIZER: "Organizer", ADMIN: "Admin" };
const ACCOUNT_WORD: Record<string, string> = { SUSPENDED: "suspended", BANNED: "banned", DEACTIVATED: "deactivated" };

function verificationStatus(row: { deletedAt: Date | null; verificationStatus: string }): JumpStatus | null {
  if (row.deletedAt) return "ARCHIVED";
  return row.verificationStatus === "PENDING" ? "VERIFICATION_PENDING" : null;
}

const EVENT_SELECT = {
  id: true,
  title: true,
  status: true,
  deletedAt: true,
  startDate: true,
  endDate: true,
  scheduleDays: { select: { date: true } },
  venue: { select: { name: true, city: true } },
} satisfies Prisma.EventSelect;

type EventRow = Prisma.EventGetPayload<{ select: typeof EVENT_SELECT }>;

function eventHit(event: EventRow, now: Date): JumpHit {
  const shaped = {
    startDate: event.startDate,
    endDate: event.endDate,
    scheduleDays: event.scheduleDays.map((d) => ({ date: dateColumnToIso(d.date) })),
  };
  const first = eventLocalDates(shaped, { maxDays: 1 })[0] ?? pacificDate(event.startDate);
  const last = eventEndDate(shaped);
  return {
    id: event.id,
    href: `/admin/events/${event.id}`,
    title: event.title,
    meta: joinMeta([formatDayRange(first, last > first ? last : first, now), event.venue.name, event.venue.city]),
    status: event.deletedAt ? "ARCHIVED" : (event.status as JumpStatus),
    note: null,
  };
}

/** Rows in list order, each once. */
function uniqueById<T extends { id: string }>(...lists: T[][]): T[] {
  const seen = new Set<string>();
  return lists.flat().filter((row) => {
    if (seen.has(row.id)) return false;
    seen.add(row.id);
    return true;
  });
}

/**
 * Events whose title holds every word come first, then events that match on the slug, place,
 * town or market. Within each, upcoming events soonest first, then past and archived ones,
 * most recent first.
 */
async function searchEvents(terms: string[], query: string, now: Date): Promise<JumpGroup> {
  const titled = everyTermMatches<Prisma.EventWhereInput>(terms, [(match) => ({ title: match })]);
  const where = everyTermMatches<Prisma.EventWhereInput>(terms, [
    (match) => ({ title: match }),
    (match) => ({ slug: match }),
    (match) => ({ venue: { name: match } }),
    (match) => ({ venue: { city: match } }),
    (match) => ({ market: { name: match } }),
  ]);
  const startOfToday = startOfPacificDay(pacificDate(now));
  const upcoming: Prisma.EventWhereInput = { deletedAt: null, endDate: { gte: startOfToday } };
  const soon = (match: Prisma.EventWhereInput) =>
    db.event.findMany({
      where: { AND: [match, upcoming] },
      orderBy: [{ startDate: "asc" }, { id: "asc" }],
      take: GROUP_LIMIT + 1,
      select: EVENT_SELECT,
    });
  const before = (match: Prisma.EventWhereInput) =>
    db.event.findMany({
      where: { AND: [match, { NOT: upcoming }] },
      orderBy: [ACTIVE_FIRST, { startDate: "desc" }, { id: "asc" }],
      take: GROUP_LIMIT + 1,
      select: EVENT_SELECT,
    });
  const tiers = await Promise.all([soon(titled), before(titled), soon(where), before(where)]);
  const rows = uniqueById(...tiers);
  return {
    key: "events",
    heading: "Events",
    hits: rows.slice(0, GROUP_LIMIT).map((row) => eventHit(row, now)),
    moreHref: rows.length > GROUP_LIMIT ? listHref("/admin/events", query) : null,
  };
}

function group(key: JumpGroupKey, heading: string, path: string, query: string, hits: JumpHit[]): JumpGroup {
  return {
    key,
    heading,
    hits: hits.slice(0, GROUP_LIMIT),
    moreHref: hits.length > GROUP_LIMIT ? listHref(path, query) : null,
  };
}

/*
 * Name-sorted groups read two sets: rows whose name holds every word (up to RANK_POOL, so a
 * name that starts with the query is not crowded out by rows that only match a town), and any
 * matching rows (enough to know whether there are more than GROUP_LIMIT).
 */

const MARKET_SELECT = {
  id: true,
  name: true,
  deletedAt: true,
  verificationStatus: true,
  venue: { select: { name: true, city: true } },
  _count: { select: { events: { where: { deletedAt: null } } } },
} satisfies Prisma.MarketSelect;

async function searchMarkets(terms: string[], query: string): Promise<JumpGroup> {
  const orderBy: Prisma.MarketOrderByWithRelationInput[] = [ACTIVE_FIRST, { name: "asc" }, { id: "asc" }];
  const [named, other] = await Promise.all([
    db.market.findMany({
      where: everyTermMatches<Prisma.MarketWhereInput>(terms, [(match) => ({ name: match })]),
      orderBy,
      take: RANK_POOL,
      select: MARKET_SELECT,
    }),
    db.market.findMany({
      where: everyTermMatches<Prisma.MarketWhereInput>(terms, [
        (match) => ({ name: match }),
        (match) => ({ slug: match }),
        (match) => ({ venue: { name: match } }),
        (match) => ({ venue: { city: match } }),
      ]),
      orderBy,
      take: GROUP_LIMIT + 1,
      select: MARKET_SELECT,
    }),
  ]);
  const ranked = rankByName(uniqueById(named, other), query, (r) => [r.name], (r) => r.deletedAt !== null);
  return group(
    "markets",
    "Markets",
    "/admin/markets",
    query,
    ranked.map((r) => ({
      id: r.id,
      href: `/admin/markets/${r.id}`,
      title: r.name,
      meta: joinMeta([r.venue.name, r.venue.city, plural(r._count.events, "date", "dates")]),
      status: verificationStatus(r),
      note: null,
    }))
  );
}

const PLACE_SELECT = {
  id: true,
  name: true,
  address: true,
  city: true,
  deletedAt: true,
  _count: { select: { events: { where: { deletedAt: null } } } },
} satisfies Prisma.VenueSelect;

async function searchPlaces(terms: string[], query: string): Promise<JumpGroup> {
  const orderBy: Prisma.VenueOrderByWithRelationInput[] = [ACTIVE_FIRST, { name: "asc" }, { id: "asc" }];
  const [named, other] = await Promise.all([
    db.venue.findMany({
      where: everyTermMatches<Prisma.VenueWhereInput>(terms, [(match) => ({ name: match })]),
      orderBy,
      take: RANK_POOL,
      select: PLACE_SELECT,
    }),
    db.venue.findMany({
      where: everyTermMatches<Prisma.VenueWhereInput>(terms, [
        (match) => ({ name: match }),
        (match) => ({ address: match }),
        (match) => ({ city: match }),
        (match) => ({ zip: match }),
      ]),
      orderBy,
      take: GROUP_LIMIT + 1,
      select: PLACE_SELECT,
    }),
  ]);
  const ranked = rankByName(uniqueById(named, other), query, (r) => [r.name], (r) => r.deletedAt !== null);
  return group(
    "places",
    "Places",
    "/admin/venues",
    query,
    ranked.map((r) => ({
      id: r.id,
      href: `/admin/venues/${r.id}`,
      title: r.name,
      meta: joinMeta([r.address, r.city, r._count.events === 0 ? "No events" : plural(r._count.events, "event", "events")]),
      status: r.deletedAt ? "ARCHIVED" : null,
      note: null,
    }))
  );
}

const VENDOR_SELECT = {
  id: true,
  businessName: true,
  deletedAt: true,
  verificationStatus: true,
  primaryCategory: true,
  serviceAreaLabel: true,
  userId: true,
} satisfies Prisma.VendorProfileSelect;

async function searchVendors(terms: string[], query: string): Promise<JumpGroup> {
  const orderBy: Prisma.VendorProfileOrderByWithRelationInput[] = [ACTIVE_FIRST, { businessName: "asc" }, { id: "asc" }];
  const [named, other] = await Promise.all([
    db.vendorProfile.findMany({
      where: everyTermMatches<Prisma.VendorProfileWhereInput>(terms, [(match) => ({ businessName: match })]),
      orderBy,
      take: RANK_POOL,
      select: VENDOR_SELECT,
    }),
    db.vendorProfile.findMany({
      where: everyTermMatches<Prisma.VendorProfileWhereInput>(terms, [
        (match) => ({ businessName: match }),
        (match) => ({ slug: match }),
      ]),
      orderBy,
      take: GROUP_LIMIT + 1,
      select: VENDOR_SELECT,
    }),
  ]);
  const ranked = rankByName(uniqueById(named, other), query, (r) => [r.businessName], (r) => r.deletedAt !== null);
  return group(
    "vendors",
    "Vendors",
    "/admin/vendors",
    query,
    ranked.map((r) => ({
      id: r.id,
      href: `/admin/vendors/${r.id}`,
      title: r.businessName,
      meta: joinMeta([r.primaryCategory, r.serviceAreaLabel, r.userId ? null : "Not claimed"]),
      status: verificationStatus(r),
      note: null,
    }))
  );
}

const PERSON_SELECT = { id: true, name: true, email: true, role: true, accountStatus: true } satisfies Prisma.UserSelect;

/** People whose name or email starts with the first word are read first, the same way. */
async function searchPeople(terms: string[], query: string): Promise<JumpGroup> {
  const where = everyTermMatches<Prisma.UserWhereInput>(terms, [(match) => ({ name: match }), (match) => ({ email: match })]);
  const orderBy: Prisma.UserOrderByWithRelationInput[] = [{ name: { sort: "asc", nulls: "last" } }, { email: "asc" }];
  const prefix = { startsWith: terms[0], mode: "insensitive" } as const;
  const [named, other] = await Promise.all([
    db.user.findMany({
      where: { AND: [where, { OR: [{ name: prefix }, { email: prefix }] }] },
      orderBy,
      take: RANK_POOL,
      select: PERSON_SELECT,
    }),
    db.user.findMany({ where, orderBy, take: GROUP_LIMIT + 1, select: PERSON_SELECT }),
  ]);
  const ranked = rankByName(uniqueById(named, other), query, (r) => [r.name ?? "", r.email], () => false);
  return group(
    "people",
    "People",
    "/admin/users",
    query,
    ranked.map((r) => {
      const name = r.name?.trim();
      return {
        id: r.id,
        href: `/admin/users/${r.id}`,
        title: name || r.email,
        meta: name ? r.email : null,
        status: null,
        note: joinMeta([ROLE_WORD[r.role] ?? null, ACCOUNT_WORD[r.accountStatus] ?? null]),
      };
    })
  );
}

/** "This weekend" and "Next weekend" relative to today; null for any other week. */
function relativeWeekName(saturday: string, today: string): string | null {
  const thisSaturday = saturdayOf(today);
  if (saturday === thisSaturday) return "This weekend";
  if (saturday === addDays(thisSaturday, 7)) return "Next weekend";
  return null;
}

/**
 * The Monday-to-Sunday week holding `date`, counted with the rail's rules:
 * events and pending submissions on its days, from today on when the week
 * has already begun.
 */
export async function findWeekend(date: string, now: Date): Promise<JumpWeekend> {
  const today = pacificDate(now);
  const saturday = saturdayOf(date);
  const monday = addDays(saturday, -5);
  const nextMonday = addDays(saturday, 2);
  const from = today > monday && today < nextMonday ? today : monday;

  const rail = buildWeekendRail(await loadRailRows(from, nextMonday), startOfPacificDay(from));
  const counted = rail.weeks[0];
  const thisSaturday = saturdayOf(today);
  const lastRailSaturday = addDays(thisSaturday, (RAIL_WEEKS - 1) * 7);

  return {
    saturday,
    title: `Weekend of ${formatDay(saturday, now)}`,
    meta: joinMeta([
      localDayName(saturday) ?? relativeWeekName(saturday, today),
      date !== saturday ? `Includes ${formatDay(date, now)}` : null,
      counted.pending > 0 ? `${counted.pending} pending` : null,
      counted.draft > 0 ? `${counted.draft} draft` : null,
    ]),
    week: { ...counted, name: localDayName(saturday), stalls: [] },
    onRail: saturday >= thisSaturday && saturday <= lastRailSaturday,
  };
}

const EMPTY_RESULTS = (query: string): JumpResults => ({ query, weekend: null, groups: [] });

/**
 * What Jump shows for a query beyond pages and commands. A query that reads
 * as a date gives that weekend only; anything else is searched in every group.
 */
export async function searchAdmin(q: string, now: Date = new Date()): Promise<JumpResults> {
  const query = normalizeQuery(q);
  if (query.length < MIN_QUERY_LENGTH) return EMPTY_RESULTS(query);

  const date = parseDateQuery(query, pacificDate(now));
  if (date) return { query, weekend: await findWeekend(date, now), groups: [] };

  const terms = searchTerms(query);
  if (terms.length === 0) return EMPTY_RESULTS(query);

  const groups = await Promise.all([
    searchEvents(terms, query, now),
    searchMarkets(terms, query),
    searchPlaces(terms, query),
    searchVendors(terms, query),
    searchPeople(terms, query),
  ]);
  return { query, weekend: null, groups: groups.filter((g) => g.hits.length > 0) };
}
