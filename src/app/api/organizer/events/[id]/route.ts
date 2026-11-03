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
import { findOrCreateVenue } from "@/lib/venues/resolve";
import { eventSlugProblem, lockEventForSlugChange, recordEventSlugChange } from "@/lib/events/slug";
import { NextResponse } from "next/server";

async function requireOrganizerAuth() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  if (session.user.role !== "ORGANIZER" && session.user.role !== "ADMIN") {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return { session };
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const result = await requireOrganizerAuth();
  if ("error" in result && result.error) return result.error;
  const { session } = result as { session: NonNullable<typeof result.session> };

  const { id } = await params;

  const event = await db.event.findUnique({
    where: { id },
    select: {
      slug: true,
      submittedById: true,
      status: true,
      marketId: true,
      market: {
        select: {
          ownerId: true,
          memberships: {
            where: { role: { in: ["OWNER", "MANAGER"] } },
            select: { userId: true },
          },
        },
      },
    },
  });

  if (!event) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const canManageViaMarket =
    event.market?.ownerId === session.user.id ||
    event.market?.memberships.some((m) => m.userId === session.user.id);

  if (
    event.submittedById !== session.user.id &&
    !canManageViaMarket &&
    session.user.role !== "ADMIN"
  ) {
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

  const tz = "America/Los_Angeles";

  let startDate = new Date(data.startDate);
  let endDate = new Date(data.endDate);

  if (scheduleDays?.length) {
    const first = scheduleDays[0];
    const last = scheduleDays[scheduleDays.length - 1];
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
      return NextResponse.json({ error: { message: resolved.error } }, { status: 400 });
    }
    venueId = resolved.venueId;
  }

  if (!venueId) {
    return NextResponse.json(
      { error: { message: "Select a venue or enter an address" } },
      { status: 400 }
    );
  }

  const slugChanged = data.slug !== event.slug;
  if (slugChanged) {
    const slugProblem = await eventSlugProblem(id, data.slug, { audience: "public" });
    if (slugProblem) {
      return NextResponse.json({ error: { message: slugProblem } }, { status: 400 });
    }
  }

  const updated = await db.$transaction(async (tx) => {
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
        websiteUrl: data.websiteUrl || null,
        facebookUrl: data.facebookUrl || null,
        instagramUrl: data.instagramUrl || null,
        tags: { set: tagIds?.map((id) => ({ id })) ?? [] },
        features: { set: featureIds?.map((id) => ({ id })) ?? [] },
        ...onboarding,
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

  await logAudit(session.user.id, "UPDATE_EVENT", "EVENT", id, { title: updated.title });

  return NextResponse.json(updated);
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const result = await requireOrganizerAuth();
  if ("error" in result && result.error) return result.error;
  const { session } = result as { session: NonNullable<typeof result.session> };

  const { id } = await params;

  const event = await db.event.findUnique({
    where: { id },
    select: {
      submittedById: true,
      status: true,
      market: {
        select: {
          ownerId: true,
          memberships: {
            where: { role: { in: ["OWNER", "MANAGER"] } },
            select: { userId: true },
          },
        },
      },
    },
  });

  if (!event) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const canManageViaMarket =
    event.market?.ownerId === session.user.id ||
    event.market?.memberships.some((m) => m.userId === session.user.id);

  if (
    event.submittedById !== session.user.id &&
    !canManageViaMarket &&
    session.user.role !== "ADMIN"
  ) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (event.status !== "DRAFT" && event.status !== "PENDING" && event.status !== "REJECTED") {
    return NextResponse.json(
      { error: "Only DRAFT, PENDING, or REJECTED events can be deleted" },
      { status: 400 }
    );
  }

  await db.event.delete({ where: { id } });

  await logAudit(session.user.id, "DELETE_EVENT", "EVENT", id);

  return NextResponse.json({ success: true });
}
