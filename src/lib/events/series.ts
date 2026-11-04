/**
 * Series: one event repeated on several dates (same market, or the same core
 * title at one place group, on two or more dates). The grouping rule lives in
 * series-rules.ts, which modules the browser loads import directly; this
 * module adds the read for one event's series.
 */
import { db } from "@/lib/db";
import { dateColumnToIso, pacificDate, startOfPacificDay } from "@/lib/admin/format";
import { loadPlaceGroups } from "@/lib/markets/queries";
import { hasEnded } from "./readiness";
import { findSeries, type Series } from "./series-rules";

export { findSeries, type Series, type SeriesMarket, type SeriesRow } from "./series-rules";

const LISTED = ["PENDING", "DRAFT", "PUBLISHED"] as const;

/**
 * The series an event belongs to, among listed events (Pending, Draft or Published, not
 * archived) that have not ended, or null. The event itself counts even when it has ended.
 */
export async function getSeriesFor(eventId: string, now: Date = new Date()): Promise<Series | null> {
  const event = await db.event.findUnique({ where: { id: eventId }, select: { id: true, deletedAt: true } });
  if (!event || event.deletedAt) return null;
  const today = pacificDate(now);
  const [rows, markets, groups] = await Promise.all([
    db.event.findMany({
      where: {
        deletedAt: null,
        OR: [{ id: eventId }, { status: { in: [...LISTED] }, endDate: { gte: startOfPacificDay(today) } }],
      },
      select: {
        id: true,
        title: true,
        startDate: true,
        endDate: true,
        venueId: true,
        marketId: true,
        market: { select: { name: true } },
        scheduleDays: { select: { date: true } },
      },
    }),
    db.market.findMany({ where: { deletedAt: null }, select: { id: true, name: true, venueId: true } }),
    loadPlaceGroups(),
  ]);
  const listings = new Map<string, { title: string; venueId: string }[]>();
  for (const row of rows) {
    if (row.marketId) listings.set(row.marketId, [...(listings.get(row.marketId) ?? []), { title: row.title, venueId: row.venueId }]);
  }
  const current = rows.filter(
    (r) => r.id === eventId || !hasEnded({ ...r, scheduleDays: r.scheduleDays.map((d) => ({ date: dateColumnToIso(d.date) })) }, today)
  );
  const series = findSeries(
    current.map((r) => ({ id: r.id, title: r.title, startDate: r.startDate, venueId: r.venueId, marketId: r.marketId, marketName: r.market?.name ?? null })),
    groups,
    { markets: markets.map((m) => ({ id: m.id, name: m.name, venueId: m.venueId, listings: listings.get(m.id) ?? [] })) }
  );
  return series.find((s) => s.eventIds.includes(eventId)) ?? null;
}
