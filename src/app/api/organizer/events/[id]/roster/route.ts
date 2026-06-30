import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { canManageEventRoster, loadEventForRosterAuth } from "@/lib/organizer-guard";
import { getParticipationConfig } from "@/lib/participation-config";

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

    const [roster, config] = await Promise.all([
      db.eventVendorRoster.findMany({
        where: {
          eventId,
          status: { in: ["INVITED", "ACCEPTED", "CONFIRMED"] },
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
      }),
      Promise.resolve(getParticipationConfig(event)),
    ]);

    return NextResponse.json({
      roster,
      capacity: config.vendorCapacity,
      mode: config.mode,
    });
  } catch (err) {
    console.error("Roster GET error:", err);
    return NextResponse.json(
      { error: "Failed to fetch roster" },
      { status: 500 }
    );
  }
}
