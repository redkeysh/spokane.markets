import { requireAdmin } from "@/lib/auth-utils";
import { db } from "@/lib/db";
import type { EventInput } from "@/lib/validations";
import { EventForm } from "@/components/admin/event-form";
import { notFound } from "next/navigation";
import { formatDateOnlyUTC, formatForDateTimeLocal } from "@/lib/utils";
import { adminListingEvidenceEnabled } from "@/lib/feature-flags";
import { AdminPageHeader } from "@/components/admin/admin-page-header";

export const dynamic = "force-dynamic";

export default async function EditEventPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin();
  const { id } = await params;

  const [event, venues, markets, tags, features] = await Promise.all([
    db.event.findUnique({
      where: { id },
      include: {
        tags: true,
        features: true,
        scheduleDays: { orderBy: { date: "asc" } },
        venue: true,
        submittedBy: { select: { name: true, email: true } },
        photos: { orderBy: { createdAt: "desc" }, take: 24 },
      },
    }),
    db.venue.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    db.market.findMany({ select: { id: true, name: true, venueId: true }, orderBy: { name: "asc" } }),
    db.tag.findMany({ orderBy: { name: "asc" } }),
    db.feature.findMany({ orderBy: { name: "asc" } }),
  ]);

  if (!event) notFound();

  const tz = "America/Los_Angeles";
  const scheduleDays =
    event.scheduleDays?.length
      ? event.scheduleDays.map((d) => ({
          date: formatDateOnlyUTC(d.date),
          allDay: false,
          startTime: d.allDay ? "00:00" : d.startTime,
          endTime: d.allDay ? "23:59" : d.endTime,
        }))
      : undefined;

  const initialData = {
    id: event.id,
    title: event.title,
    slug: event.slug,
    description: event.description ?? "",
    startDate: formatForDateTimeLocal(event.startDate, tz),
    endDate: formatForDateTimeLocal(event.endDate, tz),
    venueId: event.venueId,
    venueName: "",
    venueAddress: "",
    venueCity: "Spokane",
    venueState: "WA",
    venueZip: "",
    venueLat: undefined,
    venueLng: undefined,
    marketId: event.marketId ?? "",
    imageUrl: event.imageUrl ?? "",
    showImageInList: event.showImageInList ?? true,
    imageFocalX: event.imageFocalX ?? 50,
    imageFocalY: event.imageFocalY ?? 50,
    status: event.status as "DRAFT" | "PENDING" | "PUBLISHED" | "REJECTED" | "CANCELLED",
    websiteUrl: event.websiteUrl ?? "",
    facebookUrl: event.facebookUrl ?? "",
    instagramUrl: event.instagramUrl ?? "",
    tagIds: event.tags.map((t) => t.id),
    featureIds: event.features.map((f) => f.id),
    scheduleDays,
    participationMode: (event.participationMode ?? "") as string,
    vendorCapacity: event.vendorCapacity ?? undefined,
    publicIntentListEnabled: event.publicIntentListEnabled ?? undefined,
    publicIntentNamesEnabled: event.publicIntentNamesEnabled ?? undefined,
    publicRosterEnabled: event.publicRosterEnabled ?? undefined,
    complianceNotes: event.complianceNotes ?? "",
  } as EventInput & { id: string; scheduleDays?: typeof scheduleDays };

  const reviewContext = {
    eventId: event.id,
    eventSlug: event.slug,
    moderationNotesApiEnabled: adminListingEvidenceEnabled(),
    venue: event.venue
      ? {
          name: event.venue.name,
          address: event.venue.address,
          city: event.venue.city,
          state: event.venue.state,
          zip: event.venue.zip,
        }
      : null,
    submittedBy: event.submittedBy,
    organizerDisplayName: event.organizerDisplayName ?? null,
    photos: event.photos.map((p) => ({ id: p.id, url: p.url, alt: p.alt })),
  };

  return (
    <div className="max-w-7xl space-y-6">
      <AdminPageHeader
        title="Edit Event"
        breadcrumbs={[
          { label: "Events", href: "/admin/events" },
          { label: "Edit" },
        ]}
      />
      <EventForm
        venues={venues}
        markets={markets}
        tags={tags}
        features={features}
        initialData={initialData}
        reviewContext={reviewContext}
      />
    </div>
  );
}
