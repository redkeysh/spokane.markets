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
    const status = (body.status as "INVITED" | "ACCEPTED" | "CONFIRMED") ?? "CONFIRMED";
    if (!vendorId) {
      return NextResponse.json(
        { error: "vendorId is required" },
        { status: 400 }
      );
    }

    const config = getParticipationConfig(event);
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
          status,
          approvedByUserId: session.user.id,
          approvedAt: new Date(),
        },
        update: {
          status,
          approvedByUserId: session.user.id,
          approvedAt: new Date(),
        },
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

    await logAudit(
      session.user.id,
      "ROSTER_ADD",
      "EVENT_VENDOR_ROSTER",
      roster.id,
      { vendorId, eventId }
    );

    const [vendor, favorites] = await Promise.all([
      db.vendorProfile.findUnique({
        where: { id: vendorId },
        select: { userId: true, businessName: true, slug: true },
      }),
      db.favoriteVendor.findMany({
        where: { vendorProfileId: vendorId },
        include: {
          user: {
            select: {
              id: true,
              notificationPreference: true,
            },
          },
        },
      }),
    ]);

    if (vendor) {
      if (vendor.userId) {
        await createNotification({
          userId: vendor.userId,
          type: "ROSTER_ADD",
          title: `You were added to the vendor roster for "${event.title}"`,
          link: `/events/${event.slug}`,
          objectType: "event",
          objectId: event.id,
        });
      }

      for (const fav of favorites) {
        const prefs = fav.user.notificationPreference;
        if (prefs?.favoriteVendorEnabled === false) continue;
        if (prefs?.emailsPausedAt) continue;

        await createNotification({
          userId: fav.user.id,
          type: "FAVORITE_VENDOR_EVENT",
          title: `${vendor.businessName} is at ${event.title}`,
          body: `A vendor you follow will be at ${event.title}.`,
          link: `/events/${event.slug}`,
          objectType: "event",
          objectId: event.id,
          metadata: { vendorName: vendor.businessName, eventTitle: event.title },
        });
      }
    }

    return NextResponse.json(roster);
  } catch (err) {
    console.error("Roster add error:", err);
    return NextResponse.json(
      { error: "Failed to add vendor" },
      { status: 500 }
    );
  }
}
