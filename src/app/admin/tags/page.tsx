import { requireAdmin } from "@/lib/auth-utils";
import { db } from "@/lib/db";
import { CategoriesManager } from "@/components/admin/categories-manager";
import { AdminPageHeader } from "@/components/admin/admin-page-header";

export const dynamic = "force-dynamic";

export default async function AdminTagsPage() {
  await requireAdmin();

  const [tags, features] = await Promise.all([
    db.tag.findMany({
      orderBy: { name: "asc" },
      include: { _count: { select: { events: true } } },
    }),
    db.feature.findMany({
      orderBy: { name: "asc" },
      include: { _count: { select: { events: true } } },
    }),
  ]);

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Tags & Features"
        description="Manage event tags (e.g. Farmers Market, Craft Fair) and features/amenities (e.g. Indoor, WiFi Available). These appear in filters and on event cards. The slug is auto-generated from the name."
      />

      <CategoriesManager initialTags={tags} initialFeatures={features} />
    </div>
  );
}
