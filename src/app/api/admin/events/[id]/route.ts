import { requireApiAdminPermission } from "@/lib/api-auth";
import { apiError, apiValidationError, handleApiError } from "@/lib/api-response";
import { db } from "@/lib/db";
import { eventSchema } from "@/lib/validations";
import { findOrCreateVenue } from "@/lib/venues/resolve";
import {
  pickOnboardingFields,
  toEventOnboardingPrismaData,
} from "@/lib/validations/organizer-onboarding";
import { parseDateOnlyToUTCNoon, parseDateTimeInTimezone } from "@/lib/utils";
import { notifySubmitterOfStatusChange } from "@/lib/events/status-notifications";
import { eventSlugProblem, lockEventForSlugChange, recordEventSlugChange } from "@/lib/events/slug";
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
      const resolved = await findOrCreateVenue({
        name: data.venueName,
        address: data.venueAddress,
        city: data.venueCity,
        state: data.venueState,
        zip: data.venueZip,
        lat: data.venueLat,
        lng: data.venueLng,
      });
      if ("error" in resolved) {
        return apiError(resolved.error, 400);
      }
      venueId = resolved.venueId;
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
    const slugChanged = data.slug !== existing.slug;
    if (slugChanged) {
      const problem = await eventSlugProblem(id, data.slug);
      if (problem) return apiError(problem, 400);
    }

    const event = await db.$transaction(async (tx) => {
      const before = await lockEventForSlugChange(tx, id);
      const row = await tx.event.update({
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
      await recordEventSlugChange(tx, id, before.slug, row.slug, { previousStatus: before.status });
      return row;
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
    if (slugChanged) revalidatePath(`/events/${existing.slug}`);

    if (existing) {
      await notifySubmitterOfStatusChange({
        submittedById: existing.submittedById,
        previousStatus: existing.status,
        newStatus: data.status,
        event,
      });
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
