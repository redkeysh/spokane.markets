import type { Metadata } from "next";
import Link from "next/link";
import { requireAuth } from "@/lib/auth-utils";
import { db } from "@/lib/db";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { FilterDeleteButton } from "@/app/settings/filters/filter-delete-button";
import { FavoriteVendorButton } from "@/components/vendor/favorite-vendor-button";
import { VendorSocialLinks } from "@/components/vendor-social-links";
import { EventTimeLabel } from "@/components/event/event-time-label";
import { SavedPageTabs } from "./saved-page-tabs";
import { CheckCircle2, Star } from "lucide-react";
import { SITE_NAME } from "@/lib/constants";
import { VendorVerifiedBadge } from "@/components/vendor/vendor-verified-badge";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: `Saved — ${SITE_NAME}`,
  description: "Your saved filters, RSVPs, and favorite vendors.",
};

type Tab = "filters" | "rsvps" | "favorites";

// Bound each saved list so a power user's account can't trigger an unbounded
// fetch on every page load. Generous enough to cover realistic usage.
const SAVED_LIST_LIMIT = 200;

export default async function AccountSavedPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const session = await requireAuth("/account/saved");
  const params = await searchParams;
  const tab = (params.tab === "filters" || params.tab === "rsvps" || params.tab === "favorites"
    ? params.tab
    : "filters") as Tab;

  const [filters, attendances, favorites] = await Promise.all([
    db.savedFilter.findMany({
      where: { userId: session.user.id },
      orderBy: { createdAt: "desc" },
      take: SAVED_LIST_LIMIT,
    }),
    db.attendance.findMany({
      where: { userId: session.user.id },
      include: {
        event: {
          include: { venue: true },
        },
      },
      orderBy: { createdAt: "desc" },
      take: SAVED_LIST_LIMIT,
    }),
    db.favoriteVendor.findMany({
      where: { userId: session.user.id },
      include: {
        vendorProfile: {
          include: { _count: { select: { vendorEvents: true } } },
        },
      },
      orderBy: { createdAt: "desc" },
      take: SAVED_LIST_LIMIT,
    }),
  ]);

  const now = new Date();
  const upcomingRsvps = attendances.filter(
    (a) => a.event.startDate >= now && a.event.status === "PUBLISHED"
  );
  const pastRsvps = attendances.filter(
    (a) => a.event.startDate < now || a.event.status !== "PUBLISHED"
  );

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-3xl font-bold tracking-tight">Saved</h1>
      <p className="mt-1 text-muted-foreground">
        Your saved filters, event RSVPs, and favorite vendors.
      </p>

      <SavedPageTabs activeTab={tab} />

      {tab === "filters" && (
        <div className="mt-6">
          {filters.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border py-12 text-center">
              <p className="text-lg font-medium">No saved filters yet</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Browse{" "}
                <Link href="/events" className="text-primary hover:underline">
                  events
                </Link>{" "}
                and save a filter to get started.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {filters.map((filter) => {
                const filterParams = new URLSearchParams();
                if (filter.dateRange) filterParams.set("dateRange", filter.dateRange);
                if (filter.neighborhoods[0])
                  filterParams.set("neighborhood", filter.neighborhoods[0]);
                if (filter.categories[0])
                  filterParams.set("category", filter.categories[0]);
                if (filter.features[0])
                  filterParams.set("feature", filter.features[0]);

                const summaryParts: string[] = [];
                if (filter.dateRange) summaryParts.push(filter.dateRange);
                if (filter.neighborhoods.length)
                  summaryParts.push(filter.neighborhoods.join(", "));
                if (filter.categories.length)
                  summaryParts.push(filter.categories.join(", "));
                if (filter.features.length)
                  summaryParts.push(filter.features.join(", "));

                return (
                  <Card key={filter.id}>
                    <CardContent className="flex items-center justify-between gap-4 p-4">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <Link
                            href={`/events?${filterParams.toString()}`}
                            className="font-medium transition-colors hover:text-primary"
                          >
                            {filter.name}
                          </Link>
                          {filter.emailAlerts && (
                            <Badge variant="outline">Email Alerts</Badge>
                          )}
                        </div>
                        {summaryParts.length > 0 && (
                          <p className="mt-0.5 truncate text-sm text-muted-foreground">
                            {summaryParts.join(" · ")}
                          </p>
                        )}
                      </div>
                      <FilterDeleteButton filterId={filter.id} />
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      )}

      {tab === "rsvps" && (
        <div className="mt-6">
          {attendances.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border py-12 text-center">
              <p className="text-lg font-medium">No upcoming RSVPs</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Find{" "}
                <Link href="/events" className="text-primary hover:underline">
                  events
                </Link>{" "}
                and mark Going or Interested!
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {upcomingRsvps.length > 0 && (
                <>
                  <h3 className="text-sm font-medium text-muted-foreground">
                    Upcoming
                  </h3>
                  {upcomingRsvps.map((a) => (
                    <Card key={a.id}>
                      <CardContent className="p-4">
                        <Link
                          href={`/events/${a.event.slug}`}
                          className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between"
                        >
                          <div>
                            <span className="font-medium">{a.event.title}</span>
                            <span className="ml-2">
                              <EventTimeLabel
                                startDate={a.event.startDate}
                                endDate={a.event.endDate}
                              />
                            </span>
                          </div>
                          <Badge
                            variant={
                              a.status === "GOING" ? "default" : "secondary"
                            }
                            className="w-fit"
                          >
                            {a.status === "GOING" ? (
                              <>
                                <CheckCircle2 className="mr-1 h-3 w-3" /> Going
                              </>
                            ) : (
                              <>
                                <Star className="mr-1 h-3 w-3" /> Interested
                              </>
                            )}
                          </Badge>
                        </Link>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {a.event.venue.name}
                        </p>
                      </CardContent>
                    </Card>
                  ))}
                </>
              )}
              {pastRsvps.length > 0 && (
                <>
                  <h3 className="mt-6 text-sm font-medium text-muted-foreground">
                    Past
                  </h3>
                  {pastRsvps.map((a) => (
                    <Card key={a.id}>
                      <CardContent className="p-4">
                        <Link
                          href={`/events/${a.event.slug}`}
                          className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between"
                        >
                          <div>
                            <span className="font-medium">{a.event.title}</span>
                            <span className="ml-2">
                              <EventTimeLabel
                                startDate={a.event.startDate}
                                endDate={a.event.endDate}
                              />
                            </span>
                          </div>
                          <Badge variant="outline" className="w-fit">
                            {a.status === "GOING" ? "Went" : "Interested"}
                          </Badge>
                        </Link>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {a.event.venue.name}
                        </p>
                      </CardContent>
                    </Card>
                  ))}
                </>
              )}
            </div>
          )}
        </div>
      )}

      {tab === "favorites" && (
        <div className="mt-6">
          {favorites.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border py-12 text-center">
              <p className="text-lg font-medium">No favorite vendors yet</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Browse{" "}
                <Link href="/vendors" className="text-primary hover:underline">
                  vendors
                </Link>{" "}
                and heart your favorites!
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {favorites.map((fav) => (
                <Card key={fav.id}>
                  <CardContent className="flex items-start justify-between gap-4 p-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Link
                          href={`/vendors/${fav.vendorProfile.slug}`}
                          className="flex flex-wrap items-center gap-1.5 font-medium transition-colors hover:text-primary"
                        >
                          {fav.vendorProfile.businessName}
                          <VendorVerifiedBadge status={fav.vendorProfile.verificationStatus} />
                        </Link>
                        {fav.emailAlerts && (
                          <Badge variant="outline">Email Alerts</Badge>
                        )}
                        {fav.vendorProfile._count.vendorEvents > 0 && (
                          <Badge variant="secondary">
                            {fav.vendorProfile._count.vendorEvents} event
                            {fav.vendorProfile._count.vendorEvents !== 1
                              ? "s"
                              : ""}
                          </Badge>
                        )}
                      </div>
                      {fav.vendorProfile.specialties && (
                        <p className="mt-0.5 truncate text-sm text-muted-foreground">
                          {fav.vendorProfile.specialties}
                        </p>
                      )}
                      <VendorSocialLinks
                        vendorId={fav.vendorProfile.slug}
                        websiteUrl={fav.vendorProfile.websiteUrl}
                        facebookUrl={fav.vendorProfile.facebookUrl}
                        instagramUrl={fav.vendorProfile.instagramUrl}
                        iconOnly
                        className="mt-2"
                      />
                    </div>
                    <FavoriteVendorButton
                      slug={fav.vendorProfile.slug}
                      initialFavorited
                      initialEmailAlerts={fav.emailAlerts}
                    />
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
