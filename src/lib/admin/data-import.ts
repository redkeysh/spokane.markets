import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { mapScheduleDaysForSubmit, type ScheduleDayInput } from "@/lib/event-schedule-day";
import { getNeighborhoodSlugSet } from "@/lib/neighborhoods";
import { buildScheduleDayRecords, computeEventDatesFromSchedule } from "@/lib/shared/event-service";
import {
  formatDateOnlyUTC,
  formatForDateTimeLocal,
  parseDateOnlyToUTCNoon,
  parseDateTimeInTimezone,
  slugify,
} from "@/lib/utils";
import { eventScheduleDaySchema, venueSchema } from "@/lib/validations";
import { findMatchingVenue } from "@/lib/venues/resolve";
import { RESERVED_EVENT_SLUGS } from "@/lib/events/slug-rules";
import { slugRedirectTarget } from "@/lib/events/slug";

const EVENT_IMPORT_STATUSES = [
  "DRAFT",
  "PENDING",
  "PUBLISHED",
  "CANCELLED",
  "REJECTED",
] as const;

type VenueRow = {
  name: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  lat: number;
  lng: number;
  neighborhood?: string;
  parkingNotes?: string;
};

type MarketRow = {
  name: string;
  slug?: string;
  venueId?: string;
  venueSlug?: string;
  venueName?: string;
  description?: string;
  imageUrl?: string;
  websiteUrl?: string;
  facebookUrl?: string;
  instagramUrl?: string;
  baseArea?: string;
  typicalSchedule?: string;
  contactEmail?: string;
  contactPhone?: string;
};

type EventRow = {
  title: string;
  slug?: string;
  description?: string;
  /**
   * Required without scheduleDays; with them, the event's dates come from the
   * days. Formats: see parseImportDateTime.
   */
  startDate?: string;
  endDate?: string;
  /** Pacific dates and HH:mm times. Without it, days are derived from startDate and endDate. */
  scheduleDays?: { date: string; startTime?: string; endTime?: string; allDay?: boolean }[];
  venueId?: string;
  venueSlug?: string;
  marketId?: string;
  marketSlug?: string;
  imageUrl?: string;
  status?: "DRAFT" | "PENDING" | "PUBLISHED" | "REJECTED" | "CANCELLED";
  websiteUrl?: string;
  facebookUrl?: string;
  instagramUrl?: string;
  tagNames?: string[];
  featureNames?: string[];
  tagIds?: string[];
  featureIds?: string[];
};

export type ImportPayload = {
  venues?: VenueRow[];
  markets?: MarketRow[];
  events?: EventRow[];
};

export type ImportResult = {
  /** Venues created by this import that still exist when it finishes. */
  venuesCreated: number;
  /** Venues this import created and then deleted because no imported market or event uses them. */
  venuesRemoved: number;
  marketsCreated: number;
  eventsCreated: number;
  /**
   * Events imported without schedule days because their rows had none and
   * spanned more than MAX_DERIVED_SCHEDULE_DAYS. They stay off the public
   * lists until someone sets their days.
   */
  eventsNeedingSchedule: { row: number; title: string; slug: string }[];
  errors: string[];
};

/** Longest span, in Pacific calendar days, that schedule days are derived for. */
export const MAX_DERIVED_SCHEDULE_DAYS = 7;
const MAX_IMPORT_SCHEDULE_DAYS = 366;
const DAY_MS = 24 * 60 * 60 * 1000;

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const LOCAL_DATE_TIME = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})(?::\d{2}(?:\.\d+)?)?$/;
const ZONED_DATE_TIME = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})$/i;
const CLOCK_TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

function isCalendarDate(value: string): boolean {
  return DATE_ONLY.test(value) && formatDateOnlyUTC(parseDateOnlyToUTCNoon(value)) === value;
}

/**
 * An import row's startDate or endDate as an instant, or null for any other
 * format. A value with Z or an offset is that instant; a date and time without
 * one is Pacific time (seconds are dropped); a date alone is all day, 00:00 for
 * a start and 23:59 for an end, Pacific.
 */
