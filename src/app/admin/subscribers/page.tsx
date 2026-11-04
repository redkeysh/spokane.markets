import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth-utils";
import { db } from "@/lib/db";
import { getNeighborhoodOptions } from "@/lib/neighborhoods";
import { parseAdminPagination } from "@/lib/admin/table-query";
import { formatFullDate, pacificDate } from "@/lib/admin/format";
import { SubscribersPageClient } from "@/components/admin/subscribers-page-client";
import { Pager, pageHref } from "@/components/admin/rare/pager";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Subscribers" };

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

  return (
    <div className="mx-auto w-full max-w-[1184px] space-y-5">
      <SubscribersPageClient
        subscribers={subscribers.map((s) => ({
          id: s.id,
          email: s.email,
          areas: s.areas,
          joined: formatFullDate(pacificDate(s.createdAt)),
        }))}
        neighborhoods={neighborhoods}
      />
      <Pager
        page={page}
        limit={limit}
        total={total}
        noun="subscribers"
        hrefFor={(p) => pageHref("/admin/subscribers", { limit: params.limit }, p)}
      />
    </div>
  );
}
