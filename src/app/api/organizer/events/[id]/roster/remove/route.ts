import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { canManageEventRoster, loadEventForRosterAuth } from "@/lib/organizer-guard";
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

    const roster = await db.eventVendorRoster.findUnique({
      where: {
        eventId_vendorProfileId: { eventId, vendorProfileId: vendorId },
      },
    });

    await db.eventVendorRoster.deleteMany({
      where: { eventId, vendorProfileId: vendorId },
    });

    if (roster) {
      await logAudit(
        session.user.id,
        "ROSTER_REMOVE",
        "EVENT_VENDOR_ROSTER",
        roster.id,
        { vendorId, eventId }
      );

      const vendor = await db.vendorProfile.findUnique({
        where: { id: vendorId },
        select: { userId: true },
      });
      if (vendor?.userId) {
        await createNotification({
          userId: vendor.userId,
          type: "ROSTER_REMOVE",
          title: `You were removed from the vendor roster for "${event.title}"`,
          link: `/events/${event.slug}`,
          objectType: "event",
          objectId: event.id,
        });
      }
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Roster remove error:", err);
    return NextResponse.json(
      { error: "Failed to remove vendor" },
      { status: 500 }
    );
  }
}