export function parseImportDateTime(value: string, edge: "start" | "end"): Date | null {
  const v = value.trim();
  if (isCalendarDate(v)) return parseDateTimeInTimezone(v, edge === "start" ? "00:00" : "23:59");
  const local = LOCAL_DATE_TIME.exec(v);
  if (local) {
    return isCalendarDate(local[1]) && CLOCK_TIME.test(local[2]) ? parseDateTimeInTimezone(local[1], local[2]) : null;
  }
  const zoned = ZONED_DATE_TIME.exec(v);
  if (!zoned || !isCalendarDate(zoned[1]) || !CLOCK_TIME.test(zoned[2])) return null;
  const instant = new Date(v);
  return Number.isNaN(instant.getTime()) ? null : instant;
}

function previousDate(date: string): string {
  return formatDateOnlyUTC(new Date(parseDateOnlyToUTCNoon(date).getTime() - DAY_MS));
}

/**
 * One schedule day per Pacific calendar date from start to end, by the same
 * rule as the 20261103190000_backfill_event_schedule_days migration: when the
 * Pacific start time is earlier than the end time, every day gets those hours;
 * otherwise the first day runs from the start time, the last day ends at the
 * end time, and the days between are all day. An end at exactly Pacific
 * midnight is exclusive, so the last day is the date before it, ending at
 * 23:59. Days that run 00:00 to 23:59 are all day. Returns null for spans
 * longer than MAX_DERIVED_SCHEDULE_DAYS, whose recurrence cannot be inferred.
 */
export function deriveScheduleDays(startDate: Date, endDate: Date): ScheduleDayInput[] | null {
  const [firstDate, startTime] = formatForDateTimeLocal(startDate).split("T");
  let [lastDate, endTime] = formatForDateTimeLocal(endDate).split("T");
  // Decided on the end time as given: an end at midnight is a continuous run, not daily hours.
  const sameHoursDaily = startTime < endTime;
  if (endTime === "00:00" && lastDate > firstDate) {
    lastDate = previousDate(lastDate);
    endTime = "23:59";
  }
  const dates: string[] = [];
  for (let d = parseDateOnlyToUTCNoon(firstDate); formatDateOnlyUTC(d) <= lastDate; d = new Date(d.getTime() + DAY_MS)) {
    if (dates.length === MAX_DERIVED_SCHEDULE_DAYS) return null;
    dates.push(formatDateOnlyUTC(d));
  }
  return mapScheduleDaysForSubmit(
    dates.map((date) => {
      const isFirst = date === firstDate;
      const isLast = date === lastDate;
      return {
        date,
        startTime: sameHoursDaily || isFirst ? startTime : "00:00",
        endTime: sameHoursDaily || isLast ? endTime : "23:59",
        allDay: !sameHoursDaily && !isFirst && !isLast,
      };
    })
  );
}

const importScheduleDaysSchema = z.array(eventScheduleDaySchema).min(1).max(MAX_IMPORT_SCHEDULE_DAYS);

/**
 * Validates an import row's scheduleDays: real calendar dates, times from
 * 00:00 to 23:59, and timed days that do not start after they end. allDay
 * defaults to false.
 */
function parseImportScheduleDays(value: unknown): { days: ScheduleDayInput[] } | { error: string } {
  const withDefaults = Array.isArray(value)
    ? value.map((d) => (d && typeof d === "object" && !("allDay" in d) ? { ...d, allDay: false } : d))
    : value;
  const parsed = importScheduleDaysSchema.safeParse(withDefaults);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const path = issue?.path.length ? `scheduleDays.${issue.path.join(".")}` : "scheduleDays";
    return { error: `invalid ${path}: ${issue?.message ?? "invalid value"}` };
  }
  for (const [i, d] of parsed.data.entries()) {
    if (!isCalendarDate(d.date)) return { error: `invalid scheduleDays.${i}.date "${d.date}"` };
    for (const key of ["startTime", "endTime"] as const) {
      const time = d[key];
      if (time !== undefined && !CLOCK_TIME.test(time)) {
        return { error: `invalid scheduleDays.${i}.${key} "${time}": use a time from 00:00 to 23:59` };
      }
    }
    if (!d.allDay && d.startTime! > d.endTime!) {
      return { error: `scheduleDays.${i} starts at ${d.startTime}, after it ends at ${d.endTime}` };
    }
  }
  return { days: mapScheduleDaysForSubmit(parsed.data) };
}

