import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import {
  findEventBySlug,
  type EventForDisplay,
} from "@/lib/services/event-occurrence-service";
import { getBannerImages } from "@/lib/banner-images";
import { getSession } from "@/lib/auth-utils";
import {
  filterUpcomingScheduleDays,
  formatEventTimeFromSchedule,
  formatTime12hr,
  getDirectionsUrl,
} from "@/lib/utils";
import { TrackedExternalLink } from "@/components/analytics/tracked-external-link";
import { MapPreviewLazy as MapPreview } from "@/components/event/map-preview-lazy";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AttendanceToggle } from "@/components/attendance-toggle";
import { ReviewList } from "@/components/review-list";
import { WriteReviewButton } from "@/components/write-review-button";
import { EventShareDialog } from "@/components/event/event-share-dialog";
import { AddToCalendar } from "@/components/add-to-calendar";
import { ReportButton } from "@/components/report-button";
import { OfficialVendorRoster } from "@/components/vendor/official-vendor-roster";
import { SelfReportedVendorList } from "@/components/vendor/self-reported-vendor-list";
import { EventVendorActions } from "@/components/event-vendor-actions";
import { TrackEventView } from "@/components/track-content-view";
import { MediaFrame } from "@/components/media";
import { getParticipationConfig } from "@/lib/participation-config";
import { SITE_NAME } from "@/lib/constants";
import { organizerOnboardingDisplayEnabled } from "@/lib/feature-flags";
import { Globe, Facebook, Instagram, MapPin } from "lucide-react";

export const dynamic = "force-dynamic";

interface EventDetailPageProps {
  params: Promise<{ slug: string }>;
}

async function getEvent(slug: string): Promise<EventForDisplay | null> {
  return findEventBySlug(slug);
}

export async function generateMetadata({ params }: EventDetailPageProps): Promise<Metadata> {
  const { slug } = await params;
  const event = await getEvent(slug);

  if (!event) return { title: "Event Not Found" };

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const eventImage =
    event.imageUrl?.startsWith("http")
      ? event.imageUrl
      : event.imageUrl
        ? `${baseUrl}${event.imageUrl.startsWith("/") ? "" : "/"}${event.imageUrl}`
        : undefined;
  return {
    title: `${event.title} — ${(await import("@/lib/constants")).SITE_NAME}`,
    description:
      event.description?.slice(0, 160) ??
      `${event.title} at ${event.venue.name}. Find details, directions, and more on ${SITE_NAME}.`,
    alternates: { canonical: `${baseUrl}/events/${slug}` },
    openGraph: {
      title: event.title,
      description: event.description?.slice(0, 160) ?? undefined,
      images: eventImage ? [{ url: eventImage }] : undefined,
    },
    twitter: {
      card: "summary_large_image",
      title: event.title,
      description: event.description?.slice(0, 160) ?? undefined,
      images: eventImage ? [{ url: eventImage }] : undefined,
    },
  };
}

