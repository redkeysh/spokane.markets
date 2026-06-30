import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { organizerEventSchema } from "@/lib/validations";
import {
  pickOnboardingFields,
  toEventOnboardingPrismaData,
} from "@/lib/validations/organizer-onboarding";
import { parseDateOnlyToUTCNoon, parseDateTimeInTimezone } from "@/lib/utils";
import { logAudit } from "@/lib/audit";
import { organizerManageMarketWhere } from "@/lib/market-membership";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role !== "ORGANIZER" && session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();
  const parsed = organizerEventSchema.safeParse(body);
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
    // Sort by date so an out-of-order payload can't yield startDate > endDate.
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

  if (data.marketId && session.user.role !== "ADMIN") {
    const marketAccess = await db.market.findFirst({
      where: {
        id: data.marketId,
        ...organizerManageMarketWhere(session.user.id),
      },
      select: { id: true },
    });
    if (!marketAccess) {
      return NextResponse.json({ error: "Forbidden for selected market" }, { status: 403 });
    }
  }

  // Publish only when the event is attached to a VERIFIED market. Previously
  // this checked whether the organizer owned ANY verified market, which let an
  // event for an unverified (or no) market skip moderation.
  let isVerifiedMarket = false;
  if (data.marketId) {
    const market = await db.market.findUnique({
      where: { id: data.marketId },
      select: { verificationStatus: true },
    });
    isVerifiedMarket = market?.verificationStatus === "VERIFIED";
  }

  const status = isVerifiedMarket ? "PUBLISHED" : "PENDING";

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
      websiteUrl: data.websiteUrl || null,
      facebookUrl: data.facebookUrl || null,
      instagramUrl: data.instagramUrl || null,
      status,
      submittedById: session.user.id,
      tags: tagIds?.length ? { connect: tagIds.map((id) => ({ id })) } : undefined,
      features: featureIds?.length
        ? { connect: featureIds.map((id) => ({ id })) }
        : undefined,
      ...onboarding,
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

  return NextResponse.json(event, { status: 201 });
}
