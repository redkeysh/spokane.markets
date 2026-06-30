import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { canManageEventRoster, loadEventForRosterAuth } from "@/lib/organizer-guard";
import { getParticipationConfig } from "@/lib/participation-config";
import { logAudit } from "@/lib/audit";
import { createNotification } from "@/lib/notifications";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id: eventId } = await params;

    const event = await loadEventForRosterAuth(eventId);
    if (!event) {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }

    if (!canManageEventRoster(session.user.id, event, session.user.role ?? undefined)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();
    const vendorId = body.vendorId as string | undefined;
    if (!vendorId) {
      return NextResponse.json(
        { error: "vendorId is required" },
        { status: 400 }
      );
    }

    const config = getParticipationConfig(event);
    if (config.mode === "INVITE_ONLY") {
      return NextResponse.json(
        { error: "Use add endpoint for invite-only events" },
        { status: 400 }
      );
    }

    const txResult = await db.$transaction(async (tx) => {
      if (config.vendorCapacity != null) {
        const currentCount = await tx.eventVendorRoster.count({
          where: {
            eventId,
            status: { in: ["INVITED", "ACCEPTED", "CONFIRMED"] },
          },
        });
        if (currentCount >= config.vendorCapacity) {
          return { error: "Event is at capacity" } as const;
        }
      }

      const entry = await tx.eventVendorRoster.upsert({
        where: {
          eventId_vendorProfileId: { eventId, vendorProfileId: vendorId },
        },
        create: {
          eventId,
          vendorProfileId: vendorId,
          status: "CONFIRMED",
          approvedByUserId: session.user.id,
          approvedAt: new Date(),
        },
        update: {
          status: "CONFIRMED",
          approvedByUserId: session.user.id,
          approvedAt: new Date(),
        },
      });

      await tx.eventVendorIntent.updateMany({
        where: {
          eventId,
          vendorProfileId: vendorId,
          status: { in: ["REQUESTED", "APPLIED"] },
        },
        data: { status: "APPROVED" },
      });

      return { entry };
    }, { isolationLevel: "Serializable" });

    if ("error" in txResult) {
      return NextResponse.json(
        { error: { message: txResult.error } },
        { status: 409 }
      );
    }
    const roster = txResult.entry;

    const vendorProfile = await db.vendorProfile.findUnique({
      where: { id: vendorId },
      select: { userId: true, businessName: true, slug: true },
    });
    if (vendorProfile?.userId) {
      await createNotification({
        userId: vendorProfile.userId,
        type: "ROSTER_APPROVED",
        title: "You've been approved for the event",
        body: `Your request to be listed as a vendor has been approved.`,
        link: `/events/${event.slug}`,
        objectType: "event",
        objectId: event.id,
      });
    }

    const favorites = await db.favoriteVendor.findMany({
      where: { vendorProfileId: vendorId },
      include: {
        user: {
          select: {
            id: true,
            notificationPreference: true,
          },
        },
      },
    });

    if (vendorProfile) {
      for (const fav of favorites) {
        const prefs = fav.user.notificationPreference;
        if (prefs?.favoriteVendorEnabled === false) continue;
        if (prefs?.emailsPausedAt) continue;

        await createNotification({
          userId: fav.user.id,
          type: "FAVORITE_VENDOR_EVENT",
          title: `${vendorProfile.businessName} is at ${event.title}`,
          body: `A vendor you follow will be at ${event.title}.`,
          link: `/events/${event.slug}`,
          objectType: "event",
          objectId: event.id,
          metadata: { vendorName: vendorProfile.businessName, eventTitle: event.title },
        });
      }
    }

    await logAudit(
      session.user.id,
      "ROSTER_APPROVE",
      "EVENT_VENDOR_ROSTER",
      roster.id,
      { vendorId, eventId }
    );

    return NextResponse.json(roster);
  } catch (err) {
    console.error("Roster approve error:", err);
    return NextResponse.json(
      { error: "Failed to approve vendor" },
      { status: 500 }
    );
  }
}
