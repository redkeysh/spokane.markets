import { redirect } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { headers } from "next/headers";
import type { ComponentType } from "react";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import {
  Heart,
  Shield,
  KeyRound,
  Calendar,
  Filter,
  Bookmark,
  Store,
  MapPin,
} from "lucide-react";
import { ProfileForm } from "@/components/profile-form";
import { DashboardHeaderCard } from "@/components/dashboard-header-card";
import { evaluateAndGrantBadges } from "@/lib/badges";
import { SITE_NAME } from "@/lib/constants";
import { PendingVerificationModal } from "@/components/pending-verification-modal";
import { VendorVerifiedBadge } from "@/components/vendor/vendor-verified-badge";
import { organizerAnyMarketWhere } from "@/lib/market-membership";
import { getAccountSummary } from "@/lib/account-summary";

export const dynamic = "force-dynamic";

export const metadata = {
  title: `My Account — ${SITE_NAME}`,
  description: "Your account dashboard.",
};

interface DashboardPageProps {
  searchParams: Promise<{ pendingVerification?: string }>;
}

const actionLinkClassName =
  "flex min-h-[44px] items-center gap-2 rounded-lg border border-border p-3 font-medium text-foreground transition-colors hover:bg-muted";
const compactActionLinkClassName =
  "inline-flex min-h-[44px] items-center rounded-lg border border-border bg-background px-3 py-2 text-sm font-medium transition-colors hover:bg-muted";

type ActionLinkProps = {
  href: string;
  label: string;
  icon?: ComponentType<{ className?: string }>;
};

function ActionLink({ href, label, icon: Icon }: ActionLinkProps) {
  return (
    <Link href={href} className={actionLinkClassName}>
      {Icon ? <Icon className="h-4 w-4" /> : null}
      {label}
    </Link>
  );
}

