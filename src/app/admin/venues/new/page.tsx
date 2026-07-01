import { requireAdmin } from "@/lib/auth-utils";
import { VenueForm } from "@/components/admin/venue-form";
import { getNeighborhoodOptions } from "@/lib/neighborhoods";
import { AdminPageHeader } from "@/components/admin/admin-page-header";

export const dynamic = "force-dynamic";

export default async function NewVenuePage() {
  await requireAdmin();
  const neighborhoods = await getNeighborhoodOptions();

  return (
    <div className="max-w-7xl space-y-6">
      <AdminPageHeader
        title="Create Venue"
        breadcrumbs={[
          { label: "Venues", href: "/admin/venues" },
          { label: "New venue" },
        ]}
      />
      <VenueForm neighborhoods={neighborhoods} />
    </div>
  );
}