async function findOrCreateTag(
  client: Prisma.TransactionClient,
  name: string
): Promise<string> {
  const slug = slugify(name) || "tag";
  let tag = await client.tag.findFirst({
    where: { OR: [{ name }, { slug }] },
  });
  if (!tag) {
    tag = await client.tag.create({
      data: { name, slug: slug || `tag-${Date.now()}` },
    });
  }
  return tag.id;
}

async function findOrCreateFeature(
  client: Prisma.TransactionClient,
  name: string
): Promise<string> {
  const slug = slugify(name) || "feature";
  let feature = await client.feature.findFirst({
    where: { OR: [{ name }, { slug }] },
  });
  if (!feature) {
    feature = await client.feature.create({
      data: { name, slug: slug || `feature-${Date.now()}` },
    });
  }
  return feature.id;
}

export async function importData(payload: ImportPayload): Promise<ImportResult> {
  const result: ImportResult = {
    venuesCreated: 0,
    venuesRemoved: 0,
    marketsCreated: 0,
    eventsCreated: 0,
    eventsNeedingSchedule: [],
    errors: [],
  };

  const venueIdBySlug = new Map<string, string>();
  const venueIdByName = new Map<string, string>();
  const ambiguousVenueSlugs = new Set<string>();
  const ambiguousVenueNames = new Set<string>();
  const marketIdBySlug = new Map<string, string>();
  const createdVenueNames = new Map<string, string>();
  const allowedNeighborhoods = await getNeighborhoodSlugSet();

  // Register a venue into the name/slug lookup maps, tracking any name or slug
  // that maps to more than one venue. Distinct venues can share a name (e.g. the
  // same plaza name in two cities), so an ambiguous key must not resolve to an
  // arbitrary match; the row is asked to disambiguate with an explicit venueId.
  const registerVenue = (name: string, id: string) => {
    const slug = slugify(name);
    if (slug) {
      const existing = venueIdBySlug.get(slug);
      if (existing && existing !== id) ambiguousVenueSlugs.add(slug);
      else venueIdBySlug.set(slug, id);
    }
    const existingName = venueIdByName.get(name);
    if (existingName && existingName !== id) ambiguousVenueNames.add(name);
    else venueIdByName.set(name, id);
  };

  const resolveVenue = (opts: {
    venueSlug?: string;
    venueName?: string;
  }): { id: string } | { error: "not_found" | "ambiguous" } => {
    const { venueSlug, venueName } = opts;
    if (venueSlug) {
      if (ambiguousVenueSlugs.has(venueSlug)) return { error: "ambiguous" };
      const id = venueIdBySlug.get(venueSlug);
      if (id) return { id };
    }
    if (venueName) {
      if (ambiguousVenueNames.has(venueName)) return { error: "ambiguous" };
      const byName = venueIdByName.get(venueName);
      if (byName) return { id: byName };
      const slug = slugify(venueName);
      if (ambiguousVenueSlugs.has(slug)) return { error: "ambiguous" };
      const bySlug = venueIdBySlug.get(slug);
      if (bySlug) return { id: bySlug };
    }
    return { error: "not_found" };
  };

  const normalizeNeighborhood = (
    value: string | undefined,
    field: "neighborhood" | "baseArea",
    rowLabel: string
  ): string | null => {
    const trimmed = value?.trim();
    if (!trimmed) return null;
    if (!allowedNeighborhoods.has(trimmed)) {
      throw new Error(
        `${rowLabel}: invalid ${field} slug "${trimmed}". Create it in Admin → Neighborhoods first.`
      );
    }
    return trimmed;
  };

  // Pre-load existing venues and markets for resolution
  const [existingVenues, existingMarkets] = await Promise.all([
    db.venue.findMany({
      where: { deletedAt: null },
      select: { id: true, name: true },
    }),
    db.market.findMany({
      where: { deletedAt: null },
      select: { id: true, slug: true },
    }),
  ]);
  for (const v of existingVenues) {
    registerVenue(v.name, v.id);
  }
  for (const m of existingMarkets) {
    marketIdBySlug.set(m.slug, m.id);
  }

  // 1. Import venues
  if (payload.venues?.length) {
    for (let i = 0; i < payload.venues.length; i++) {
      try {
        const row = payload.venues[i];
        const parsed = venueSchema.safeParse(row);
        if (!parsed.success) {
          result.errors.push(`Venue ${i + 1}: ${parsed.error.message}`);
          continue;
        }
        const neighborhood = normalizeNeighborhood(
          parsed.data.neighborhood,
          "neighborhood",
          `Venue ${i + 1}`
        );
        const existing = await findMatchingVenue(parsed.data);
        if (existing) {
          if (existing.deletedAt) {
            result.errors.push(
              `Venue ${i + 1} (${parsed.data.name}): matches archived venue "${existing.name}", restore it instead of importing a copy`
            );
          } else {
            registerVenue(parsed.data.name, existing.id);
            result.errors.push(
              `Venue ${i + 1} (${parsed.data.name}): matches existing venue "${existing.name}", skipped`
            );
          }
          continue;
        }
        const venue = await db.venue.create({
          data: {
            ...parsed.data,
            neighborhood,
            parkingNotes: parsed.data.parkingNotes || null,
          },
        });
        registerVenue(venue.name, venue.id);
        createdVenueNames.set(venue.id, venue.name);
        result.venuesCreated++;
      } catch (e) {
        result.errors.push(`Venue ${i + 1}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  }

  // 2. Import markets
  if (payload.markets?.length) {
    for (let i = 0; i < payload.markets.length; i++) {
      try {
        const row = payload.markets[i];
        let venueId = row.venueId;
        if (!venueId && (row.venueSlug || row.venueName)) {
          const resolved = resolveVenue({
            venueSlug: row.venueSlug,
            venueName: row.venueName,
          });
          if ("error" in resolved) {
            result.errors.push(
              resolved.error === "ambiguous"
                ? `Market ${i + 1} (${row.name}): venue name/slug matches multiple venues, set venueId to disambiguate`
                : `Market ${i + 1} (${row.name}): venue not found`
            );
            continue;
          }
          venueId = resolved.id;
        }
        if (!venueId) {
          result.errors.push(`Market ${i + 1} (${row.name}): venue not found`);
          continue;
        }
        const slug = row.slug || slugify(row.name) || `market-${Date.now()}-${i}`;
        // Create-only: skip a slug that already exists (a pre-existing market or
        // an earlier row in this batch) instead of silently overwriting it via
        // upsert and miscounting it as a new creation.
        if (marketIdBySlug.has(slug)) {
          result.errors.push(
            `Market ${i + 1} (${row.name}): slug "${slug}" already exists, skipped`
          );
          continue;
        }
        const baseArea = normalizeNeighborhood(
          row.baseArea,
          "baseArea",
          `Market ${i + 1} (${row.name})`
        );
        const market = await db.market.create({
          data: {
            name: row.name,
            slug,
            venueId,
            description: row.description || null,
            imageUrl: row.imageUrl || null,
            websiteUrl: row.websiteUrl || null,
            facebookUrl: row.facebookUrl || null,
            instagramUrl: row.instagramUrl || null,
            baseArea,
            typicalSchedule: row.typicalSchedule || null,
            contactEmail: row.contactEmail || null,
            contactPhone: row.contactPhone || null,
          },
        });
        marketIdBySlug.set(market.slug, market.id);
        result.marketsCreated++;
      } catch (e) {
        result.errors.push(`Market ${i + 1}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  }

  // 3. Import events
  if (payload.events?.length) {
    for (let i = 0; i < payload.events.length; i++) {
      try {
        const row = payload.events[i];
        let venueId = row.venueId;
        if (!venueId && row.venueSlug) {
          const resolved = resolveVenue({ venueSlug: row.venueSlug });
          if ("error" in resolved) {
            result.errors.push(
              resolved.error === "ambiguous"
                ? `Event ${i + 1} (${row.title}): venue slug matches multiple venues, set venueId to disambiguate`
                : `Event ${i + 1} (${row.title}): venue not found`
            );
            continue;
          }
          venueId = resolved.id;
        }
        if (!venueId) {
          result.errors.push(`Event ${i + 1} (${row.title}): venue not found`);
          continue;
        }
        let marketId: string | null = row.marketId ?? null;
        if (!marketId && row.marketSlug) {
          marketId = marketIdBySlug.get(row.marketSlug) ?? null;
        }
        const slug = row.slug || slugify(row.title) || `event-${Date.now()}-${i}`;
        if (RESERVED_EVENT_SLUGS.has(slug)) {
          result.errors.push(`Event ${i + 1} (${row.title}): slug "${slug}" is reserved for a site page, skipped`);
          continue;
        }
        const renamedTo = await slugRedirectTarget(slug);
        if (renamedTo) {
          result.errors.push(
            `Event ${i + 1} (${row.title}): slug "${slug}" belongs to an event since renamed to "${renamedTo}", skipped as already listed`
          );
          continue;
        }
        let scheduleDays: ScheduleDayInput[] | null;
        let dates: { startDate: Date; endDate: Date };
        if (row.scheduleDays !== undefined) {
          const parsedDays = parseImportScheduleDays(row.scheduleDays);
          if ("error" in parsedDays) {
            result.errors.push(`Event ${i + 1} (${row.title}): ${parsedDays.error}`);
            continue;
          }
          scheduleDays = parsedDays.days;
          dates = computeEventDatesFromSchedule("", "", scheduleDays);
        } else {
          if (!row.startDate || !row.endDate) {
            result.errors.push(
              `Event ${i + 1} (${row.title}): startDate and endDate are required without scheduleDays`
            );
            continue;
          }
          const rowStart = parseImportDateTime(row.startDate, "start");
          const rowEnd = parseImportDateTime(row.endDate, "end");
          if (!rowStart || !rowEnd) {
            const [field, value] = rowStart ? ["endDate", row.endDate] : ["startDate", row.startDate];
            result.errors.push(
              `Event ${i + 1} (${row.title}): invalid ${field} "${value}": use YYYY-MM-DD, YYYY-MM-DDTHH:mm in Pacific time, or an ISO time with Z or an offset`
            );
            continue;
          }
          if (rowEnd.getTime() < rowStart.getTime()) {
            result.errors.push(
              `Event ${i + 1} (${row.title}): end date is before start date`
            );
            continue;
          }
          scheduleDays = deriveScheduleDays(rowStart, rowEnd);
          dates = scheduleDays
            ? computeEventDatesFromSchedule("", "", scheduleDays)
            : { startDate: rowStart, endDate: rowEnd };
        }
        const { startDate, endDate } = dates;
        if (
          row.status &&
          !(EVENT_IMPORT_STATUSES as readonly string[]).includes(row.status)
        ) {
          result.errors.push(
            `Event ${i + 1} (${row.title}): invalid status "${row.status}"`
          );
          continue;
        }
        // Create tags/features, the event, and its schedule days in one
        // transaction so a failed event insert (e.g. a duplicate slug) rolls
        // back any tags/features created for it instead of leaving them orphaned.
        await db.$transaction(async (tx) => {
          const tagIds: string[] = [...(row.tagIds ?? [])];
          for (const name of row.tagNames ?? []) {
            tagIds.push(await findOrCreateTag(tx, name));
          }
          const featureIds: string[] = [...(row.featureIds ?? [])];
          for (const name of row.featureNames ?? []) {
            featureIds.push(await findOrCreateFeature(tx, name));
          }
          const created = await tx.event.create({
            data: {
              title: row.title,
              slug,
              description: row.description || null,
              startDate,
              endDate,
              venueId,
              marketId,
              imageUrl: row.imageUrl || null,
              status: row.status ?? "DRAFT",
              websiteUrl: row.websiteUrl || null,
              facebookUrl: row.facebookUrl || null,
              instagramUrl: row.instagramUrl || null,
              tags: tagIds.length ? { connect: tagIds.map((id) => ({ id })) } : undefined,
              features: featureIds.length ? { connect: featureIds.map((id) => ({ id })) } : undefined,
            },
          });
          if (scheduleDays?.length) {
            await tx.eventScheduleDay.createMany({
              data: buildScheduleDayRecords(created.id, scheduleDays),
            });
          }
        });
        result.eventsCreated++;
        if (!scheduleDays) {
          result.eventsNeedingSchedule.push({ row: i + 1, title: row.title, slug });
          result.errors.push(
            `Event ${i + 1} (${row.title}): spans more than ${MAX_DERIVED_SCHEDULE_DAYS} days, imported without schedule days; set its days in the dashboard`
          );
        }
      } catch (e) {
        result.errors.push(`Event ${i + 1}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  }

  // 4. Remove venues created above that no imported market or event uses, which
  // happens when their rows were skipped or failed. Only when the payload has
  // market or event rows: a venues-only import keeps every venue it created.
  if (createdVenueNames.size > 0 && (payload.markets?.length || payload.events?.length)) {
    for (const [id, name] of createdVenueNames) {
      try {
        // The relation filters turn the delete into a no-op once anything references the venue.
        const { count } = await db.venue.deleteMany({
          where: { id, events: { none: {} }, markets: { none: {} } },
        });
        if (count > 0) {
          result.venuesCreated--;
          result.venuesRemoved++;
          result.errors.push(
            `Venue "${name}": removed because none of its markets or events were imported`
          );
        }
      } catch (e) {
        result.errors.push(
          `Venue "${name}": could not remove the unused venue: ${e instanceof Error ? e.message : String(e)}`
        );
      }
    }
  }

  return result;
}

/** Parse CSV text into venue rows. Expects header row. */
export function parseVenuesCsv(csvText: string): VenueRow[] {
  const lines = csvText.trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map((h) => h.trim().toLowerCase());
  const rows: VenueRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const values = parseCsvLine(lines[i]);
    const row: Record<string, string> = {};
    headers.forEach((h, j) => {
      row[h] = values[j] ?? "";
    });
    const lat = parseFloat(row.lat ?? row["lat"]);
    const lng = parseFloat(row.lng ?? row["lng"]);
    if (isNaN(lat) || isNaN(lng)) continue;
    rows.push({
      name: (row.name ?? "").trim(),
      address: (row.address ?? "").trim(),
      city: (row.city ?? "").trim(),
      state: (row.state ?? "").trim(),
      zip: (row.zip ?? "").trim(),
      lat,
      lng,
      neighborhood: (row.neighborhood ?? "").trim() || undefined,
      parkingNotes: (row.parkingnotes ?? row.parking_notes ?? "").trim() || undefined,
    });
  }
  return rows.filter((r) => r.name && r.address && r.city && r.state && r.zip);
}

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (inQuotes && line[i + 1] === '"') {
        // RFC 4180 escaped quote ("") inside a quoted field -> literal quote.
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if ((c === "," || c === "\n") && !inQuotes) {
      result.push(current.trim());
      current = "";
    } else {
      current += c;
    }
  }
  result.push(current.trim());
  return result;
}
