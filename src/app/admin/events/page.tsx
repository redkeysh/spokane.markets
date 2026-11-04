import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth-utils";
import { db } from "@/lib/db";
import { dateColumnToIso, pacificDate, startOfPacificDay } from "@/lib/admin/format";
import {
  buildEventsList,
  buildEventsListWhere,
  clearedFiltersHref,
  emptyMessage,
  eventsListHref,
  eventsListQuery,
  parseEventsListParams,
  resultSummary,
  type EventsListParams,
  type ListSourceEvent,
} from "@/lib/admin/events-query";
import { getWeekendRail } from "@/lib/admin/weekends";
import { hasEnded } from "@/lib/events/readiness";
import { loadPlaceMemos } from "@/lib/venues/place-data";
import { EventsScreen } from "@/components/admin/events-list/events-screen";

export const metadata: Metadata = { title: "Events" };

/** More than any season holds; the list is filtered in memory after this. */
const ROW_LIMIT = 3000;

const LISTED = ["PENDING", "DRAFT", "PUBLISHED"] as const;

export default async function AdminEventsPage({ searchParams }: { searchParams: Promise<EventsListParams> }) {
  await requireAdmin();
  const filters = parseEventsListParams(await searchParams);
  const now = new Date();
  const today = pacificDate(now);
  const startOfToday = startOfPacificDay(today);

  const [rail, events, context, venues, importRows, memos, markets, tags, placeMemos] = await Promise.all([
    getWeekendRail(now),
    db.event.findMany({
      where: buildEventsListWhere(filters, now),
      take: ROW_LIMIT,
      orderBy: { startDate: "asc" },
      select: {
        id: true,
        title: true,
        slug: true,
        status: true,
        deletedAt: true,
        startDate: true,
        endDate: true,
        createdAt: true,
        updatedAt: true,
        imageUrl: true,
        marketId: true,
        market: { select: { name: true } },
        venue: {
          select: { id: true, name: true, address: true, city: true, state: true, zip: true, neighborhood: true, deletedAt: true },
        },
        scheduleDays: { select: { date: true, startTime: true, endTime: true, allDay: true } },
        _count: { select: { tags: true } },
        submittedBy: {
          select: { name: true, email: true, role: true, notificationPreference: { select: { organizerAlertsEnabled: true } } },
        },
        submissionFrom: { select: { id: true } },
      },
    }),
    db.event.findMany({
      where: { deletedAt: null, status: { in: [...LISTED] }, endDate: { gte: startOfToday } },
      select: {
        id: true,
        title: true,
        status: true,
        startDate: true,
        endDate: true,
        venueId: true,
        marketId: true,
        scheduleDays: { select: { date: true } },
      },
    }),
    db.venue.findMany({
      select: { id: true, name: true, address: true, city: true, state: true, zip: true, lat: true, lng: true, deletedAt: true },
      orderBy: { name: "asc" },
    }),
    db.event.findMany({ select: { id: true, createdAt: true } }),
    db.adminMemo.findMany({ where: { kind: "not-same-event" }, select: { key: true } }),
    db.market.findMany({ where: { deletedAt: null }, select: { id: true, name: true, venue: { select: { city: true } } }, orderBy: { name: "asc" } }),
    db.tag.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    loadPlaceMemos(),
  ]);

  const rows: ListSourceEvent[] = events.map((e) => ({
    id: e.id,
    title: e.title,
    slug: e.slug,
    status: e.status,
    deletedAt: e.deletedAt,
    startDate: e.startDate,
    endDate: e.endDate,
    createdAt: e.createdAt,
    updatedAt: e.updatedAt,
    scheduleDays: e.scheduleDays.map((d) => ({ date: dateColumnToIso(d.date), startTime: d.startTime, endTime: d.endTime, allDay: d.allDay })),
    imageUrl: e.imageUrl,
    tagCount: e._count.tags,
    marketId: e.marketId,
    marketName: e.market?.name ?? null,
    venue: e.venue,
    submittedBy: e.submittedBy
      ? {
          name: e.submittedBy.name?.trim() || e.submittedBy.email.split("@")[0],
          role: e.submittedBy.role,
          alertsOn: e.submittedBy.notificationPreference?.organizerAlertsEnabled !== false,
        }
      : null,
    fromSubmission: !!e.submissionFrom,
  }));

  const upcoming = context
    .map((e) => ({ ...e, scheduleDays: e.scheduleDays.map((d) => ({ date: dateColumnToIso(d.date) })) }))
    .filter((e) => !hasEnded(e, today));

  const result = buildEventsList(
    {
      now,
      events: rows,
      context: upcoming,
      venues,
      importRows,
      notSameEvent: memos.map((m) => m.key),
      placeMemos,
      rail: rail.weeks,
    },
    filters
  );

  const empty = emptyMessage(filters, { weekLabel: result.weekLabel, sourceOptions: result.sourceOptions });

  return (
    <EventsScreen
      filters={filters}
      query={eventsListQuery(filters)}
      result={result}
      summary={resultSummary(result, filters.view)}
      empty={{
        text: empty.text,
        clearHref: empty.clear === "search" ? eventsListHref(filters, { q: "" }) : empty.clear ? clearedFiltersHref(filters) : null,
        clearLabel: empty.clear === "search" ? "Clear search" : "Clear filters",
      }}
      markets={markets.map((m) => ({ value: m.id, label: m.name, detail: m.venue?.city ?? undefined }))}
      places={venues
        .filter((v) => !v.deletedAt)
        .map((v) => ({ value: v.id, label: v.name, detail: [v.address, v.city].filter(Boolean).join(", ") }))}
      tags={tags.map((t) => ({ value: t.id, label: t.name }))}
    />
  );
}
