import { db } from "@/lib/db";
import { parseDateOnlyToUTCNoon, parseDateTimeInTimezone } from "@/lib/utils";
import { findOrCreateVenue } from "@/lib/venues/resolve";
import type { EventStatus, ParticipationMode, Prisma } from "@prisma/client";

const EVENT_TIMEZONE = "America/Los_Angeles";

interface ScheduleDayInput {
  date: string;
  startTime?: string;
  endTime?: string;
  allDay: boolean;
}

interface VenueInput {
  venueId?: string | null;
  venueName?: string;
  venueAddress?: string;
  venueCity?: string;
  venueState?: string;
  venueZip?: string;
  venueLat?: number;
  venueLng?: number;
}

export interface EventData {
  title: string;
  slug: string;
  description?: string | null;
  startDate: string;
  endDate: string;
  imageUrl?: string | null;
  websiteUrl?: string | null;
  facebookUrl?: string | null;
  instagramUrl?: string | null;
  marketId?: string | null;
  status?: string;

  venueId?: string | null;
  venueName?: string;
  venueAddress?: string;
  venueCity?: string;
  venueState?: string;
  venueZip?: string;
  venueLat?: number;
  venueLng?: number;

  scheduleDays?: ScheduleDayInput[];
  tagIds?: string[];
  featureIds?: string[];

  participationMode?: string | null;
  vendorCapacity?: number | null;
  publicIntentListEnabled?: boolean;
  publicIntentNamesEnabled?: boolean;
  publicRosterEnabled?: boolean;
}

export interface CreateEventOptions {
  submittedById?: string | null;
  status?: string;
  isAdminAction?: boolean;
  /** Runs inside the transaction that creates the event; throwing rolls the event back. */
  inTransaction?: (tx: Prisma.TransactionClient, event: { id: string; slug: string }) => Promise<void>;
}

/**
 * Sorts schedule days by date and merges days that share a date into one
 * spanning the earliest start and latest end (all day if any of them is).
 * Schedule day rows are unique per (eventId, date).
 */
