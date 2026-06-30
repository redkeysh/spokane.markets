import { db } from "@/lib/db";
import { eventSchema } from "@/lib/validations";
import {
  pickOnboardingFields,
  toEventOnboardingPrismaData,
} from "@/lib/validations/organizer-onboarding";
import { parseDateOnlyToUTCNoon, parseDateTimeInTimezone } from "@/lib/utils";
import { logAudit } from "@/lib/audit";
import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { requireApiAdminPermission } from "@/lib/api-auth";

export async function POST(request: Request) {
  const { session, error } = await requireApiAdminPermission("admin.listings.manage");
  if (error) return error;

  const body = await request.json();
  const parsed = eventSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { message: "Validation failed", details: parsed.error.flatten() } },
      { status: 400 }
    );
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
    const lat =
      typeof data.venueLat === "number" && !Number.isNaN(data.venueLat)
        ? data.venueLat
        : 47.6588;
    const lng =
      typeof data.venueLng === "number" && !Number.isNaN(data.venueLng)
        ? data.venueLng
        : -117.426;
    const venue = await db.venue.create({
      data: {
        name: data.venueName.trim(),
        address: data.venueAddress.trim(),
        city: data.venueCity.trim(),
        state: data.venueState.trim(),
        zip: data.venueZip.trim(),
        lat,
        lng,
      },
    });
    venueId = venue.id;
  }

  if (!venueId) {
    return NextResponse.json(
      { error: { message: "Select a venue or enter an address" } },
      { status: 400 }
    );
  }

  const venueExists = await db.venue.findFirst({
    where: { id: venueId, deletedAt: null },
    select: { id: true },
  });
  if (!venueExists) {
    return NextResponse.json(
      { error: { message: "Selected venue is archived or missing" } },
      { status: 400 }
    );
  }

  if (data.marketId) {
    const marketExists = await db.market.findFirst({
      where: { id: data.marketId, deletedAt: null },
      select: { id: true },
    });
    if (!marketExists) {
      return NextResponse.json(
        { error: { message: "Selected market is archived or missing" } },
        { status: 400 }
      );
    }
  }

  const event = await db.event.create({
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
      ...(data.participationMode && { participationMode: data.participationMode }),
      ...(data.vendorCapacity != null && { vendorCapacity: data.vendorCapacity }),
      ...(data.publicIntentListEnabled !== undefined && {
        publicIntentListEnabled: data.publicIntentListEnabled,
      }),
      ...(data.publicIntentNamesEnabled !== undefined && {
        publicIntentNamesEnabled: data.publicIntentNamesEnabled,
      }),
      ...(data.publicRosterEnabled !== undefined && {
        publicRosterEnabled: data.publicRosterEnabled,
      }),
      tags: tagIds?.length ? { connect: tagIds.map((id) => ({ id })) } : undefined,
      features: featureIds?.length
        ? { connect: featureIds.map((id) => ({ id })) }
        : undefined,
      ...onboarding,
      ...(data.complianceFlagged !== undefined && { complianceFlagged: data.complianceFlagged }),
      ...(data.complianceNotes !== undefined && {
        complianceNotes: data.complianceNotes === "" ? null : data.complianceNotes,
      }),
    },
  });

  if (scheduleDays?.length) {
    await db.eventScheduleDay.createMany({
      data: scheduleDays.map((d) => ({
        eventId: event.id,
        date: parseDateOnlyToUTCNoon(d.date),
        startTime: d.allDay ? "00:00" : (d.startTime ?? "00:00"),
        endTime: d.allDay ? "23:59" : (d.endTime ?? "23:59"),
        allDay: d.allDay,
      })),
    });
  }

  await logAudit(session.user.id, "CREATE_EVENT", "EVENT", event.id, { title: event.title });

  revalidatePath("/events");
  revalidatePath("/events/calendar");
  revalidatePath("/events/map");
  revalidatePath("/");
  if (event.status === "PUBLISHED") {
    revalidatePath(`/events/${event.slug}`);
  }

  return NextResponse.json(event, { status: 201 });
}
