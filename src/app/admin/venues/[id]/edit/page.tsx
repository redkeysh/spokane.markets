import { requireAdmin } from "@/lib/auth-utils";
import { db } from "@/lib/db";
import { VenueForm } from "@/components/admin/venue-form";
import { StatusButton } from "@/components/admin/action-buttons";
import { getNeighborhoodOptions } from "@/lib/neighborhoods";
import { notFound } from "next/navigation";
import { restoreVenue } from "../../../actions";

export const dynamic = "force-dynamic";

export default async function EditVenuePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin();
  const { id } = await params;

  const [venue, neighborhoods] = await Promise.all([
    db.venue.findUnique({ where: { id } }),
    getNeighborhoodOptions(),
  ]);
  if (!venue) notFound();

  const initialData = {
    id: venue.id,
    name: venue.name,
    address: venue.address,
    city: venue.city,
    state: venue.state,
    zip: venue.zip,
    lat: venue.lat,
    lng: venue.lng,
    neighborhood: venue.neighborhood ?? "",
    parkingNotes: venue.parkingNotes ?? "",
  };

  return (
    <div className="max-w-7xl space-y-6">
      <h1 className="text-3xl font-bold tracking-tight">Edit Venue</h1>
      {venue.deletedAt && (
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-amber-500/40 bg-amber-500/10 p-4">
          <div>
            <p className="font-medium">This venue is archived</p>
            <p className="text-sm text-muted-foreground">
              Archived venues are hidden and can&apos;t be selected for new
              events. Restore it to make it available again.
            </p>
          </div>
          <StatusButton
            action={restoreVenue.bind(null, venue.id)}
            label="Restore"
            variant="outline"
          />
        </div>
      )}
      <VenueForm initialData={initialData} neighborhoods={neighborhoods} />
    </div>
  );
}
