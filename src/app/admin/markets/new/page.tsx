import { requireAdmin } from "@/lib/auth-utils";
import { db } from "@/lib/db";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { MarketForm } from "@/components/admin/market-form";
import { getListingCommunityBadgeOptions } from "@/lib/listing-community-badges";
import { getNeighborhoodOptions } from "@/lib/neighborhoods";

export const dynamic = "force-dynamic";

export default async function NewMarketPage() {
  await requireAdmin();

  const [venues, neighborhoods, listingCommunityBadgeOptions] = await Promise.all([
    db.venue.findMany({
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    getNeighborhoodOptions(),
    getListingCommunityBadgeOptions(),
  ]);

  return (
    <div className="max-w-7xl space-y-6">
      <AdminPageHeader
        title="Create Market"
        breadcrumbs={[
          { label: "Markets", href: "/admin/markets" },
          { label: "New market" },
        ]}
      />
      <MarketForm
        venues={venues}
        neighborhoods={neighborhoods}
        listingCommunityBadgeOptions={listingCommunityBadgeOptions}
      />
    </div>
  );
}
