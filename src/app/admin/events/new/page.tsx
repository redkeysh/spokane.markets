import { requireAdmin } from "@/lib/auth-utils";
import { db } from "@/lib/db";
import { EventForm } from "@/components/admin/event-form";
import { AdminPageHeader } from "@/components/admin/admin-page-header";

export const dynamic = "force-dynamic";

export default async function NewEventPage() {
  await requireAdmin();

  const [venues, markets, tags, features] = await Promise.all([
    db.venue.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    db.market.findMany({ select: { id: true, name: true, venueId: true }, orderBy: { name: "asc" } }),
    db.tag.findMany({ orderBy: { name: "asc" } }),
    db.feature.findMany({ orderBy: { name: "asc" } }),
  ]);

  return (
    <div className="max-w-7xl space-y-6">
      <AdminPageHeader
        title="Create Event"
        breadcrumbs={[
          { label: "Events", href: "/admin/events" },
          { label: "New event" },
        ]}
      />
      <EventForm
        venues={venues}
        markets={markets}
        tags={tags}
        features={features}
        showJsonImport
      />
    </div>
  );
}
