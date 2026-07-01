import { requireAdmin } from "@/lib/auth-utils";
import { db } from "@/lib/db";
import { getQueuesSummary, type QueueType } from "@/lib/admin/queues";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { StatCard } from "@/components/admin/stat-card";
import { formatRelativeTime } from "@/lib/utils";
import Link from "next/link";
import {
  Calendar,
  Store,
  ShoppingBag,
  MapPin,
  Mail,
  Users,
  Inbox,
  MessageSquare,
  ImageIcon,
  Flag,
  FileText,
  Plus,
  Settings,
  UserPlus,
  CheckCircle2,
  ArrowRight,
} from "lucide-react";

export const dynamic = "force-dynamic";

const QUEUE_LABELS: Record<QueueType, string> = {
  submission: "Submissions",
  review: "Reviews",
  photo: "Photos",
  report: "Reports",
  application: "Applications",
};

const QUEUE_ICONS: Record<QueueType, typeof Inbox> = {
  submission: Inbox,
  review: MessageSquare,
  photo: ImageIcon,
  report: Flag,
  application: FileText,
};

export default async function AdminOverviewPage() {
  await requireAdmin();
  const now = new Date();
  const startOfWeek = new Date(now);
  startOfWeek.setDate(now.getDate() - 7);

  const [
    totalEvents,
    publishedEvents,
    totalUsers,
    newUsersWeek,
    totalMarkets,
    totalVendors,
    totalVenues,
    totalSubscribers,
    queueSummary,
    recentSubmissions,
    recentReviews,
    recentUsers,
  ] = await Promise.all([
    db.event.count(),
    db.event.count({ where: { status: "PUBLISHED" } }),
    db.user.count(),
    db.user.count({ where: { createdAt: { gte: startOfWeek } } }),
    db.market.count(),
    db.vendorProfile.count(),
    db.venue.count(),
    db.subscriber.count(),
    getQueuesSummary(),
    db.submission.findMany({
      take: 5,
      orderBy: { createdAt: "desc" },
      select: { id: true, eventTitle: true, submitterName: true, createdAt: true },
    }),
    db.review.findMany({
      take: 5,
      orderBy: { createdAt: "desc" },
      include: { user: { select: { name: true, email: true } } },
    }),
    db.user.findMany({
      take: 5,
      orderBy: { createdAt: "desc" },
      select: { id: true, name: true, email: true, role: true, createdAt: true },
    }),
  ]);

  const pendingTotal = queueSummary.reduce((sum, q) => sum + q.count, 0);

  const metrics = [
    { label: "Published events", value: publishedEvents, sub: `of ${totalEvents} total`, icon: Calendar, href: "/admin/events" },
    { label: "Users", value: totalUsers, sub: newUsersWeek > 0 ? `+${newUsersWeek} this week` : "No new this week", icon: Users, href: "/admin/users" },
    { label: "Vendors", value: totalVendors, icon: ShoppingBag, href: "/admin/vendors" },
    { label: "Markets", value: totalMarkets, icon: Store, href: "/admin/markets" },
    { label: "Venues", value: totalVenues, icon: MapPin, href: "/admin/venues" },
    { label: "Subscribers", value: totalSubscribers, icon: Mail, href: "/admin/subscribers" },
  ];

  const activity = [
    ...recentSubmissions.map((s) => ({
      id: `sub-${s.id}`,
      at: s.createdAt,
      icon: Inbox,
      label: s.eventTitle,
      meta: `Submission · ${s.submitterName}`,
      href: "/admin/submissions",
    })),
    ...recentReviews.map((r) => ({
      id: `rev-${r.id}`,
      at: r.createdAt,
      icon: MessageSquare,
      label: `${r.rating}-star review`,
      meta: `Review · ${r.user?.name ?? r.user?.email ?? "Anonymous"}`,
      href: "/admin/reviews",
    })),
    ...recentUsers.map((u) => ({
      id: `usr-${u.id}`,
      at: u.createdAt,
      icon: UserPlus,
      label: u.name ?? u.email,
      meta: `New ${u.role.toLowerCase()}`,
      href: "/admin/users",
    })),
  ]
    .sort((a, b) => b.at.getTime() - a.at.getTime())
    .slice(0, 8);

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Overview"
        description="What needs you today, and how the market is doing."
        actions={
          <>
            <Button asChild size="sm">
              <Link href="/admin/events/new">
                <Plus className="mr-2 h-4 w-4" />
                Create event
              </Link>
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link href="/admin/markets/new">
                <Plus className="mr-2 h-4 w-4" />
                Create market
              </Link>
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link href="/admin/settings">
                <Settings className="mr-2 h-4 w-4" />
                Settings
              </Link>
            </Button>
          </>
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
            <CardTitle className="text-base font-semibold">
              Needs attention
              {pendingTotal > 0 && (
                <span className="ml-2 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                  {pendingTotal}
                </span>
              )}
            </CardTitle>
            <Link
              href="/admin/queues"
              className="flex items-center gap-1 text-sm text-primary hover:underline"
            >
              Review all
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </CardHeader>
          <CardContent className="pt-0">
            {pendingTotal === 0 ? (
              <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
                <CheckCircle2 className="h-5 w-5 text-primary" />
                You&apos;re all caught up. No pending items.
              </div>
            ) : (
              <ul className="divide-y divide-border">
                {queueSummary.map((q) => {
                  const Icon = QUEUE_ICONS[q.type];
                  const muted = q.count === 0;
                  return (
                    <li key={q.type}>
                      <Link
                        href={`/admin/queues?type=${q.type}`}
                        className="flex items-center gap-3 py-2.5 text-sm transition-colors hover:text-primary"
                      >
                        <Icon
                          className={muted ? "h-4 w-4 text-muted-foreground/60" : "h-4 w-4 text-muted-foreground"}
                        />
                        <span className={muted ? "text-muted-foreground" : "text-foreground"}>
                          {QUEUE_LABELS[q.type]}
                        </span>
                        {q.oldestAt && q.count > 0 && (
                          <span className="ml-auto text-xs text-muted-foreground">
                            oldest {formatRelativeTime(q.oldestAt)}
                          </span>
                        )}
                        <span
                          className={
                            muted
                              ? "ml-auto rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground"
                              : "rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary"
                          }
                        >
                          {q.count}
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        <div className="grid grid-cols-2 gap-3 lg:col-span-1 lg:content-start">
          {metrics.map((m) => (
            <StatCard
              key={m.label}
              label={m.label}
              value={m.value.toLocaleString()}
              sub={m.sub}
              icon={m.icon}
              href={m.href}
            />
          ))}
        </div>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
          <CardTitle className="text-base font-semibold">Recent activity</CardTitle>
          <Link
            href="/admin/audit-log"
            className="flex items-center gap-1 text-sm text-primary hover:underline"
          >
            Audit log
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </CardHeader>
        <CardContent className="pt-0">
          {activity.length === 0 ? (
            <p className="py-6 text-sm text-muted-foreground">No recent activity.</p>
          ) : (
            <ul className="divide-y divide-border">
              {activity.map((a) => {
                const Icon = a.icon;
                return (
                  <li key={a.id}>
                    <Link
                      href={a.href}
                      className="flex items-center gap-3 py-2.5 text-sm transition-colors hover:bg-muted/40 -mx-2 px-2 rounded-md"
                    >
                      <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <span className="min-w-0 truncate font-medium">{a.label}</span>
                      <span className="hidden shrink-0 text-muted-foreground sm:inline">
                        {a.meta}
                      </span>
                      <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                        {formatRelativeTime(a.at)}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
