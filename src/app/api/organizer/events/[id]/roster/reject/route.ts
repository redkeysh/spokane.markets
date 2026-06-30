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

    const intent = await db.eventVendorIntent.findUnique({
      where: {
        eventId_vendorProfileId: { eventId, vendorProfileId: vendorId },
      },
    });

    if (intent) {
      await db.eventVendorIntent.update({
        where: { id: intent.id },
        data: { status: "DECLINED" },
      });
    }

    await db.eventVendorRoster.deleteMany({
      where: { eventId, vendorProfileId: vendorId },
    });

    const vendorProfile = await db.vendorProfile.findUnique({
      where: { id: vendorId },
      select: { userId: true },
    });
    if (vendorProfile?.userId) {
      await createNotification({
        userId: vendorProfile.userId,
        type: "ROSTER_REJECTED",
        title: "Your vendor request was not approved",
        body: "The organizer has declined your request to be listed for this event.",
        link: `/events/${event.slug}`,
        objectType: "event",
        objectId: event.id,
      });
    }

    await logAudit(
      session.user.id,
      "ROSTER_REJECT",
      "EVENT_VENDOR_ROSTER",
      undefined,
      { vendorId, eventId }
    );

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Roster reject error:", err);
    return NextResponse.json(
      { error: "Failed to reject vendor" },
      { status: 500 }
    );
  }
}
