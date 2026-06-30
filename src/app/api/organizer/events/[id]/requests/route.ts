import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { canManageEventRoster, loadEventForRosterAuth } from "@/lib/organizer-guard";

export async function GET(
  _request: Request,
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

    const intents = await db.eventVendorIntent.findMany({
      where: {
        eventId,
        status: { in: ["REQUESTED", "APPLIED"] },
      },
      include: {
        vendorProfile: {
          select: {
            id: true,
            businessName: true,
            slug: true,
            imageUrl: true,
            specialties: true,
          },
        },
      },
      orderBy: { createdAt: "asc" },
    });

    return NextResponse.json(intents);
  } catch (err) {
    console.error("Organizer requests GET error:", err);
    return NextResponse.json(
      { error: "Failed to fetch requests" },
      { status: 500 }
    );
  }
}
