import { requireApiAdminPermission } from "@/lib/api-auth";
import { apiError, apiValidationError, handleApiError } from "@/lib/api-response";
import { db } from "@/lib/db";
import { eventSchema } from "@/lib/validations";
import { geocodeAddress } from "@/lib/geocode";
import {
  pickOnboardingFields,
  toEventOnboardingPrismaData,
} from "@/lib/validations/organizer-onboarding";
import { parseDateOnlyToUTCNoon, parseDateTimeInTimezone } from "@/lib/utils";
import { createNotification } from "@/lib/notifications";
import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { error } = await requireApiAdminPermission("admin.listings.manage");
    if (error) return error;

    const { id } = await params;
    const body = await request.json();
    const parsed = eventSchema.safeParse(body);

    if (!parsed.success) {
      return apiValidationError(parsed.error.flatten().fieldErrors);
    }

    const full = parsed.data;
    const onboarding = toEventOnboardingPrismaData(
      pickOnboardingFields(full as unknown as Record<string, unknown>)
    );
    const { tagIds, featureIds, scheduleDays, ...data } = full;

    const tz = "America/Los_Angeles";

    let startDate = new Date(data.startDate);
    let endDate = new Date(data.endDate);

    if (scheduleDays?.length) {
      const sortedDays = [...scheduleDays].sort((a, b) => a.date.localeCompare(b.date));
      const first = sortedDays[0];
      const last = sortedDays[sortedDays.length - 1];
      const firstStart = first.allDay ? "00:00" : (first.startTime ?? "00:00");
      const lastEnd = last.allDay ? "23:59" : (last.endTime ?? "23:59");
      startDate = parseDateTimeInTimezone(first.date, firstStart, tz);
      endDate = parseDateTimeInTimezone(last.date, lastEnd, tz);
    }

    let venueId = data.venueId?.trim() || null;
    if (!venueId && data.venueName?.trim() && data.venueAddress?.trim() && data.venueCity?.trim() && data.venueState?.trim() && data.venueZip?.trim()) {
      const providedLat =
        typeof data.venueLat === "number" && !Number.isNaN(data.venueLat)
          ? data.venueLat
          : null;
      const providedLng =
        typeof data.venueLng === "number" && !Number.isNaN(data.venueLng)
          ? data.venueLng
          : null;
      let coords: { lat: number; lng: number };
      if (providedLat !== null && providedLng !== null) {
        coords = { lat: providedLat, lng: providedLng };
      } else {
        // No coordinates from the client (address typed without picking a Mapbox
        // suggestion). Geocode server-side rather than fabricating a location;
        // reject if it can't be resolved.
        const geocoded = await geocodeAddress({
          address: data.venueAddress.trim(),
          city: data.venueCity.trim(),
          state: data.venueState.trim(),
          zip: data.venueZip.trim(),
        });
        if (!geocoded) {
          return apiError(
            "Could not determine the venue's location. Select the address from the suggestions, or double-check the street, city, state, and ZIP.",
            400
          );
        }
        coords = geocoded;
      }
      const venue = await db.venue.create({
        data: {
          name: data.venueName.trim(),
          address: data.venueAddress.trim(),
          city: data.venueCity.trim(),
          state: data.venueState.trim(),
          zip: data.venueZip.trim(),
          lat: coords.lat,
          lng: coords.lng,
        },
      });
      venueId = venue.id;
    }

    if (!venueId) {
      return apiError("Select a venue or enter an address", 400);
    }

    const activeVenue = await db.venue.findFirst({
      where: { id: venueId, deletedAt: null },
      select: { id: true },
    });
    if (!activeVenue) {
      return apiError("Selected venue is archived or missing", 400);
    }
    if (data.marketId) {
      const activeMarket = await db.market.findFirst({
        where: { id: data.marketId, deletedAt: null },
        select: { id: true },
      });
      if (!activeMarket) {
        return apiError("Selected market is archived or missing", 400);
      }
    }

    const existing = await db.event.findFirst({
      where: { id, deletedAt: null },
      select: { status: true, submittedById: true, title: true, slug: true },
    });
    if (!existing) {
      return apiError("Event not found or archived", 404);
    }

    const event = await db.event.update({
      where: { id },
      data: {
        title: data.title,
        slug: data.slug,
        description: data.description || null,
        startDate,
        endDate,
        venueId,
        marketId: data.marketId || null,
        imageUrl: data.imageUrl || null,
        showImageInList: data.showImageInList ?? true,
        imageFocalX: data.imageFocalX ?? 50,
        imageFocalY: data.imageFocalY ?? 50,
        status: data.status,
        websiteUrl: data.websiteUrl || null,
        facebookUrl: data.facebookUrl || null,
        instagramUrl: data.instagramUrl || null,
        tags: { set: tagIds?.map((id) => ({ id })) ?? [] },
        features: { set: featureIds?.map((id) => ({ id })) ?? [] },
        ...(data.participationMode !== undefined && {
          participationMode: data.participationMode || null,
        }),
        ...(data.vendorCapacity !== undefined && {
          vendorCapacity: data.vendorCapacity,
        }),
        ...(data.publicIntentListEnabled !== undefined && {
          publicIntentListEnabled: data.publicIntentListEnabled,
        }),
        ...(data.publicIntentNamesEnabled !== undefined && {
          publicIntentNamesEnabled: data.publicIntentNamesEnabled,
        }),
        ...(data.publicRosterEnabled !== undefined && {
          publicRosterEnabled: data.publicRosterEnabled,
        }),
        ...onboarding,
        ...(data.complianceFlagged !== undefined && { complianceFlagged: data.complianceFlagged }),
        ...(data.complianceNotes !== undefined && {
          complianceNotes: data.complianceNotes === "" ? null : data.complianceNotes,
        }),
      },
    });

    await db.eventScheduleDay.deleteMany({ where: { eventId: id } });
    if (scheduleDays?.length) {
      await db.eventScheduleDay.createMany({
        data: scheduleDays.map((d) => ({
          eventId: id,
          date: parseDateOnlyToUTCNoon(d.date),
          startTime: d.allDay ? "00:00" : (d.startTime ?? "00:00"),
          endTime: d.allDay ? "23:59" : (d.endTime ?? "23:59"),
          allDay: d.allDay,
        })),
      });
    }

    revalidatePath("/events");
    revalidatePath("/events/calendar");
    revalidatePath("/events/map");
    revalidatePath("/");
    revalidatePath(`/events/${event.slug}`);

    if (existing?.submittedById && data.status !== existing.status) {
      const prefs = await db.notificationPreference.findUnique({
        where: { userId: existing.submittedById },
      });
      if (prefs?.organizerAlertsEnabled !== false) {
        if (data.status === "PUBLISHED") {
          await createNotification({
            userId: existing.submittedById,
            type: "EVENT_PUBLISHED",
            title: "Your event is now published",
            body: `"${event.title}" is now live and visible to visitors.`,
            link: `/events/${event.slug}`,
            objectType: "event",
            objectId: event.id,
            metadata: { eventTitle: event.title, eventSlug: event.slug },
          });
        } else if (data.status === "REJECTED") {
          await createNotification({
            userId: existing.submittedById,
            type: "EVENT_REJECTED",
            title: "Your event was not approved",
            body: `"${event.title}" was not approved for publication.`,
            link: `/organizer/events/${event.id}/edit`,
            objectType: "event",
            objectId: event.id,
            metadata: { eventTitle: event.title },
          });
        }
      }
    }

    return NextResponse.json(event);
  } catch (err) {
    return handleApiError(err);
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { error } = await requireApiAdminPermission("admin.listings.manage");
    if (error) return error;

    const { id } = await params;
    await db.event.update({ where: { id }, data: { deletedAt: new Date() } });

    return new NextResponse(null, { status: 204 });
  } catch (err) {
    return handleApiError(err);
  }
}