export default async function EventDetailPage({ params }: EventDetailPageProps) {
  const { slug } = await params;
  const [event, banners] = await Promise.all([getEvent(slug), getBannerImages()]);

  if (!event || event.status !== "PUBLISHED") {
    notFound();
  }

  const fullAddress = `${event.venue.address}, ${event.venue.city}, ${event.venue.state} ${event.venue.zip}`;
  const directionsUrl = getDirectionsUrl(fullAddress);

  const session = await getSession();
  const vendorProfile = session?.user
    ? await db.vendorProfile.findFirst({
        where: { userId: session.user.id!, deletedAt: null },
        select: { id: true },
      })
    : null;

  const [goingCount, interestedCount, userAttendance, userIntent] = await Promise.all([
    db.attendance.count({ where: { eventId: event.id, status: "GOING" } }),
    db.attendance.count({ where: { eventId: event.id, status: "INTERESTED" } }),
    session?.user
      ? db.attendance.findUnique({
          where: { userId_eventId: { userId: session.user.id!, eventId: event.id } },
        })
      : Promise.resolve(null),
    session?.user && vendorProfile
      ? db.eventVendorIntent.findUnique({
          where: {
            eventId_vendorProfileId: {
              eventId: event.id,
              vendorProfileId: vendorProfile.id,
            },
          },
        })
      : Promise.resolve(null),
  ]);

  const participationConfig = getParticipationConfig(event);

  const officialVendors = event.vendorRoster.map((r) => r.vendorProfile);

  const officialIds = new Set(officialVendors.map((v) => v.id));
  const linkedVendors = event.vendorEvents
    .map((link) => link.vendorProfile)
    .filter((vendor) => !officialIds.has(vendor.id));
  const linkedIds = new Set(linkedVendors.map((vendor) => vendor.id));
  const selfReportIntents = event.vendorIntents.filter(
    (i) => !officialIds.has(i.vendorProfile.id) && !linkedIds.has(i.vendorProfile.id)
  );
  const publicSelfReportedVendors = selfReportIntents
    .filter((i) => i.visibility === "PUBLIC")
    .map((i) => i.vendorProfile);
  const publicSelfReportedById = new Map<string, (typeof publicSelfReportedVendors)[number]>();
  for (const vendor of [...linkedVendors, ...publicSelfReportedVendors]) {
    publicSelfReportedById.set(vendor.id, vendor);
  }
  const visibleSelfReportedVendors = [...publicSelfReportedById.values()];
  const privateSelfReportedCount = selfReportIntents.filter((i) => i.visibility === "PRIVATE").length;
  const selfReportedTotal = visibleSelfReportedVendors.length + privateSelfReportedCount;

  const rosterVisible =
    participationConfig.publicRosterEnabled &&
    (officialVendors.length > 0 || participationConfig.vendorCapacity != null);
  const selfReportedVisible =
    participationConfig.publicIntentListEnabled && selfReportedTotal > 0;
  const showVendorsSection = rosterVisible || selfReportedVisible;
  const upcomingScheduleDays = filterUpcomingScheduleDays(event.scheduleDays, {
    timeZone: "America/Los_Angeles",
  });

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const eventUrl = `${baseUrl}/events/${event.slug}`;
  const eventImage = event.imageUrl
    ? event.imageUrl.startsWith("http")
      ? event.imageUrl
      : `${baseUrl}${event.imageUrl.startsWith("/") ? "" : "/"}${event.imageUrl}`
    : undefined;

  const eventJsonLd = {
    "@context": "https://schema.org",
    "@type": "Event",
    name: event.title,
    description: event.description ?? undefined,
    startDate: event.startDate.toISOString(),
    endDate: event.endDate.toISOString(),
    eventStatus: "https://schema.org/EventScheduled",
    url: eventUrl,
    image: eventImage,
    location: {
      "@type": "Place",
      name: event.venue.name,
      address: {
        "@type": "PostalAddress",
        streetAddress: event.venue.address,
        addressLocality: event.venue.city,
        addressRegion: event.venue.state,
        postalCode: event.venue.zip,
      },
    },
    organizer: {
      "@type": "Organization",
      name: event.market?.name ?? event.venue.name,
    },
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 lg:px-8">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(eventJsonLd) }}
      />
      <TrackEventView
        eventId={event.id}
        category={event.tags[0]?.slug}
        neighborhood={event.venue.neighborhood ?? undefined}
      />
      <nav className="mb-6 text-sm text-muted-foreground">
        <Link href="/events" className="transition-colors hover:text-primary">
          Events
        </Link>
        <span className="mx-2">·</span>
        <span className="text-foreground">{event.title}</span>
      </nav>

      <div className="relative mb-6 overflow-hidden rounded-xl ring-1 ring-border sm:mb-8">
        {/* 16:9 matches `getCropPresetForBanner()` / ImageUploadWithUrl aspectRatio="banner" */}
        {event.imageUrl ? (
          <MediaFrame
            src={event.imageUrl}
            alt={event.title}
            aspect="16/9"
            focalX={event.imageFocalX ?? 50}
            focalY={event.imageFocalY ?? 50}
            sizes="(max-width: 1152px) 100vw, 1152px"
            priority
            objectFit="contain"
            className="bg-muted"
          />
        ) : (
          <MediaFrame
            src={banners.events.url}
            alt={event.title}
            aspect="16/9"
            focalX={banners.events.focalX}
            focalY={banners.events.focalY}
            sizes="(max-width: 1152px) 100vw, 1152px"
            priority
            className="bg-muted"
          />
        )}
        <div className="relative border-t border-border bg-background/95 px-4 py-4 sm:px-6 sm:py-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
            <h1 className="min-w-0 flex-1 font-sans text-2xl font-extrabold tracking-tight text-foreground sm:text-3xl lg:text-4xl">
              {event.title}
            </h1>
            <EventShareDialog
              eventId={event.id}
              title={event.title}
              description={event.description}
              shareUrl={eventUrl}
              analyticsParams={{
                event_id: event.id,
                surface: "detail_page",
              }}
              triggerClassName="shrink-0 self-end sm:self-start"
            />
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-8 lg:flex-row lg:items-start lg:gap-10">
        {/* Main content */}
        <div className="min-w-0 flex-1">
          {event.description && (
            <div className="mt-6">
              <h2 className="text-lg font-semibold text-foreground">About this event</h2>
              <p className="mt-2 text-base leading-relaxed text-foreground whitespace-pre-line">
                {event.description}
              </p>
            </div>
          )}

          {organizerOnboardingDisplayEnabled() && event.shortDescription?.trim() && (
            <div className="mt-6">
              <h2 className="text-lg font-semibold text-foreground">At a glance</h2>
              <p className="mt-2 text-base leading-relaxed text-muted-foreground whitespace-pre-line">
                {event.shortDescription}
              </p>
            </div>
          )}

          {vendorProfile &&
            organizerOnboardingDisplayEnabled() &&
            (event.feeModelVendor?.trim() ||
              event.boothLogistics?.trim() ||
              event.cancellationPolicy?.trim() ||
              event.paymentMethodsPublic) && (
              <details className="mt-6 rounded-lg border border-border bg-muted/20 p-4">
                <summary className="cursor-pointer text-sm font-semibold">
                  Vendor logistics &amp; economics
                </summary>
                <div className="mt-3 space-y-3 text-sm text-muted-foreground">
                  {event.feeModelVendor?.trim() && (
                    <div>
                      <p className="font-medium text-foreground">Fees</p>
                      <p className="mt-1 whitespace-pre-line">{event.feeModelVendor}</p>
                    </div>
                  )}
                  {event.boothLogistics?.trim() && (
                    <div>
                      <p className="font-medium text-foreground">Booth / load-in</p>
                      <p className="mt-1 whitespace-pre-line">{event.boothLogistics}</p>
                    </div>
                  )}
                  {event.cancellationPolicy?.trim() && (
                    <div>
                      <p className="font-medium text-foreground">Cancellation</p>
                      <p className="mt-1 whitespace-pre-line">{event.cancellationPolicy}</p>
                    </div>
                  )}
                  {event.paymentMethodsPublic != null && (
                    <div>
                      <p className="font-medium text-foreground">Payments (summary)</p>
                      <pre className="mt-1 max-h-40 overflow-auto rounded bg-background p-2 text-xs">
                        {JSON.stringify(event.paymentMethodsPublic, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              </details>
            )}

          {(event.websiteUrl || event.facebookUrl || event.instagramUrl) && (
            <div className="mt-6 flex flex-wrap gap-3">
              {event.websiteUrl && (
                <Button variant="outline" size="sm" asChild>
                  <a
                    href={event.websiteUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5"
                  >
                    <Globe className="h-4 w-4" />
                    Website
                  </a>
                </Button>
              )}
              {event.facebookUrl && (
                <Button
                  size="sm"
                  asChild
                  className="border-0 bg-[#1877F2] text-white hover:bg-[#166fe5] focus-visible:ring-[#1877F2]"
                >
                  <a
                    href={event.facebookUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5"
                  >
                    <Facebook className="h-4 w-4" />
                    Facebook
                  </a>
                </Button>
              )}
              {event.instagramUrl && (
                <Button
                  size="sm"
                  asChild
                  className="border-0 bg-gradient-to-r from-[#f58529] via-[#dd2a7b] to-[#8134af] text-white hover:brightness-95 focus-visible:ring-[#dd2a7b]"
                >
                  <a
                    href={event.instagramUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5"
                  >
                    <Instagram className="h-4 w-4" />
                    Instagram
                  </a>
                </Button>
              )}
            </div>
          )}

          {showVendorsSection ? (
            <section className="mt-10 rounded-xl border border-border bg-muted/20 p-5">
              <h2 className="text-lg font-semibold text-foreground">Vendors</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Official listings are organizer-verified; self-reported attendance is not confirmed by the host.
              </p>
              <div className="mt-4 space-y-6">
                {rosterVisible ? (
                  <OfficialVendorRoster
                    vendors={officialVendors}
                    capacity={participationConfig.vendorCapacity}
                    publicRosterEnabled={participationConfig.publicRosterEnabled}
                  />
                ) : null}
                {selfReportedVisible ? (
                  <SelfReportedVendorList
                    publicVendors={visibleSelfReportedVendors}
                    privateVendorCount={privateSelfReportedCount}
                    showNames={participationConfig.publicIntentNamesEnabled}
                  />
                ) : null}
              </div>
            </section>
          ) : null}

          <div className="mt-10">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold">Reviews</h2>
              <WriteReviewButton eventId={event.id} isLoggedIn={!!session?.user} callbackUrl={`/events/${event.slug}`} />
            </div>
            <ReviewList eventId={event.id} isLoggedIn={!!session?.user} />
          </div>
        </div>

        {/* Sidebar */}
        <aside className="w-full shrink-0 lg:w-80 lg:sticky lg:top-24">
          <div className="space-y-4 rounded-lg border border-border bg-muted/30 p-5">
            <div>
              <p className="text-sm font-medium text-muted-foreground">When</p>
              <p className="mt-0.5 text-lg font-semibold text-foreground">
                {upcomingScheduleDays.length ? (
                  formatEventTimeFromSchedule(upcomingScheduleDays)
                ) : (
                  "No upcoming dates scheduled"
                )}
              </p>
              {upcomingScheduleDays.length > 1 && (
                <details open className="mt-3 rounded-lg border border-border bg-background">
                  <summary className="cursor-pointer px-3 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wide hover:bg-muted/50">
                    Schedule ({upcomingScheduleDays.length} days)
                  </summary>
                  <ul className="space-y-1.5 border-t border-border px-3 py-2 text-sm">
                    {upcomingScheduleDays.map((d) => (
                      <li
                        key={d.id}
                        className="flex justify-between gap-2 text-foreground"
                      >
                        <span>
                          {new Intl.DateTimeFormat("en-US", {
                            weekday: "short",
                            month: "short",
                            day: "numeric",
                            timeZone: "UTC",
                          }).format(d.date)}
                        </span>
                        <span className="text-muted-foreground">
                          {d.allDay
                            ? "All day"
                            : `${formatTime12hr(d.startTime)} – ${formatTime12hr(d.endTime)}`}
                        </span>
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </div>

            <div>
              <p className="text-sm font-medium text-muted-foreground">Where</p>
              <p className="mt-0.5 font-semibold text-foreground">{event.venue.name}</p>
              <p className="mt-0.5 text-sm text-foreground">{fullAddress}</p>
              <MapPreview
                lat={event.venue.lat}
                lng={event.venue.lng}
                address={fullAddress}
                className="mt-2"
                analyticsEventName="event_map_click"
                analyticsParams={{
                  event_id: event.id,
                  surface: "detail_page",
                }}
              />
              {event.venue.parkingNotes && (
                <p className="mt-1 text-sm text-muted-foreground">
                  🅿️ {event.venue.parkingNotes}
                </p>
              )}
            </div>

            {event.market && (
              <div>
                <p className="text-sm font-medium text-muted-foreground">Part of</p>
                <Link
                  href={`/markets/${event.market.slug}`}
                  className="mt-0.5 block font-semibold text-primary hover:underline"
                >
                  {event.market.name}
                </Link>
              </div>
            )}

            <div className="flex flex-wrap items-stretch gap-2">
              <Button size="sm" variant="outline" className="min-h-[44px] shrink-0 inline-flex items-center gap-1.5" asChild>
                <TrackedExternalLink
                  href={directionsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  eventName="event_get_directions_click"
                  eventParams={{
                    event_id: event.id,
                    surface: "detail_page",
                  }}
                  className="inline-flex items-center gap-1.5"
                >
                  <MapPin className="h-4 w-4 shrink-0 stroke-[1.5] text-foreground" aria-hidden />
                  Get Directions
                </TrackedExternalLink>
              </Button>
              <AddToCalendar
                event={{
                  id: event.id,
                  title: event.title,
                  slug: event.slug,
                  description: event.description,
                  startDate: event.startDate,
                  endDate: event.endDate,
                }}
                venue={event.venue}
                eventPageUrl={eventUrl}
              />
            </div>

            <EventVendorActions
              eventId={event.id}
              config={participationConfig}
              isLoggedIn={!!session?.user}
              hasVendorProfile={!!vendorProfile}
              userIntent={userIntent?.status ?? null}
              callbackUrl={`/events/${event.slug}`}
            />

            <AttendanceToggle
              eventId={event.id}
              slug={event.slug}
              initialGoingCount={goingCount}
              initialInterestedCount={interestedCount}
              initialUserStatus={userAttendance?.status ?? null}
              isLoggedIn={!!session?.user}
              callbackUrl={`/events/${event.slug}`}
            />

            {event.tags.length > 0 && (
              <div>
                <p className="text-sm font-medium text-muted-foreground">Tags</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {event.tags.map((tag) => (
                    <Badge key={tag.id} variant="secondary">
                      {tag.name}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {event.features.length > 0 && (
              <div>
                <p className="text-sm font-medium text-muted-foreground">Features &amp; amenities</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {event.features.map((feature) => (
                    <Badge key={feature.id} variant="outline">
                      {feature.icon && <span className="mr-0.5">{feature.icon}</span>}
                      {feature.name}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            <ReportButton
              targetType="EVENT"
              targetId={event.id}
              isLoggedIn={!!session?.user}
            />
          </div>
        </aside>
      </div>
    </div>
  );
}
