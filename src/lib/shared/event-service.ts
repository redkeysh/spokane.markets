import { db } from "@/lib/db";
import { parseDateOnlyToUTCNoon, parseDateTimeInTimezone } from "@/lib/utils";
import { geocodeAddress } from "@/lib/geocode";
import type { EventStatus, ParticipationMode } from "@prisma/client";

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
    const sortedDays = [...scheduleDays].sort((a, b) => a.date.localeCompare(b.date));
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
 * Resolves a venue — either uses an existing ID, creates a new venue from
 * provided address fields (geocoding server-side when the caller didn't supply
 * coordinates), or returns a null venueId when no usable venue info is
 * available. `error` distinguishes "address given but could not be geocoded"
 * from "no address at all".
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
    const providedLat =
      typeof input.venueLat === "number" && !Number.isNaN(input.venueLat)
        ? input.venueLat
        : null;
    const providedLng =
      typeof input.venueLng === "number" && !Number.isNaN(input.venueLng)
        ? input.venueLng
        : null;
    let coords: { lat: number; lng: number };
    if (providedLat !== null && providedLng !== null) {
      coords = { lat: providedLat, lng: providedLng };
    } else {
      // No coordinates supplied (e.g. an approved submission carries only an
      // address). Geocode server-side instead of fabricating a location.
      const geocoded = await geocodeAddress({
        address: input.venueAddress.trim(),
        city: input.venueCity.trim(),
        state: input.venueState.trim(),
        zip: input.venueZip.trim(),
      });
      if (!geocoded) {
        return {
          venueId: null,
          error: "Could not determine the venue's location from the address provided.",
        };
      }
      coords = geocoded;
    }
    const venue = await db.venue.create({
      data: {
        name: input.venueName.trim(),
        address: input.venueAddress.trim(),
        city: input.venueCity.trim(),
        state: input.venueState.trim(),
        zip: input.venueZip.trim(),
        lat: coords.lat,
        lng: coords.lng,
      },
    });
    return { venueId: venue.id };
  }

  return { venueId: null };
}

/**
 * Builds the data array for eventScheduleDay.createMany from schedule day inputs.
 */
export function buildScheduleDayRecords(
  eventId: string,
  scheduleDays: ScheduleDayInput[]
) {
  return scheduleDays.map((d) => ({
    eventId,
    date: parseDateOnlyToUTCNoon(d.date),
    startTime: d.allDay ? "00:00" : (d.startTime ?? "00:00"),
    endTime: d.allDay ? "23:59" : (d.endTime ?? "23:59"),
    allDay: d.allDay,
  }));
}

/**
 * Creates a new event with associated schedule days, tags, and features.
 * Handles venue resolution and timezone-aware date computation.
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

  const event = await db.event.create({
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
    await db.eventScheduleDay.createMany({
      data: buildScheduleDayRecords(event.id, scheduleDays),
    });
  }

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
