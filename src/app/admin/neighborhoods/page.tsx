import { requireAdmin } from "@/lib/auth-utils";
import { db } from "@/lib/db";
import { NeighborhoodsManager } from "@/components/admin/neighborhoods-manager";
import { AdminPageHeader } from "@/components/admin/admin-page-header";

export const dynamic = "force-dynamic";

export default async function AdminNeighborhoodsPage() {
  await requireAdmin();

  const neighborhoods = await db.neighborhood.findMany({
    orderBy: [{ label: "asc" }],
    include: {
      _count: {
        select: {
          markets: true,
          venues: true,
        },
      },
    },
  });

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Neighborhoods"
        description="Manage the neighborhood list used by markets, venues, filters, and newsletter subscriptions."
      />

      <NeighborhoodsManager initialNeighborhoods={neighborhoods} />
    </div>
  );
}
