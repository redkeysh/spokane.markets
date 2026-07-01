import { requireAdmin } from "@/lib/auth-utils";
import { db } from "@/lib/db";
import { Pagination } from "@/components/pagination";
import { SubscribersPageClient } from "@/components/admin/subscribers-page-client";
import { getNeighborhoodOptions } from "@/lib/neighborhoods";
import { parseAdminPagination } from "@/lib/admin/table-query";
import { AdminPageHeader } from "@/components/admin/admin-page-header";

export const dynamic = "force-dynamic";

export default async function AdminSubscribersPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; limit?: string }>;
}) {
  await requireAdmin();

  const params = await searchParams;
  const { page, limit } = parseAdminPagination(params);

  const [total, subscribers, neighborhoods] = await Promise.all([
    db.subscriber.count(),
    db.subscriber.findMany({
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    getNeighborhoodOptions(),
  ]);
  const totalPages = Math.ceil(total / limit);

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Subscribers"
        description="Newsletter subscribers receive the weekly digest. Add them manually or they sign up via the site."
      />
      <SubscribersPageClient
        subscribers={subscribers}
        neighborhoods={neighborhoods}
        total={total}
      />
      <Pagination page={page} totalPages={totalPages} totalItems={total} limit={limit} />
    </div>
  );
}
