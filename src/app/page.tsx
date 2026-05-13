import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { db } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { EventCard } from "@/components/event/event-card";
import { FeaturedEventCard } from "@/components/event/featured-event-card";
import { VendorOfWeekCard } from "@/components/vendor/vendor-of-week-card";
import { Input } from "@/components/ui/input";
import { getBannerImages } from "@/lib/banner-images";
import {
  filterUpcomingScheduleDays,
  formatDateOnlyUTC,
  getDateOnlyInTimezone,
  isBannerUnoptimized,
} from "@/lib/utils";
import { SITE_NAME } from "@/lib/constants";
import { HomeScrollDepth } from "@/components/analytics/home-scroll-depth";
import { getVendorOfWeek } from "@/lib/vendor-of-week";
import { getAttendanceCountsByEventIds } from "@/lib/attendance-counts";
import { getVendorParticipationCountsByEventIds } from "@/lib/event-vendor-participation-count";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Find Local Farmers Markets & Events This Week",
  description:
    "Discover farmers markets, craft fairs, and community events in Spokane. Browse this week's markets, plan ahead, and never miss a local event.",
};

const PACIFIC_TZ = "America/Los_Angeles";
const MAX_WEEK_EVENTS = 12;
const MAX_PLAN_AHEAD_EVENTS = 6;

