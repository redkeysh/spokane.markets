import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth-utils";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/admin/kit/page-header";
import { CategoriesManager } from "@/components/admin/categories-manager";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Tags and features" };

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
    <div className="mx-auto w-full max-w-[1184px] space-y-6">
      <PageHeader
        title="Tags and features"
        description="Both show up in the site's filters and on event cards. Choose them for each event in its editor."
      />
      <CategoriesManager initialTags={tags} initialFeatures={features} />
    </div>
  );
}
