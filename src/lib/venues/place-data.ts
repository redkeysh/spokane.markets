import { db } from "@/lib/db";
import { pacificDate, startOfPacificDay } from "@/lib/admin/format";
import { getSnoozed } from "@/lib/admin/memo";
import { archivedPlaceInUse } from "@/lib/admin/nav-signals";
import type { PlaceRecord } from "./place-review";
import type { NeighborhoodRow } from "./neighborhood-suggest";

const NOT_HAPPENING = ["REJECTED", "CANCELLED"] as const;

/** Events that give a place its next date and are listed under an archived place still in use. */
export function upcomingEventsWhere(startOfToday: Date) {
  return { deletedAt: null, status: { notIn: [...NOT_HAPPENING] }, endDate: { gte: startOfToday } };
}

/** Every place, archived ones included, with what uses it and its next event. Three queries. */
export async function loadPlaceRecords(now: Date = new Date()): Promise<PlaceRecord[]> {
  const today = pacificDate(now);
  const startOfToday = startOfPacificDay(today);
  const [venues, upcoming] = await Promise.all([
    db.venue.findMany({
      select: {
        id: true,
        name: true,
        address: true,
        city: true,
        state: true,
        zip: true,
        lat: true,
        lng: true,
        neighborhood: true,
        parkingNotes: true,
        deletedAt: true,
        _count: { select: { events: { where: { deletedAt: null } }, markets: { where: { deletedAt: null } } } },
      },
    }),
    db.event.findMany({
      where: upcomingEventsWhere(startOfToday),
      select: { venueId: true, title: true, startDate: true },
      orderBy: { startDate: "asc" },
    }),
  ]);
  const byVenue = new Map<string, { count: number; next: PlaceRecord["next"] }>();
  for (const event of upcoming) {
    const entry = byVenue.get(event.venueId) ?? { count: 0, next: null };
    entry.count += 1;
    const start = pacificDate(event.startDate);
    const date = start > today ? start : today;
    if (!entry.next || date < entry.next.date) entry.next = { date, title: event.title };
    byVenue.set(event.venueId, entry);
  }
  return venues.map(({ _count, ...v }) => ({
    ...v,
    uses: { events: _count.events, markets: _count.markets, upcoming: byVenue.get(v.id)?.count ?? 0 },
    next: byVenue.get(v.id)?.next ?? null,
  }));
}

export type NeighborhoodWithUse = NeighborhoodRow & { id: string; venues: number; markets: number };

export async function loadNeighborhoods(): Promise<NeighborhoodWithUse[]> {
  const rows = await db.neighborhood.findMany({
    orderBy: [{ label: "asc" }],
    select: { id: true, slug: true, label: true, isActive: true, _count: { select: { venues: true, markets: true } } },
  });
  return rows.map(({ _count, ...n }) => ({ ...n, venues: _count.venues, markets: _count.markets }));
}

/** Ids of the archived places still in use, by the rule the Venues nav dot counts (archivedPlaceInUse). */
export async function loadArchivedInUseIds(now: Date = new Date()): Promise<Set<string>> {
  const rows = await db.venue.findMany({ where: archivedPlaceInUse(startOfPacificDay(pacificDate(now))), select: { id: true } });
  return new Set(rows.map((r) => r.id));
}

export { getPlaceMemos as loadPlaceMemos } from "@/lib/admin/memo";

/** Decision keys put off until later, with when they come back. */
export async function loadSnoozedKeys(now: Date = new Date()): Promise<Map<string, Date>> {
  return new Map((await getSnoozed(now)).map((s) => [s.key, s.until]));
}
