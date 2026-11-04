import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth-utils";
import { db } from "@/lib/db";
import { CommunityBadgesManager } from "@/components/admin/community-badges-manager";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Community badges" };

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
    <div className="mx-auto w-full max-w-[1184px] space-y-5">
      <CommunityBadgesManager initialBadges={badges} />
    </div>
  );
}
