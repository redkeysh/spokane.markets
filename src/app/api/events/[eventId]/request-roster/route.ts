import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { findEventByIdOrSlug } from "@/lib/services/event-occurrence-service";
import { checkRateLimit } from "@/lib/rate-limit";
import { getParticipationConfig, rosterRequestsAllowed } from "@/lib/participation-config";
import { createNotification } from "@/lib/notifications";

async function findEvent(eventIdOrSlug: string) {
  return findEventByIdOrSlug(eventIdOrSlug);
}

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ eventId: string }> }
) {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { ok, retryAfter } = await checkRateLimit(session.user.id, "vendorIntents");
    if (!ok) {
      return NextResponse.json(
        { error: "Too many requests. Please try again later." },
        { status: 429, headers: retryAfter ? { "Retry-After": String(retryAfter) } : undefined }
      );
    }

    const profile = await db.vendorProfile.findUnique({
      where: { userId: session.user.id },
    });
    if (!profile) {
      return NextResponse.json(
        { error: "No vendor profile found" },
        { status: 404 }
      );
    }

    const { eventId: eventIdOrSlug } = await params;

    const event = await findEvent(eventIdOrSlug);
    if (!event || event.status !== "PUBLISHED") {
      return NextResponse.json(
        { error: "Event not found or not published" },
        { status: 404 }
      );
    }

    const config = getParticipationConfig(event);
    if (!rosterRequestsAllowed(config)) {
      const error =
        config.vendorApplicationDeadline &&
        config.vendorApplicationDeadline.getTime() < Date.now()
          ? "The application deadline has passed"
          : config.vendorApplicationState === "CLOSED" ||
              config.vendorApplicationState === "NOT_ACCEPTING"
            ? "The organizer is not accepting vendor applications for this event"
            : "This event does not accept roster requests";
      return NextResponse.json({ error }, { status: 400 });
    }

    // Don't let a re-request downgrade an intent the organizer has already acted
    // on (reset an APPROVED/ATTENDING/WAITLISTED vendor back to REQUESTED and
    // re-notify). A declined/withdrawn vendor may still re-apply.
    const existingIntent = await db.eventVendorIntent.findUnique({
      where: {
        eventId_vendorProfileId: {
          eventId: event.id,
          vendorProfileId: profile.id,
        },
      },
      select: { status: true },
    });
    const decidedStatuses = ["APPROVED", "ATTENDING", "WAITLISTED"];
    if (existingIntent && decidedStatuses.includes(existingIntent.status)) {
      return NextResponse.json(
        { error: "Your request for this event has already been reviewed." },
        { status: 409 }
      );
    }

    const intent = await db.eventVendorIntent.upsert({
      where: {
        eventId_vendorProfileId: {
          eventId: event.id,
          vendorProfileId: profile.id,
        },
      },
      create: {
        eventId: event.id,
        vendorProfileId: profile.id,
        status: "REQUESTED",
        visibility: "PRIVATE",
      },
      update: {
        status: "REQUESTED",
        visibility: "PRIVATE",
      },
    });

    const organizerIds = new Set<string>();
    if (event.submittedById) organizerIds.add(event.submittedById);
    if (event.market?.ownerId) organizerIds.add(event.market.ownerId);
    if (event.marketId) {
      const marketMemberships = await db.marketMembership.findMany({
        where: {
          marketId: event.marketId,
          role: { in: ["OWNER", "MANAGER"] },
        },
        select: { userId: true },
      });
      for (const membership of marketMemberships) {
        organizerIds.add(membership.userId);
      }
    }

    for (const organizerId of organizerIds) {
      const prefs = await db.notificationPreference.findUnique({
        where: { userId: organizerId },
      });
      const allowVendorRequests =
        prefs?.vendorRequestAlertsEnabled ?? prefs?.organizerAlertsEnabled ?? true;
      if (!allowVendorRequests) continue;

      await createNotification({
        userId: organizerId,
        type: "VENDOR_ROSTER_REQUEST",
        title: `${profile.businessName} requested to join`,
        body: `${profile.businessName} requested to be listed as a vendor for ${event.title}.`,
        link: `/organizer/events/${event.id}/roster`,
        objectType: "event",
        objectId: event.id,
        metadata: { actorId: session.user.id },
      });
    }

    return NextResponse.json(intent, { status: 201 });
  } catch (err) {
    console.error("Request roster POST error:", err);
    return NextResponse.json(
      { error: "Failed to submit request" },
      { status: 500 }
    );
  }
}
