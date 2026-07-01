import { requireAdminPermission } from "@/lib/auth-utils";
import { db } from "@/lib/db";
import { Badge } from "@/components/ui/badge";
import { StatusButton } from "@/components/admin/action-buttons";
import { Pagination } from "@/components/pagination";
import { bulkUpdateReviewStatus, updateReviewStatus } from "../actions";
import { formatDate, cn } from "@/lib/utils";
import Link from "next/link";
import type { ModerationStatus } from "@prisma/client";
import { parseAdminPagination, parseEnumParam } from "@/lib/admin/table-query";
import { BulkActionButton } from "@/components/admin/bulk-action-button";
import { AdminPageHeader } from "@/components/admin/admin-page-header";

export const dynamic = "force-dynamic";

const STATUS_TABS = [
  { label: "Pending", value: "PENDING" },
  { label: "Approved", value: "APPROVED" },
  { label: "Rejected", value: "REJECTED" },
] as const;

const statusVariant: Record<ModerationStatus, "outline" | "default" | "destructive"> = {
  PENDING: "outline",
  APPROVED: "default",
  REJECTED: "destructive",
};

export default async function AdminReviewsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; page?: string; limit?: string; user?: string }>;
}) {
  await requireAdminPermission("admin.moderation.manage");

  const params = await searchParams;
  const statusFilter =
    parseEnumParam(params.status, ["PENDING", "APPROVED", "REJECTED"] as const) ?? "PENDING";
  const userId = params.user?.trim() || undefined;
  const { page, limit } = parseAdminPagination(params);

  const where = { status: statusFilter, ...(userId ? { userId } : {}) };
  const [total, reviews] = await Promise.all([
    db.review.count({ where }),
    db.review.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: {
        user: { select: { name: true, email: true } },
        event: { select: { title: true } },
        market: { select: { name: true } },
      },
      skip: (page - 1) * limit,
      take: limit,
    }),
  ]);
  const totalPages = Math.ceil(total / limit);

  const userForFilter = userId
    ? await db.user.findUnique({
        where: { id: userId },
        select: { name: true, email: true },
      })
    : null;

  return (
    <div className="space-y-6">
      <AdminPageHeader title="Reviews" />

      {userId && userForFilter && (
        <p className="text-sm text-muted-foreground">
          Filtering by user:{" "}
          <Link href={`/admin/users/${userId}`} className="text-primary hover:underline">
            {userForFilter.name || userForFilter.email}
          </Link>
          {" · "}
          <Link href="/admin/reviews" className="text-primary hover:underline">
            Clear filter
          </Link>
        </p>
      )}

      <div className="flex gap-2 border-b border-border pb-2">
        {STATUS_TABS.map((tab) => {
          const tabHref = `/admin/reviews?status=${tab.value}&page=1${userId ? `&user=${userId}` : ""}`;
          return (
          <Link
            key={tab.value}
            href={tabHref}
            className={cn(
              "px-3 py-1.5 text-sm rounded-md transition-colors",
              statusFilter === tab.value
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted"
            )}
          >
            {tab.label}
          </Link>
          );
        })}
      </div>

      <form className="space-y-4">
        {statusFilter === "PENDING" && (
          <div className="flex items-center gap-2">
            <BulkActionButton
              label="Bulk approve selected"
              confirmMessage="Approve all selected reviews?"
              formAction={bulkUpdateReviewStatus.bind(null, "APPROVED")}
              className="inline-flex h-9 items-center justify-center rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground"
            />
            <BulkActionButton
              label="Bulk reject selected"
              confirmMessage="Reject all selected reviews?"
              formAction={bulkUpdateReviewStatus.bind(null, "REJECTED")}
              className="inline-flex h-9 items-center justify-center rounded-md bg-destructive px-3 text-sm font-medium text-destructive-foreground"
            />
          </div>
        )}
        {reviews.length === 0 ? (
          <p className="text-muted-foreground py-8 text-center">
            No {statusFilter.toLowerCase()} reviews.
          </p>
        ) : (
          reviews.map((review) => (
            <div
              key={review.id}
              className="border border-border rounded-lg p-4 space-y-3"
            >
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-3">
                  {statusFilter === "PENDING" && (
                    <input
                      type="checkbox"
                      name="selectedIds"
                      value={review.id}
                      className="mt-1 h-4 w-4"
                    />
                  )}
                  <div>
                  <p className="font-semibold">
                    {"★".repeat(review.rating)}
                    {"☆".repeat(5 - review.rating)}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    by {review.user?.name || review.user?.email || "Anonymous"}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {review.event
                      ? `Event: ${review.event.title}`
                      : review.market
                        ? `Market: ${review.market.name}`
                        : ""}
                  </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={statusVariant[review.status]}>
                    {review.status}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {formatDate(review.createdAt)}
                  </span>
                </div>
              </div>

              {review.text && <p className="text-sm">{review.text}</p>}

              {review.status === "PENDING" && (
                <div className="flex gap-2">
                  <StatusButton
                    action={updateReviewStatus.bind(null, review.id, "APPROVED")}
                    label="Approve"
                  />
                  <StatusButton
                    action={updateReviewStatus.bind(null, review.id, "REJECTED")}
                    label="Reject"
                    variant="destructive"
                  />
                </div>
              )}
            </div>
          ))
        )}
      </form>
      <Pagination page={page} totalPages={totalPages} totalItems={total} limit={limit} />
    </div>
  );
}
