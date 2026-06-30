import type { Metadata } from "next";
import Link from "next/link";
import { requireRole } from "@/lib/auth-utils";
import { SITE_NAME } from "@/lib/constants";
import { db } from "@/lib/db";
import { canManageEventRoster } from "@/lib/organizer-guard";
import { TrackEventOnMount } from "@/components/analytics/track-event-on-mount";
import { OrganizerRosterManager } from "@/components/organizer-roster-manager";
import { Button } from "@/components/ui/button";
import { notFound, redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: `Manage Roster — ${SITE_NAME}`,
};

export default async function OrganizerRosterPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireRole("ORGANIZER");
  const { id } = await params;

  const event = await db.event.findUnique({
    where: { id },
    include: {
      market: {
        include: {
          memberships: {
            where: { role: { in: ["OWNER", "MANAGER"] } },
            select: { userId: true, role: true },
          },
        },
      },
      venue: true,
    },
  });

  if (!event) notFound();

  if (!canManageEventRoster(session.user.id, event, session.user.role ?? undefined)) {
    redirect("/unauthorized");
  }

  const [requests, rosterData] = await Promise.all([
    db.eventVendorIntent.findMany({
      where: {
        eventId: id,
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
    }),
    db.eventVendorRoster.findMany({
      where: {
        eventId: id,
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
  ]);

  const { getParticipationConfig } = await import("@/lib/participation-config");
  const config = getParticipationConfig(event);

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <TrackEventOnMount
        eventName="roster_review_started"
        params={{ event_id: id, surface: "dashboard" }}
      />
      <div className="flex items-center justify-between">
        <div>
          <Link
            href={`/events/${event.slug}`}
            className="text-sm text-muted-foreground hover:text-primary"
          >
            ← Back to event
          </Link>
          <h1 className="mt-2 text-3xl font-bold tracking-tight">
            Manage Vendor Roster
          </h1>
          <p className="mt-1 text-muted-foreground">
            {event.title} · {event.venue.name}
          </p>
        </div>
        <Button variant="outline" asChild>
          <Link href={`/organizer/events/${id}/edit`}>Edit Event</Link>
        </Button>
      </div>

      <OrganizerRosterManager
        eventId={id}
        eventSlug={event.slug}
        mode={config.mode}
        capacity={config.vendorCapacity}
        requests={requests.map((r) => ({
          id: r.id,
          vendorProfileId: r.vendorProfileId,
          status: r.status,
          vendorProfile: r.vendorProfile,
        }))}
        roster={rosterData.map((r) => ({
          id: r.id,
          vendorProfileId: r.vendorProfileId,
          status: r.status,
          vendorProfile: r.vendorProfile,
        }))}
      />
    </div>
  );
}
