import { requireAdmin } from "@/lib/auth-utils";
import { getQueueItems } from "@/lib/admin/queues";
import { TrackEventOnMount } from "@/components/analytics/track-event-on-mount";
import { QueueRow } from "@/components/admin/queue-row";
import { cn } from "@/lib/utils";
import Link from "next/link";
import type { QueueType } from "@/lib/admin/queues";
import { parseEnumParam } from "@/lib/admin/table-query";
import { AdminPageHeader } from "@/components/admin/admin-page-header";

const TABS: { label: string; value: QueueType | "all" }[] = [
  { label: "All", value: "all" },
  { label: "Submissions", value: "submission" },
  { label: "Reviews", value: "review" },
  { label: "Photos", value: "photo" },
  { label: "Reports", value: "report" },
  { label: "Applications", value: "application" },
];

const VIEW_ALL_HREFS: Record<QueueType, string> = {
  submission: "/admin/submissions?status=PENDING",
  review: "/admin/reviews?status=PENDING",
  photo: "/admin/photos?status=PENDING",
  report: "/admin/reports?status=PENDING",
  application: "/admin/applications?status=PENDING",
};

export const dynamic = "force-dynamic";

export default async function AdminQueuesPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; sort?: string }>;
}) {
  await requireAdmin();

  const params = await searchParams;
  const type =
    parseEnumParam(params.type, [
      "all",
      "submission",
      "review",
      "photo",
      "report",
      "application",
    ] as const) ?? "all";
  const sort = params.sort === "newest" ? "newest" : "oldest";

  const items = await getQueueItems({
    type,
    limit: 50,
    sort,
  });

  const activeTab = TABS.find((t) => t.value === type) ?? TABS[0];

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Queues"
        description="Pending items needing review. Click Review to open the workflow page."
      />
      <TrackEventOnMount
        eventName="admin_review_queue_view"
        params={{
          queue_type: type,
          sort,
          surface: "dashboard",
        }}
      />

      <div className="flex flex-wrap gap-2 border-b border-border pb-2">
        {TABS.map((tab) => (
          <Link
            key={tab.value}
            href={`/admin/queues?type=${tab.value}&sort=${sort}`}
            className={cn(
              "px-3 py-1.5 text-sm rounded-md transition-colors",
              activeTab.value === tab.value
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted"
            )}
          >
            {tab.label}
          </Link>
        ))}
        <Link
          href={`/admin/queues?type=${type}&sort=${sort === "oldest" ? "newest" : "oldest"}`}
          className="ml-auto px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted rounded-md transition-colors"
        >
          Sort: {sort === "oldest" ? "Newest first" : "Oldest first"}
        </Link>
      </div>

      <div className="space-y-4">
        {items.length === 0 ? (
          <p className="py-12 text-center text-muted-foreground">
            No pending items.
          </p>
        ) : (
          items.map((item) => <QueueRow key={`${item.type}-${item.id}`} item={item} />)
        )}
      </div>

      {items.length > 0 && type !== "all" && (
        <p className="text-sm text-muted-foreground">
          <Link
            href={VIEW_ALL_HREFS[type]}
            className="text-primary hover:underline"
          >
            View all in {TABS.find((t) => t.value === type)?.label} →
          </Link>
        </p>
      )}
    </div>
  );
}
