import { requireAdminPermission } from "@/lib/auth-utils";
import { db } from "@/lib/db";
import { TrackEventOnMount } from "@/components/analytics/track-event-on-mount";
import { Badge } from "@/components/ui/badge";
import { StatusButton } from "@/components/admin/action-buttons";
import { Pagination } from "@/components/pagination";
import { bulkUpdateSubmissionStatus, updateSubmissionStatus } from "../actions";
import { formatDate, cn } from "@/lib/utils";
import { formatSubmissionScheduleSummary } from "@/lib/submission-display";
import Link from "next/link";
import type { ModerationStatus } from "@prisma/client";
import { parseAdminPagination, parseEnumParam } from "@/lib/admin/table-query";
import { BulkActionButton } from "@/components/admin/bulk-action-button";
import { Button } from "@/components/ui/button";

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

export default async function AdminSubmissionsPage({
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
  const [total, submissions, markets, tags, features] = await Promise.all([
    db.submission.count({ where }),
    db.submission.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    db.market.findMany({ select: { id: true, name: true } }),
    db.tag.findMany({ select: { id: true, name: true } }),
    db.feature.findMany({ select: { id: true, name: true } }),
  ]);
  const totalPages = Math.ceil(total / limit);
  const marketMap = new Map(markets.map((m) => [m.id, m.name]));
  const tagMap = new Map(tags.map((t) => [t.id, t.name]));
  const featureMap = new Map(features.map((f) => [f.id, f.name]));

  return (
    <div className="space-y-6">
      <TrackEventOnMount
        eventName="admin_review_queue_view"
        params={{
          queue_type: "submission",
          status: statusFilter.toLowerCase(),
          surface: "dashboard",
        }}
      />
      <h1 className="text-3xl font-bold tracking-tight">Submissions</h1>

      <div className="flex gap-2 border-b border-border pb-2">
        {STATUS_TABS.map((tab) => (
          <Link
            key={tab.value}
            href={`/admin/submissions?status=${tab.value}&page=1`}
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
              confirmMessage="Approve all selected submissions?"
              formAction={bulkUpdateSubmissionStatus.bind(null, "APPROVED")}
              className="inline-flex h-9 items-center justify-center rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground"
            />
            <BulkActionButton
              label="Bulk reject selected"
              confirmMessage="Reject all selected submissions?"
              formAction={bulkUpdateSubmissionStatus.bind(null, "REJECTED")}
              className="inline-flex h-9 items-center justify-center rounded-md bg-destructive px-3 text-sm font-medium text-destructive-foreground"
            />
          </div>
        )}
        {submissions.length === 0 ? (
          <p className="text-muted-foreground py-8 text-center">
            No {statusFilter.toLowerCase()} submissions.
          </p>
        ) : (
          submissions.map((sub) => (
            <div
              key={sub.id}
              className="border border-border rounded-lg p-4 space-y-3"
            >
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-3">
                  {statusFilter === "PENDING" && (
                    <input
                      type="checkbox"
                      name="selectedIds"
                      value={sub.id}
                      className="mt-1 h-4 w-4"
                    />
                  )}
                  <div>
                  <h3 className="font-semibold">{sub.eventTitle}</h3>
                  <p className="text-sm text-muted-foreground">
                    Submitted by {sub.submitterName} ({sub.submitterEmail})
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {formatSubmissionScheduleSummary(sub)}
                    {" · "}
                    {sub.venueName}
                    {[sub.venueAddress, [sub.venueCity, sub.venueState, sub.venueZip].filter(Boolean).join(", ")]
                      .filter(Boolean)
                      .join(", ")}
                  </p>
                  {sub.marketId && marketMap.has(sub.marketId) && (
                    <p className="text-sm text-muted-foreground">
                      Market: {marketMap.get(sub.marketId)}
                    </p>
                  )}
                  </div>
                </div>
                <div className="flex flex-wrap items-center justify-end gap-2">
                  {sub.status === "PENDING" && (
                    <Button size="sm" asChild>
                      <Link href={`/admin/submissions/${sub.id}`}>Review</Link>
                    </Button>
                  )}
                  <Badge variant={statusVariant[sub.status]}>
                    {sub.status}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {formatDate(sub.createdAt)}
                  </span>
                </div>
              </div>

              {sub.imageUrl && (
                <p className="text-sm">
                  <a href={sub.imageUrl} target="_blank" rel="noreferrer" className="text-primary hover:underline">
                    Event image
                  </a>
                </p>
              )}
              {sub.eventDescription && (
                <p className="text-sm">{sub.eventDescription}</p>
              )}
              {(sub.tagIds?.length ?? 0) > 0 && (
                <p className="text-sm text-muted-foreground">
                  Tags: {sub.tagIds!.map((id) => tagMap.get(id) ?? id).join(", ")}
                </p>
              )}
              {(sub.featureIds?.length ?? 0) > 0 && (
                <p className="text-sm text-muted-foreground">
                  Features: {sub.featureIds!.map((id) => featureMap.get(id) ?? id).join(", ")}
                </p>
              )}
              {sub.notes && (
                <p className="text-sm text-muted-foreground">
                  Notes: {sub.notes}
                </p>
              )}

              {sub.status === "PENDING" && (
                <div className="flex gap-2">
                  <StatusButton
                    action={updateSubmissionStatus.bind(null, sub.id, "APPROVED")}
                    label="Approve"
                    analyticsEventName="admin_submission_approved"
                    analyticsParams={{
                      submission_id: sub.id,
                      surface: "dashboard",
                    }}
                  />
                  <StatusButton
                    action={updateSubmissionStatus.bind(null, sub.id, "REJECTED")}
                    label="Reject"
                    variant="destructive"
                    analyticsEventName="admin_submission_rejected"
                    analyticsParams={{
                      submission_id: sub.id,
                      surface: "dashboard",
                    }}
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
