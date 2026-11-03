import { CheckCircle2 } from "lucide-react";
import { requireAdmin } from "@/lib/auth-utils";
import { db } from "@/lib/db";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { EmptyState } from "@/components/admin/empty-state";
import { VenueDuplicateGroup } from "@/components/admin/venue-duplicate-group";
import { findDuplicateGroups } from "@/lib/venues/match";

export const dynamic = "force-dynamic";

export default async function VenueDuplicatesPage() {
  await requireAdmin();

  const venues = await db.venue.findMany({
    where: { deletedAt: null },
    select: {
      id: true,
      name: true,
      address: true,
      city: true,
      state: true,
      zip: true,
      lat: true,
      lng: true,
      createdAt: true,
      _count: { select: { events: true, markets: true } },
    },
  });

  const listings = (v: (typeof venues)[number]) => v._count.events + v._count.markets;
  const groups = findDuplicateGroups(venues)
    .map((group) =>
      [...group].sort(
        (a, b) => listings(b) - listings(a) || a.createdAt.getTime() - b.createdAt.getTime()
      )
    )
    .sort((a, b) => a[0].name.localeCompare(b[0].name));

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Duplicate venues"
        description="Venues that look like the same place. Keep one and merge the rest into it: their events and markets move over and the duplicates are archived."
        breadcrumbs={[{ label: "Venues", href: "/admin/venues" }, { label: "Duplicates" }]}
      />
      {groups.length === 0 ? (
        <EmptyState
          icon={CheckCircle2}
          title="No duplicate venues"
          description="Every venue looks distinct. New venues are checked against existing ones automatically."
        />
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            {groups.length} possible {groups.length === 1 ? "duplicate" : "duplicates"} found. The venue with the most listings is preselected to keep.
          </p>
          {groups.map((group) => (
            <VenueDuplicateGroup
              key={group.map((v) => v.id).join("-")}
              venues={group.map((v) => ({
                id: v.id,
                name: v.name,
                address: v.address,
                city: v.city,
                state: v.state,
                zip: v.zip,
                events: v._count.events,
                markets: v._count.markets,
              }))}
            />
          ))}
        </div>
      )}
    </div>
  );
}
