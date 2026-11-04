import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth-utils";
import { db } from "@/lib/db";
import { formatLongDay, pacificDate, saturdayOf, startOfPacificDay } from "@/lib/admin/format";
import { getHistory } from "@/lib/admin/history";
import { isPossibleDuplicate } from "@/lib/venues/match";
import { loadNeighborhoods } from "@/lib/venues/place-data";
import { PlacePage, type PlacePageData, type UsedByEvent } from "@/components/admin/venues/place-page";

export const dynamic = "force-dynamic";

type Params = Promise<{ id: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { id } = await params;
  const venue = await db.venue.findUnique({ where: { id }, select: { name: true } });
  return { title: venue?.name ?? "Place not found" };
}

const PAST_SHOWN = 20;

export default async function PlaceRoute({ params }: { params: Params }) {
  const session = await requireAdmin();
  const { id } = await params;
  const now = new Date();
  const today = pacificDate(now);
  const startOfToday = startOfPacificDay(today);

  const venue = await db.venue.findUnique({
    where: { id },
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
      updatedAt: true,
      _count: { select: { events: { where: { deletedAt: null } }, markets: { where: { deletedAt: null } } } },
    },
  });
  if (!venue) notFound();

  const [events, markets, others, neighborhoods, history] = await Promise.all([
    db.event.findMany({
      where: { venueId: id, deletedAt: null },
      select: { id: true, title: true, status: true, startDate: true, endDate: true },
      orderBy: { startDate: "asc" },
    }),
    db.market.findMany({ where: { venueId: id, deletedAt: null }, select: { id: true, name: true, verificationStatus: true }, orderBy: { name: "asc" } }),
    db.venue.findMany({
      where: { deletedAt: null, id: { not: id } },
      select: { id: true, name: true, address: true, city: true, zip: true, lat: true, lng: true },
    }),
    loadNeighborhoods(),
    getHistory({ targetType: "VENUE", targetId: id, limit: 50, viewerId: session.user.id }),
  ]);

  const upcoming: UsedByEvent[] = [];
  const past: UsedByEvent[] = [];
  for (const e of events) {
    const start = pacificDate(e.startDate);
    if (e.endDate >= startOfToday) {
      const date = start > today ? start : today;
      upcoming.push({ id: e.id, title: e.title, status: e.status, date, weekOf: saturdayOf(date) });
    } else {
      past.push({ id: e.id, title: e.title, status: e.status, date: start, weekOf: null });
    }
  }

  const data: PlacePageData = {
    id: venue.id,
    form: {
      name: venue.name,
      address: venue.address,
      city: venue.city,
      state: venue.state,
      zip: venue.zip,
      lat: venue.lat,
      lng: venue.lng,
      neighborhood: venue.neighborhood ?? "",
      parkingNotes: venue.parkingNotes ?? "",
    },
    archived: venue.deletedAt !== null,
    updatedAt: venue.updatedAt.toISOString(),
    uses: { events: venue._count.events, markets: venue._count.markets },
    upcoming,
    past: past.reverse().slice(0, PAST_SHOWN),
    markets: markets.map((m) => ({ id: m.id, name: m.name, verification: m.verificationStatus })),
    lookAlikes: others.filter((o) => isPossibleDuplicate(venue, o)).map((o) => ({ id: o.id, name: o.name, address: o.address })),
    history: history.map((h) => {
      const day = pacificDate(h.at);
      return {
        id: h.id,
        day: day === today ? `Today, ${formatLongDay(day)}` : formatLongDay(day),
        at: h.at.toISOString(),
        time: h.time,
        timestamp: h.timestamp,
        sentence: h.sentence,
        details: Object.keys({ ...h.previousValue, ...h.newValue }).map((label) => ({
          label,
          before: h.previousValue?.[label] == null ? null : String(h.previousValue[label]),
          after: h.newValue?.[label] == null ? null : String(h.newValue[label]),
        })),
        canUndo: h.canUndo,
        decisionId: h.decisionId,
      };
    }),
  };

  return <PlacePage data={data} neighborhoods={neighborhoods} now={now.toISOString()} />;
}