function addDaysToDateOnly(dateOnly: string, days: number): string {
  const d = new Date(`${dateOnly}T12:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return formatDateOnlyUTC(d);
}

function sortByFirstUpcomingDay<T extends { title: string; scheduleDays: Array<{ date: Date }> }>(
  items: T[]
): T[] {
  return [...items].sort((a, b) => {
    const aFirst = formatDateOnlyUTC(a.scheduleDays[0].date);
    const bFirst = formatDateOnlyUTC(b.scheduleDays[0].date);
    if (aFirst < bFirst) return -1;
    if (aFirst > bFirst) return 1;
    return a.title.localeCompare(b.title);
  });
}

export default async function HomePage() {
  const banners = await getBannerImages();
  const today = getDateOnlyInTimezone(new Date(), PACIFIC_TZ);
  const weekStartDate = today;
  const weekEndExclusiveDate = addDaysToDateOnly(today, 7);
  const planAheadStartDate = addDaysToDateOnly(today, 14);
  const planAheadEndExclusiveDate = addDaysToDateOnly(today, 29);

  const [promotionsRaw, weekCandidatesRaw, planAheadCandidatesRaw, vendorOfWeek] = await Promise.all([
    db.promotion.findMany({
      where: {
        eventId: { not: null },
        startDate: { lte: new Date() },
        endDate: { gte: new Date() },
        event: { status: "PUBLISHED", deletedAt: null },
      },
      include: {
        event: {
          include: {
            venue: true,
            tags: true,
            features: true,
            _count: { select: { vendorEvents: true } },
            scheduleDays: { orderBy: { date: "asc" } },
          },
        },
      },
      orderBy: [{ sortOrder: "asc" }, { startDate: "asc" }],
      take: 24,
    }),
    db.event.findMany({
      where: {
        status: "PUBLISHED",
        deletedAt: null,
        endDate: { gte: new Date() },
      },
      include: {
        venue: true,
        tags: true,
        features: true,
        _count: { select: { vendorEvents: true } },
        scheduleDays: { orderBy: { date: "asc" } },
      },
      orderBy: { updatedAt: "desc" },
      take: 96,
    }),
    db.event.findMany({
      where: {
        status: "PUBLISHED",
        deletedAt: null,
        endDate: { gte: new Date() },
      },
      include: {
        venue: true,
        tags: true,
        features: true,
        _count: { select: { vendorEvents: true } },
        scheduleDays: { orderBy: { date: "asc" } },
      },
      orderBy: { updatedAt: "desc" },
      take: 96,
    }),
    getVendorOfWeek(),
  ]);

  const promotions = promotionsRaw
    .map((promotion) => {
      if (!promotion.event) return null;
      const scheduleDays = filterUpcomingScheduleDays(promotion.event.scheduleDays, {
        timeZone: PACIFIC_TZ,
      });
      if (!scheduleDays.length) return null;
      return {
        ...promotion,
        event: {
          ...promotion.event,
          scheduleDays,
        },
      };
    })
    .filter((promotion): promotion is NonNullable<typeof promotion> => promotion !== null)
    .sort((a, b) => {
      const aFirst = formatDateOnlyUTC(a.event.scheduleDays[0].date);
      const bFirst = formatDateOnlyUTC(b.event.scheduleDays[0].date);
      if (aFirst < bFirst) return -1;
      if (aFirst > bFirst) return 1;
      return a.event.title.localeCompare(b.event.title);
    })
    .slice(0, 5);

  const weekEvents = sortByFirstUpcomingDay(
    weekCandidatesRaw
      .map((event) => {
        const upcomingScheduleDays = filterUpcomingScheduleDays(event.scheduleDays, {
          timeZone: PACIFIC_TZ,
        }).filter((day) => {
          const dayDate = formatDateOnlyUTC(day.date);
          return dayDate >= weekStartDate && dayDate < weekEndExclusiveDate;
        });
        if (!upcomingScheduleDays.length) return null;
        return {
          ...event,
          scheduleDays: upcomingScheduleDays,
        };
      })
      .filter((event): event is NonNullable<typeof event> => event !== null)
  ).slice(0, MAX_WEEK_EVENTS);

  const planAheadEvents = sortByFirstUpcomingDay(
    planAheadCandidatesRaw
      .map((event) => {
        const upcomingScheduleDays = filterUpcomingScheduleDays(event.scheduleDays, {
          timeZone: PACIFIC_TZ,
        }).filter((day) => {
          const dayDate = formatDateOnlyUTC(day.date);
          return dayDate >= planAheadStartDate && dayDate < planAheadEndExclusiveDate;
        });
        if (!upcomingScheduleDays.length) return null;
        return {
          ...event,
          scheduleDays: upcomingScheduleDays,
        };
      })
      .filter((event): event is NonNullable<typeof event> => event !== null)
  ).slice(0, MAX_PLAN_AHEAD_EVENTS);

  const eventIdsForAttendance = new Set<string>();
  for (const e of weekEvents) eventIdsForAttendance.add(e.id);
  for (const e of planAheadEvents) eventIdsForAttendance.add(e.id);
  for (const p of promotions) {
    if (p.event) eventIdsForAttendance.add(p.event.id);
  }
  const [attendanceMap, vendorParticipationMap] = await Promise.all([
    getAttendanceCountsByEventIds([...eventIdsForAttendance]),
    getVendorParticipationCountsByEventIds([...eventIdsForAttendance]),
  ]);

  return (
    <>
      <HomeScrollDepth />
      {/* Hero with community imagery */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0">
          <Image
            src={banners.hero.url}
            alt="Local farmers market"
            fill
            className="object-cover"
            style={{ objectPosition: banners.hero.objectPosition }}
            priority
            sizes="100vw"
            unoptimized={isBannerUnoptimized(banners.hero.url)}
          />
          <div className="absolute inset-0 bg-gradient-to-b from-black/50 via-black/30 to-background" />
        </div>
        <div className="relative mx-auto max-w-4xl px-4 py-20 md:py-28 text-center">
          <h1 className="text-4xl font-bold tracking-tight text-white drop-shadow-md md:text-5xl lg:text-6xl">
            Discover {SITE_NAME}
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-white/90 drop-shadow-sm">
            Find markets, craft fairs, and local events across Spokane. Never
            miss a local market again.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
            <Button size="lg" asChild className="shadow-lg">
              <Link href="/events" prefetch={false}>View Upcoming Events</Link>
            </Button>
            <Button size="lg" variant="secondary" asChild className="bg-background/90 text-foreground hover:bg-background shadow-lg border border-border/50">
              <Link href="/vendors" prefetch={false}>Browse Vendors</Link>
            </Button>
          </div>
        </div>
      </section>

      {/* Featured / Sponsored */}
      {promotions.length > 0 && (
        <section className="mx-auto max-w-6xl px-4 py-12 md:py-16">
          <div className="mb-8">
            <h2 className="text-2xl font-bold tracking-tight">
              Featured Events
            </h2>
            <p className="mt-1 text-muted-foreground">
              Sponsored and partner events worth planning for
            </p>
          </div>
          <div
            className="-mx-4 flex gap-4 overflow-x-auto px-4 pb-2 snap-x snap-mandatory"
            style={{ scrollbarWidth: "thin" }}
          >
            {promotions.map(
              (p) =>
                p.event && (
                  <div
                    key={p.id}
                    className="w-[min(400px,90vw)] shrink-0 snap-start"
                  >
                    <FeaturedEventCard
                      event={{
                        ...p.event,
                        _count: p.event._count,
                        attendance: attendanceMap[p.event.id],
                        vendorParticipationCount: vendorParticipationMap[p.event.id],
                      }}
                      promotionType={p.type}
                      sponsorName={p.sponsorName}
                    />
                  </div>
                )
            )}
          </div>
        </section>
      )}

      {vendorOfWeek && (
        <section className="mx-auto max-w-6xl px-4 py-6 md:py-8">
          <div className="mb-4">
            <h2 className="text-2xl font-bold tracking-tight">Vendor of the Week</h2>
            <p className="mt-1 text-muted-foreground">
              Meet a standout local vendor from the Spokane community
            </p>
          </div>
          <VendorOfWeekCard vendor={vendorOfWeek} />
        </section>
      )}

      {/* This Week */}
      <section className="mx-auto max-w-6xl px-4 py-12 md:py-16">
        <div className="mb-8 flex items-end justify-between">
          <div>
            <h2 className="text-2xl font-bold tracking-tight">This Week in Spokane</h2>
            <p className="mt-1 text-muted-foreground">
              Markets and events over the next 7 days
            </p>
          </div>
          <Link
            href="/events?dateRange=week"
            prefetch={false}
            className="hidden text-sm font-medium text-primary transition-colors hover:underline sm:block"
          >
            View all →
          </Link>
        </div>

        {weekEvents.length > 0 ? (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-2">
            {weekEvents.map((event) => (
              <EventCard
                key={event.id}
                event={{
                  ...event,
                  attendance: attendanceMap[event.id],
                  vendorParticipationCount: vendorParticipationMap[event.id],
                }}
              />
            ))}
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-border py-12 text-center">
            <p className="text-muted-foreground">
              No events scheduled for this week yet.
            </p>
            <Link
              href="/events?dateRange=all"
              prefetch={false}
              className="mt-2 inline-block text-sm font-medium text-primary hover:underline"
            >
              Browse all upcoming events →
            </Link>
          </div>
        )}

        <Link
          href="/events?dateRange=week"
          prefetch={false}
          className="mt-4 block text-center text-sm font-medium text-primary hover:underline sm:hidden"
        >
          View all this week&apos;s events →
        </Link>
      </section>

      {/* Plan in Advance */}
      <section className="mx-auto max-w-6xl px-4 py-12 md:py-16">
        <div className="mb-8 flex items-end justify-between">
          <div>
            <h2 className="text-2xl font-bold tracking-tight">
              Plan in Advance
            </h2>
            <p className="mt-1 text-muted-foreground">
              Markets and events 2–4 weeks out
            </p>
          </div>
          <Link
            href="/events?dateRange=plan-ahead"
            prefetch={false}
            className="hidden text-sm font-medium text-primary transition-colors hover:underline sm:block"
          >
            View all →
          </Link>
        </div>

        {planAheadEvents.length > 0 ? (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-2">
            {planAheadEvents.map((event) => (
              <EventCard
                key={event.id}
                event={{
                  ...event,
                  attendance: attendanceMap[event.id],
                  vendorParticipationCount: vendorParticipationMap[event.id],
                }}
              />
            ))}
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-border py-12 text-center">
            <p className="text-muted-foreground">
              No events scheduled 2–4 weeks out yet.
            </p>
            <Link
              href="/events?dateRange=all"
              prefetch={false}
              className="mt-2 inline-block text-sm font-medium text-primary hover:underline"
            >
              Browse all upcoming events →
            </Link>
          </div>
        )}

        <Link
          href="/events?dateRange=plan-ahead"
          prefetch={false}
          className="mt-4 block text-center text-sm font-medium text-primary hover:underline sm:hidden"
        >
          View all →
        </Link>
      </section>

      {/* Newsletter Signup */}
      <section className="border-t border-border bg-muted/50 py-12 md:py-16">
        <div className="mx-auto max-w-xl px-4 text-center">
          <h2 className="text-2xl font-bold tracking-tight">Stay in the Loop</h2>
          <p className="mt-2 text-muted-foreground">
            Get a weekly digest of upcoming markets and events delivered to your
            inbox every Thursday.
          </p>
          <form
            action="/api/subscribe"
            method="POST"
            className="mt-6 flex gap-2"
          >
            {/* Honeypot — hidden from users */}
            <input
              type="text"
              name="company"
              tabIndex={-1}
              autoComplete="off"
              className="absolute -left-[9999px]"
              aria-hidden
            />
            <Input
              type="email"
              name="email"
              placeholder="you@email.com"
              required
              className="flex-1"
            />
            <Button type="submit">Subscribe</Button>
          </form>
          <p className="mt-3 text-xs text-muted-foreground">
            No spam, ever. Unsubscribe anytime.
          </p>
        </div>
      </section>
    </>
  );
}