export function mergeScheduleDays(scheduleDays: ScheduleDayInput[]): ScheduleDayInput[] {
  const byDate = new Map<string, ScheduleDayInput>();
  for (const d of scheduleDays) {
    const day: ScheduleDayInput = d.allDay
      ? { date: d.date, allDay: true }
      : { date: d.date, allDay: false, startTime: d.startTime ?? "00:00", endTime: d.endTime ?? "23:59" };
    const seen = byDate.get(d.date);
    if (!seen) {
      byDate.set(d.date, day);
    } else if (seen.allDay || day.allDay) {
      byDate.set(d.date, { date: d.date, allDay: true });
    } else {
      byDate.set(d.date, {
        date: d.date,
        allDay: false,
        startTime: day.startTime! < seen.startTime! ? day.startTime : seen.startTime,
        endTime: day.endTime! > seen.endTime! ? day.endTime : seen.endTime,
      });
    }
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Computes event start/end dates from schedule days using timezone-aware parsing.
 * Falls back to raw startDate/endDate strings if no schedule days provided.
 */
export function computeEventDatesFromSchedule(
  startDateStr: string,
  endDateStr: string,
  scheduleDays?: ScheduleDayInput[]
): { startDate: Date; endDate: Date } {
  let startDate = new Date(startDateStr);
  let endDate = new Date(endDateStr);

  if (scheduleDays?.length) {
    const sortedDays = mergeScheduleDays(scheduleDays);
    const first = sortedDays[0];
    const last = sortedDays[sortedDays.length - 1];
    const firstStart = first.allDay ? "00:00" : (first.startTime ?? "00:00");
    const lastEnd = last.allDay ? "23:59" : (last.endTime ?? "23:59");
    startDate = parseDateTimeInTimezone(first.date, firstStart, EVENT_TIMEZONE);
    endDate = parseDateTimeInTimezone(last.date, lastEnd, EVENT_TIMEZONE);
  }

  return { startDate, endDate };
}

export type ResolveVenueResult =
  | { venueId: string }
  | { venueId: null; error?: string };

/**
 * Resolves a venue: an explicit active venue ID, else the existing venue that
 * matches the address fields, else a newly created (geocoded) venue. Returns a
 * null venueId when no usable venue info is available; `error` explains an
 * address that was given but could not be used.
 */
export async function resolveVenueId(
  input: VenueInput
): Promise<ResolveVenueResult> {
  const venueId = input.venueId?.trim() || null;
  if (venueId) {
    const activeVenue = await db.venue.findFirst({
      where: { id: venueId, deletedAt: null },
      select: { id: true },
    });
    return activeVenue ? { venueId: activeVenue.id } : { venueId: null };
  }

  if (
    input.venueName?.trim() &&
    input.venueAddress?.trim() &&
    input.venueCity?.trim() &&
    input.venueState?.trim() &&
    input.venueZip?.trim()
  ) {
    const resolved = await findOrCreateVenue({
      name: input.venueName,
      address: input.venueAddress,
      city: input.venueCity,
      state: input.venueState,
      zip: input.venueZip,
      lat: input.venueLat,
      lng: input.venueLng,
    });
    return "error" in resolved
      ? { venueId: null, error: resolved.error }
      : { venueId: resolved.venueId };
  }

  return { venueId: null };
}

/**
 * Builds the data array for eventScheduleDay.createMany from schedule day
 * inputs, merged per date by mergeScheduleDays.
 */
export function buildScheduleDayRecords(
  eventId: string,
  scheduleDays: ScheduleDayInput[]
) {
  return mergeScheduleDays(scheduleDays).map((d) => ({
    eventId,
    date: parseDateOnlyToUTCNoon(d.date),
    startTime: d.allDay ? "00:00" : (d.startTime ?? "00:00"),
    endTime: d.allDay ? "23:59" : (d.endTime ?? "23:59"),
    allDay: d.allDay,
  }));
}

/**
 * Creates a new event with associated schedule days, tags, and features.
 * Handles venue resolution and timezone-aware date computation. The venue is
 * resolved first; the event, its schedule days, and `options.inTransaction`
 * then commit or roll back together.
 */
export async function createEvent(
  data: EventData,
  options: CreateEventOptions = {}
) {
  const { scheduleDays, tagIds, featureIds, ...rest } = data;

  const { startDate, endDate } = computeEventDatesFromSchedule(
    rest.startDate,
    rest.endDate,
    scheduleDays
  );

  const resolvedVenue = await resolveVenueId(rest);
  if (resolvedVenue.venueId === null) {
    return {
      event: null,
      error: resolvedVenue.error ?? "Select a venue or enter an address",
    };
  }
  const venueId = resolvedVenue.venueId;

  const status = options.status ?? rest.status ?? "DRAFT";

  const event = await db.$transaction(async (tx) => {
    const created = await tx.event.create({
      data: {
        title: rest.title,
        slug: rest.slug,
        description: rest.description || null,
        startDate,
        endDate,
        venueId,
        marketId: rest.marketId || null,
        imageUrl: rest.imageUrl || null,
        status: status as EventStatus,
        websiteUrl: rest.websiteUrl || null,
        facebookUrl: rest.facebookUrl || null,
        instagramUrl: rest.instagramUrl || null,
        submittedById: options.submittedById ?? null,
        ...(rest.participationMode !== undefined && {
          participationMode: (rest.participationMode || null) as ParticipationMode | null,
        }),
        ...(rest.vendorCapacity != null && {
          vendorCapacity: rest.vendorCapacity,
        }),
        ...(rest.publicIntentListEnabled !== undefined && {
          publicIntentListEnabled: rest.publicIntentListEnabled,
        }),
        ...(rest.publicIntentNamesEnabled !== undefined && {
          publicIntentNamesEnabled: rest.publicIntentNamesEnabled,
        }),
        ...(rest.publicRosterEnabled !== undefined && {
          publicRosterEnabled: rest.publicRosterEnabled,
        }),
        tags: tagIds?.length
          ? { connect: tagIds.map((id) => ({ id })) }
          : undefined,
        features: featureIds?.length
          ? { connect: featureIds.map((id) => ({ id })) }
          : undefined,
      },
    });

    if (scheduleDays?.length) {
      await tx.eventScheduleDay.createMany({
        data: buildScheduleDayRecords(created.id, scheduleDays),
      });
    }
    await options.inTransaction?.(tx, created);
    return created;
  });

  return { event, error: null };
}

/**
 * Updates an existing event. Wraps schedule day delete-and-recreate in a
 * transaction to prevent orphaned records. Tags/features use `set` semantics.
 */
export async function updateEvent(
  eventId: string,
  data: EventData,
  options: CreateEventOptions = {}
) {
  const { scheduleDays, tagIds, featureIds, ...rest } = data;

  const { startDate, endDate } = computeEventDatesFromSchedule(
    rest.startDate,
    rest.endDate,
    scheduleDays
  );

  const resolvedVenue = await resolveVenueId(rest);
  if (resolvedVenue.venueId === null) {
    return {
      event: null,
      error: resolvedVenue.error ?? "Select a venue or enter an address",
    };
  }
  const venueId = resolvedVenue.venueId;

  const existing = await db.event.findFirst({
    where: { id: eventId, deletedAt: null },
    select: { id: true },
  });
  if (!existing) {
    return { event: null, error: "Event not found or archived" };
  }

  const event = await db.$transaction(async (tx) => {
    const updated = await tx.event.update({
      where: { id: eventId },
      data: {
        title: rest.title,
        slug: rest.slug,
        description: rest.description || null,
        startDate,
        endDate,
        venueId,
        marketId: rest.marketId || null,
        imageUrl: rest.imageUrl || null,
        websiteUrl: rest.websiteUrl || null,
        facebookUrl: rest.facebookUrl || null,
        instagramUrl: rest.instagramUrl || null,
        ...(options.status !== undefined && { status: options.status as EventStatus }),
        ...(rest.status !== undefined &&
          options.status === undefined && { status: rest.status as EventStatus }),
        ...(rest.participationMode !== undefined && {
          participationMode: (rest.participationMode || null) as ParticipationMode | null,
        }),
        ...(rest.vendorCapacity !== undefined && {
          vendorCapacity: rest.vendorCapacity,
        }),
        ...(rest.publicIntentListEnabled !== undefined && {
          publicIntentListEnabled: rest.publicIntentListEnabled,
        }),
        ...(rest.publicIntentNamesEnabled !== undefined && {
          publicIntentNamesEnabled: rest.publicIntentNamesEnabled,
        }),
        ...(rest.publicRosterEnabled !== undefined && {
          publicRosterEnabled: rest.publicRosterEnabled,
        }),
        tags: { set: tagIds?.map((id) => ({ id })) ?? [] },
        features: { set: featureIds?.map((id) => ({ id })) ?? [] },
      },
    });

    await tx.eventScheduleDay.deleteMany({ where: { eventId } });
    if (scheduleDays?.length) {
      await tx.eventScheduleDay.createMany({
        data: buildScheduleDayRecords(eventId, scheduleDays),
      });
    }

    return updated;
  });

  return { event, error: null };
}
