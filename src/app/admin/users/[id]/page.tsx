import { requireAdmin } from "@/lib/auth-utils";
import { db } from "@/lib/db";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { UserRoleSelect } from "@/components/admin/user-role-select";
import { UserAccountStatusSelect } from "@/components/admin/user-account-status-select";
import { UserDeleteButton } from "@/components/admin/user-delete-button";
import { UserResetPasswordButton } from "@/components/admin/user-reset-password-button";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/utils";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Mail, Calendar, Shield, MessageSquare, Store } from "lucide-react";
import type { ModerationStatus } from "@prisma/client";

export const dynamic = "force-dynamic";

const statusVariant: Record<ModerationStatus, "outline" | "default" | "destructive"> = {
  PENDING: "outline",
  APPROVED: "default",
  REJECTED: "destructive",
};

const REVIEW_PREVIEW_LIMIT = 5;

export default async function AdminUserDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireAdmin();
  const { id } = await params;

  const user = await db.user.findUnique({
    where: { id },
    include: {
      vendorProfile: { select: { id: true } },
      _count: {
        select: {
          reviews: true,
          ownedMarkets: true,
          photos: true,
        },
      },
      reviews: {
        orderBy: { createdAt: "desc" },
        take: REVIEW_PREVIEW_LIMIT,
        include: {
          event: { select: { title: true } },
          market: { select: { name: true } },
        },
      },
    },
  });

  if (!user) {
    notFound();
  }

  const subscriber = user.email
    ? await db.subscriber.findUnique({ where: { email: user.email } })
    : null;
  const subscribed = !!subscriber;

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title={user.name ?? user.email ?? "User"}
        description={user.email ?? undefined}
        breadcrumbs={[
          { label: "Users", href: "/admin/users" },
          { label: "User" },
        ]}
        actions={
          <>
            <UserRoleSelect userId={user.id} currentRole={user.role} />
            <UserAccountStatusSelect
              userId={user.id}
              currentStatus={user.accountStatus}
            />
            <UserResetPasswordButton
              userId={user.id}
              userName={user.name}
              userEmail={user.email}
            />
            <UserDeleteButton
              userId={user.id}
              userName={user.name}
              userEmail={user.email}
              isCurrentUser={user.id === session.user.id}
            />
          </>
        }
      />

      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        <div className="rounded-lg border border-border p-4 space-y-2">
          <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <Calendar className="h-4 w-4" />
            Joined
          </div>
          <p className="text-foreground">
            {new Date(user.createdAt).toLocaleDateString("en-US", {
              weekday: "short",
              month: "short",
              day: "numeric",
              year: "numeric",
            })}
          </p>
        </div>

        <div className="rounded-lg border border-border p-4 space-y-2">
          <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <Shield className="h-4 w-4" />
            Role
          </div>
          <p className="text-foreground">{user.role}</p>
        </div>

        <div className="rounded-lg border border-border p-4 space-y-2">
          <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <Shield className="h-4 w-4" />
            Account status
          </div>
          <p className="text-foreground">{user.accountStatus}</p>
        </div>

        <div className="rounded-lg border border-border p-4 space-y-2">
          <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <Mail className="h-4 w-4" />
            Subscribed
          </div>
          <p className="text-foreground">{subscribed ? "Yes" : "No"}</p>
        </div>
      </div>

      <div className="grid gap-6 sm:grid-cols-2">
        <div className="rounded-lg border border-border p-4 space-y-2">
          <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <Store className="h-4 w-4" />
            Markets owned
          </div>
          <p className="text-foreground">
            {user._count.ownedMarkets > 0 ? (
              <Link
                href="/admin/markets"
                className="text-primary hover:underline"
              >
                {user._count.ownedMarkets}
              </Link>
            ) : (
              "0"
            )}
          </p>
        </div>

        <div className="rounded-lg border border-border p-4 space-y-2">
          <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <MessageSquare className="h-4 w-4" />
            Reviews
          </div>
          <p className="text-foreground">
            {user._count.reviews > 0 ? (
              <Link
                href={`/admin/reviews?user=${user.id}`}
                className="text-primary hover:underline"
              >
                {user._count.reviews}
              </Link>
            ) : (
              "0"
            )}
          </p>
        </div>
      </div>

      {user._count.reviews > 0 && (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold">Recent reviews</h2>
          <div className="space-y-3">
            {user.reviews.map((review) => (
              <div
                key={review.id}
                className="rounded-lg border border-border p-4 space-y-2"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-medium">
                      {"★".repeat(review.rating)}
                      {"☆".repeat(5 - review.rating)}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {review.event
                        ? `Event: ${review.event.title}`
                        : review.market
                          ? `Market: ${review.market.name}`
                          : "—"}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge variant={statusVariant[review.status]}>
                      {review.status}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {formatDate(review.createdAt)}
                    </span>
                  </div>
                </div>
                {review.text && (
                  <p className="text-sm line-clamp-2">{review.text}</p>
                )}
                <Link
                  href="/admin/reviews"
                  className="text-xs text-primary hover:underline"
                >
                  View in reviews queue →
                </Link>
              </div>
            ))}
          </div>
          {user._count.reviews > REVIEW_PREVIEW_LIMIT && (
            <Link
              href={`/admin/reviews?user=${user.id}`}
              className="text-sm text-primary hover:underline"
            >
              View all {user._count.reviews} reviews →
            </Link>
          )}
        </div>
      )}

      {(user._count.photos > 0 || user.vendorProfile != null) && (
        <div className="rounded-lg border border-border p-4 space-y-2">
          <h2 className="text-sm font-medium text-muted-foreground">
            Other activity
          </h2>
          <ul className="text-sm space-y-1">
            {user._count.photos > 0 && (
              <li>
                <Link href="/admin/photos" className="text-primary hover:underline">
                  {user._count.photos} photo(s)
                </Link>
              </li>
            )}
            {user.vendorProfile && (
              <li>
                <Link href="/admin/vendors" className="text-primary hover:underline">
                  Has vendor profile
                </Link>
              </li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