export default async function DashboardPage({ searchParams }: DashboardPageProps) {
  const session = await auth.api.getSession({ headers: await headers() });
  const params = await searchParams;
  const showPendingVerification = params.pendingVerification === "1";
  if (!session?.user) {
    redirect("/auth/signin");
  }

  await evaluateAndGrantBadges(session.user.id!);

  const user = await db.user.findUnique({
    where: { id: session.user.id! },
    include: {
      vendorProfile: true,
      userBadges: { include: { badge: true }, orderBy: { badge: { sortOrder: "asc" } } },
    },
  });
  if (!user) redirect("/auth/signin");

  const [favoriteVendors, organizerOwnedMarketsCount, organizerSubmittedEventsCount, summary] =
    await Promise.all([
      db.favoriteVendor.findMany({
      where: { userId: session.user.id! },
      include: { vendorProfile: true },
      orderBy: { createdAt: "desc" },
      take: 10,
    }),
    db.market.count({
      where: organizerAnyMarketWhere(session.user.id!),
    }),
    db.event.count({
      where: { submittedById: session.user.id! },
    }),
    getAccountSummary(session.user.id!, user.role),
  ]);
  const hasOrganizerOwnershipOrMembership =
    organizerOwnedMarketsCount > 0 || organizerSubmittedEventsCount > 0;
  const showFirstRunOnboarding = !user.vendorProfile && !hasOrganizerOwnershipOrMembership;
  const accountActions = [
    {
      href: "/auth/request-password-reset",
      label: "Change password",
      icon: KeyRound,
    },
    ...(user.role === "ADMIN"
      ? [{ href: "/admin", label: "Admin Dashboard", icon: Shield }]
      : []),
  ];
  const onboardingActions = [
    { href: "/vendor/profile/edit", label: "Create Vendor Profile" },
    { href: "/organizer/markets/new", label: "Create Market" },
    { href: "/events", label: "Browse Events" },
  ];

  return (
    <div className="mx-auto max-w-4xl space-y-8 px-4 py-8 sm:px-6 lg:px-8">
      <PendingVerificationModal
        emailVerified={user.emailVerified}
        showPendingVerification={showPendingVerification}
      />
      <div className="space-y-1">
        <h1 className="text-3xl font-bold tracking-tight">My Account</h1>
        <p className="text-sm text-muted-foreground">
          Overview of your saved items and roles. Edit profile above; password, export, and deletion
          live in{" "}
          <Link href="/account/settings" className="font-medium text-primary hover:underline">
            Account &amp; data
          </Link>
          .
        </p>
      </div>

      <DashboardHeaderCard
        user={{
          name: user.name,
          email: user.email,
          image: user.image,
          createdAt: user.createdAt,
          role: user.role,
        }}
        badges={(user.userBadges ?? []).map((ub) => ({
          slug: ub.badge.slug,
          name: ub.badge.name,
          icon: ub.badge.icon,
        }))}
      >
        <div className="space-y-4">
          <ProfileForm
            initialName={user.name}
            email={user.email}
            image={user.image}
            role={user.role}
            compact
          />
          <div className="space-y-2 border-t border-border pt-4">
            {accountActions.map((action) => (
              <ActionLink
                key={action.href}
                href={action.href}
                label={action.label}
                icon={action.icon}
              />
            ))}
          </div>
        </div>
      </DashboardHeaderCard>

      {showFirstRunOnboarding && (
        <Card className="mt-6 border-primary/30 bg-primary/5">
          <CardHeader>
            <CardTitle>Get started</CardTitle>
            <CardDescription>
              Pick your first step to set up your presence and discover opportunities.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-3">
            {onboardingActions.map((action) => (
              <Link key={action.href} href={action.href} className={compactActionLinkClassName}>
                {action.label}
              </Link>
            ))}
          </CardContent>
        </Card>
      )}

      <section aria-label="Account summary">
        <h2 className="sr-only">At a glance</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Link
            href="/account/saved?tab=rsvps"
            className="flex min-h-[88px] flex-col justify-center rounded-lg border border-border bg-card p-4 transition-colors hover:bg-muted"
          >
            <span className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <Calendar className="h-4 w-4 shrink-0" />
              Upcoming RSVPs
            </span>
            <span className="mt-1 text-2xl font-semibold tabular-nums">
              {summary.consumer.upcomingRsvpsCount}
            </span>
          </Link>
          <Link
            href="/account/saved?tab=filters"
            className="flex min-h-[88px] flex-col justify-center rounded-lg border border-border bg-card p-4 transition-colors hover:bg-muted"
          >
            <span className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <Filter className="h-4 w-4 shrink-0" />
              Saved filters
            </span>
            <span className="mt-1 text-2xl font-semibold tabular-nums">
              {summary.consumer.savedFiltersCount}
            </span>
          </Link>
          <Link
            href="/account/saved?tab=favorites"
            className="flex min-h-[88px] flex-col justify-center rounded-lg border border-border bg-card p-4 transition-colors hover:bg-muted"
          >
            <span className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <Bookmark className="h-4 w-4 shrink-0" />
              Favorite vendors
            </span>
            <span className="mt-1 text-2xl font-semibold tabular-nums">
              {summary.consumer.favoriteVendorsCount}
            </span>
          </Link>
          {summary.vendor && user.vendorProfile && (
            <Link
              href="/vendor/dashboard"
              className="flex min-h-[88px] flex-col justify-center rounded-lg border border-border bg-card p-4 transition-colors hover:bg-muted sm:col-span-2 lg:col-span-1"
            >
              <span className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                <Store className="h-4 w-4 shrink-0" />
                Vendor profile
              </span>
              <span className="mt-1 text-sm text-foreground">
                {summary.vendor.profileComplete
                  ? `${summary.vendor.profileCompletionPercent}% complete`
                  : "Finish your profile"}
              </span>
              <span className="text-xs text-muted-foreground">
                {summary.vendor.upcomingEventsCount} upcoming event
                {summary.vendor.upcomingEventsCount === 1 ? "" : "s"} linked
              </span>
            </Link>
          )}
          {summary.organizer && (
            <Link
              href="/organizer/dashboard"
              className="flex min-h-[88px] flex-col justify-center rounded-lg border border-border bg-card p-4 transition-colors hover:bg-muted sm:col-span-2 lg:col-span-3"
            >
              <span className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                <MapPin className="h-4 w-4 shrink-0" />
                Organizer
              </span>
              <span className="mt-1 text-sm text-foreground">
                {summary.organizer.marketsCount} market
                {summary.organizer.marketsCount === 1 ? "" : "s"} · {summary.organizer.eventsCount}{" "}
                event
                {summary.organizer.eventsCount === 1 ? "" : "s"}
                {summary.organizer.pendingReviewsCount > 0
                  ? ` · ${summary.organizer.pendingReviewsCount} review${
                      summary.organizer.pendingReviewsCount === 1 ? "" : "s"
                    } to moderate`
                  : ""}
              </span>
            </Link>
          )}
        </div>
      </section>

      <div className="flex flex-col gap-6 sm:gap-8">
        {/* Favorite Vendors */}
        <Card id="favorites" className="border-2 scroll-mt-8">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Heart className="h-5 w-5" />
                Favorite Vendors
              </CardTitle>
              <CardDescription>Vendors you follow for updates</CardDescription>
            </div>
            <Link
              href="/vendors"
              className={compactActionLinkClassName}
            >
              Browse Vendors
            </Link>
          </CardHeader>
          <CardContent>
            {favoriteVendors.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border p-6 text-center">
                <p className="text-muted-foreground">
                  No favorite vendors yet.{" "}
                  <Link href="/vendors" className="font-medium text-primary hover:underline">
                    Browse vendors
                  </Link>{" "}
                  and heart your favorites.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {favoriteVendors.map((fv) => (
                  <Link
                    key={fv.id}
                    href={`/vendors/${fv.vendorProfile.slug}`}
                    className="flex min-h-[44px] items-center gap-3 rounded-lg border border-border p-3 transition-colors hover:bg-muted"
                  >
                    {fv.vendorProfile.imageUrl ? (
                      <Image
                        src={fv.vendorProfile.imageUrl}
                        alt={`${fv.vendorProfile.businessName} logo`}
                        width={40}
                        height={40}
                        className="h-10 w-10 shrink-0 rounded-full object-cover"
                        unoptimized
                      />
                    ) : (
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/20 text-sm font-semibold text-primary">
                        {fv.vendorProfile.businessName.charAt(0)}
                      </div>
                    )}
                    <span className="flex flex-wrap items-center gap-1.5 font-medium">
                      {fv.vendorProfile.businessName}
                      <VendorVerifiedBadge status={fv.vendorProfile.verificationStatus} />
                    </span>
                  </Link>
                ))}
              </div>
            )}
            {favoriteVendors.length > 0 && (
              <Link
                href="/account/saved?tab=favorites"
                className="mt-3 inline-block text-sm text-primary hover:underline"
              >
                Manage all favorites →
              </Link>
            )}
          </CardContent>
        </Card>

      </div>
    </div>
  );
}
