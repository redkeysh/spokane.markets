import { requireAdminPermission } from "@/lib/auth-utils";
import { db } from "@/lib/db";
import { Badge } from "@/components/ui/badge";
import { StatusButton } from "@/components/admin/action-buttons";
import { Pagination } from "@/components/pagination";
import { bulkUpdatePhotoStatus, updatePhotoStatus } from "../actions";
import { formatDate, cn } from "@/lib/utils";
import Link from "next/link";
import Image from "next/image";
import type { ModerationStatus } from "@prisma/client";
import { BulkActionButton } from "@/components/admin/bulk-action-button";
import { parseAdminPagination, parseEnumParam } from "@/lib/admin/table-query";
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

export default async function AdminPhotosPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; page?: string; limit?: string }>;
}) {
  await requireAdminPermission("admin.moderation.manage");

  const params = await searchParams;
  const statusFilter =
    parseEnumParam(params.status, ["PENDING", "APPROVED", "REJECTED"] as const) ?? "PENDING";
  const { page, limit } = parseAdminPagination(params);

  const where = { status: statusFilter };
  const [total, photos] = await Promise.all([
    db.photo.count({ where }),
    db.photo.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: {
        uploadedBy: { select: { name: true, email: true } },
        event: { select: { title: true, slug: true } },
        market: { select: { name: true, slug: true } },
        review: { select: { id: true } },
      },
      skip: (page - 1) * limit,
      take: limit,
    }),
  ]);
  const totalPages = Math.ceil(total / limit);

  return (
    <div className="space-y-6">
      <AdminPageHeader title="Photos" />

      <div className="flex gap-2 border-b border-border pb-2">
        {STATUS_TABS.map((tab) => (
          <Link
            key={tab.value}
            href={`/admin/photos?status=${tab.value}`}
            className={cn(
              "px-3 py-1.5 text-sm rounded-md transition-colors",
              statusFilter === tab.value
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted"
            )}
          >
            {tab.label}
          </Link>
        ))}
      </div>

      <form className="space-y-4">
        {statusFilter === "PENDING" && (
          <div className="flex items-center gap-2">
            <BulkActionButton
              label="Bulk approve selected"
              confirmMessage="Approve all selected photos?"
              formAction={bulkUpdatePhotoStatus.bind(null, "APPROVED")}
              className="inline-flex h-9 items-center justify-center rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground"
            />
            <BulkActionButton
              label="Bulk reject selected"
              confirmMessage="Reject all selected photos?"
              formAction={bulkUpdatePhotoStatus.bind(null, "REJECTED")}
              className="inline-flex h-9 items-center justify-center rounded-md bg-destructive px-3 text-sm font-medium text-destructive-foreground"
            />
          </div>
        )}
        {photos.length === 0 ? (
          <p className="text-muted-foreground py-8 text-center">
            No {statusFilter.toLowerCase()} photos.
          </p>
        ) : (
          photos.map((photo) => (
            <div
              key={photo.id}
              className="border border-border rounded-lg p-4 space-y-3 flex flex-col sm:flex-row gap-4"
            >
              {statusFilter === "PENDING" && (
                <div className="shrink-0">
                  <input
                    type="checkbox"
                    name="selectedIds"
                    value={photo.id}
                    className="mt-1 h-4 w-4"
                  />
                </div>
              )}
              <div className="shrink-0">
                <Image
                  src={photo.url}
                  alt={photo.alt ?? "Photo"}
                  width={200}
                  height={150}
                  className="rounded-md object-cover w-[200px] h-[150px]"
                  unoptimized
                />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm text-muted-foreground">
                      by {photo.uploadedBy.name || photo.uploadedBy.email}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {photo.event
                        ? `Event: ${photo.event.title}`
                        : photo.market
                          ? `Market: ${photo.market.name}`
                          : photo.review
                            ? "Review photo"
                            : "—"}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge variant={statusVariant[photo.status]}>
                      {photo.status}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {formatDate(photo.createdAt)}
                    </span>
                  </div>
                </div>

                {photo.event && (
                  <Link
                    href={`/events/${photo.event.slug}`}
                    className="text-sm text-primary hover:underline mt-1 inline-block"
                  >
                    View event →
                  </Link>
                )}
                {photo.market && (
                  <Link
                    href={`/markets/${photo.market.slug}`}
                    className="text-sm text-primary hover:underline mt-1 inline-block"
                  >
                    View market →
                  </Link>
                )}

                {photo.status === "PENDING" && (
                  <div className="flex gap-2 mt-3">
                    <StatusButton
                      action={updatePhotoStatus.bind(null, photo.id, "APPROVED")}
                      label="Approve"
                    />
                    <StatusButton
                      action={updatePhotoStatus.bind(null, photo.id, "REJECTED")}
                      label="Reject"
                      variant="destructive"
                    />
                  </div>
                )}
              </div>
            </div>
          ))
        )}
      </form>
      <Pagination page={page} totalPages={totalPages} totalItems={total} limit={limit} />
    </div>
  );
}
