import { requireAdmin } from "@/lib/auth-utils";
import { db } from "@/lib/db";
import { CommunityBadgesManager } from "@/components/admin/community-badges-manager";
import { AdminPageHeader } from "@/components/admin/admin-page-header";

export const dynamic = "force-dynamic";

export default async function AdminCommunityBadgesPage() {
  await requireAdmin();

  const badges = await db.badgeDefinition.findMany({
    where: { category: "LISTING_COMMUNITY" },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    include: {
      _count: { select: { vendorProfiles: true, markets: true } },
    },
  });

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Community Badges"
        description="Create and manage the badge definitions admins, vendors, and organizers can apply."
      />
      <CommunityBadgesManager initialBadges={badges} />
    </div>
  );
}
