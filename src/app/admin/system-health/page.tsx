import { requireAdmin } from "@/lib/auth-utils";
import { db } from "@/lib/db";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AdminPageHeader } from "@/components/admin/admin-page-header";

export const dynamic = "force-dynamic";

export default async function AdminSystemHealthPage() {
  await requireAdmin();

  const [
    pendingSubmissions,
    pendingReviews,
    pendingPhotos,
    pendingReports,
    pendingApplications,
    unreadNotifications,
  ] = await Promise.all([
    db.submission.count({ where: { status: "PENDING" } }),
    db.review.count({ where: { status: "PENDING" } }),
    db.photo.count({ where: { status: "PENDING" } }),
    db.report.count({ where: { status: "PENDING" } }),
    db.application.count({ where: { status: "PENDING" } }),
    db.notification.count({ where: { readAt: null } }),
  ]);

  const checks = [
    { label: "Pending submissions", value: pendingSubmissions },
    { label: "Pending reviews", value: pendingReviews },
    { label: "Pending photos", value: pendingPhotos },
    { label: "Pending reports", value: pendingReports },
    { label: "Pending applications", value: pendingApplications },
    { label: "Unread notifications", value: unreadNotifications },
  ];

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="System Health"
        description="Operational queue depth and admin-facing workload signals."
      />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {checks.map((check) => (
          <Card key={check.label}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {check.label}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{check.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

