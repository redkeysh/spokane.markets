import { db } from "@/lib/db";
import { addDays, dateColumnToIso, pacificDate, startOfPacificDay } from "@/lib/admin/format";
import { placeGroupIndex } from "@/lib/events/twins";
import { findDuplicateGroups } from "@/lib/venues/match";
import { loadPlaceMemos } from "@/lib/venues/place-data";
import { SEASON_SHIFT_DAYS } from "./dates";
import type { BoardEvent, BoardMarket, PlaceGroups } from "./board";

export const BOARD_EVENT_SELECT = {
  id: true,
  title: true,
  slug: true,
  status: true,
  startDate: true,
  endDate: true,
  imageUrl: true,
  venueId: true,
  marketId: true,
  deletedAt: true,
  venue: { select: { name: true } },
  scheduleDays: { select: { date: true, startTime: true, endTime: true, allDay: true }, orderBy: { date: "asc" as const } },
} as const;

type BoardEventRow = {
  id: string;
  title: string;
  slug: string;
  status: string;
  startDate: Date;
  endDate: Date;
  imageUrl: string | null;
  venueId: string;
  marketId: string | null;
  deletedAt: Date | null;
  venue: { name: string };
  scheduleDays: { date: Date; startTime: string; endTime: string; allDay: boolean }[];
};

export function toBoardEvent(row: BoardEventRow): BoardEvent {
  return {
    id: row.id,
    title: row.title,
    slug: row.slug,
    status: row.status,
    startDate: row.startDate,
    endDate: row.endDate,
    imageUrl: row.imageUrl,
    venueId: row.venueId,
    venueName: row.venue.name,
    marketId: row.marketId,
    deletedAt: row.deletedAt,
    scheduleDays: row.scheduleDays.map((d) => ({ ...d, date: dateColumnToIso(d.date) })),
  };
}

const BOARD_MARKET_SELECT = {
  id: true,
  name: true,
  slug: true,
  verificationStatus: true,
  deletedAt: true,
  typicalSchedule: true,
  venue: { select: { id: true, name: true, address: true, city: true, deletedAt: true } },
} as const;

/** Active places by duplicate group: venue id to group id. */
export async function loadPlaceGroups(): Promise<PlaceGroups> {
  const venues = await db.venue.findMany({
    where: { deletedAt: null },
    select: { id: true, name: true, address: true, city: true, zip: true, lat: true, lng: true },
  });
  return placeGroupIndex(findDuplicateGroups(venues, await loadPlaceMemos()));
}

/** The first moment of last season: listings that ended before it play no part on the board. */
function lastSeasonStart(now: Date): Date {
  return startOfPacificDay(addDays(pacificDate(now), -SEASON_SHIFT_DAYS - 1));
}

/** Every market (archived ones too) and every listing that ends this season or last, linked or not. */
export async function loadBoard(now: Date): Promise<{ markets: BoardMarket[]; events: BoardEvent[]; groups: PlaceGroups }> {
  const [markets, events, groups] = await Promise.all([
    db.market.findMany({ select: BOARD_MARKET_SELECT, orderBy: { name: "asc" } }),
    db.event.findMany({
      where: { deletedAt: null, status: { not: "REJECTED" }, endDate: { gte: lastSeasonStart(now) } },
      select: BOARD_EVENT_SELECT,
      orderBy: { startDate: "asc" },
    }),
    loadPlaceGroups(),
  ]);
  return { markets: markets as BoardMarket[], events: events.map(toBoardEvent), groups };
}

/** The market with everything its page edits, or null. */
export async function loadMarketRecord(id: string) {
  return db.market.findUnique({
    where: { id },
    include: {
      owner: { select: { id: true, name: true, email: true } },
      memberships: { select: { role: true, user: { select: { id: true, name: true, email: true } } }, orderBy: { createdAt: "asc" } },
      listingCommunityBadges: { select: { id: true } },
      venue: { select: { id: true, name: true, address: true, city: true, state: true, zip: true, deletedAt: true } },
    },
  });
}

/** A market's own listings (not archived, any date) and the unlinked listings still ahead that could be its own. */
export async function loadMarketEvents(marketId: string, now: Date): Promise<{ own: BoardEvent[]; unlinked: BoardEvent[]; groups: PlaceGroups }> {
  const [own, unlinked, groups] = await Promise.all([
    db.event.findMany({ where: { marketId, deletedAt: null }, select: BOARD_EVENT_SELECT, orderBy: { startDate: "asc" } }),
    db.event.findMany({
      where: { marketId: null, deletedAt: null, status: { in: ["PUBLISHED", "PENDING", "DRAFT"] }, endDate: { gte: startOfPacificDay(pacificDate(now)) } },
      select: BOARD_EVENT_SELECT,
      orderBy: { startDate: "asc" },
    }),
    loadPlaceGroups(),
  ]);
  return { own: own.map(toBoardEvent), unlinked: unlinked.map(toBoardEvent), groups };
}

/** Active places for a home place picker, by name. */
export async function loadPlaceOptions() {
  return db.venue.findMany({
    where: { deletedAt: null },
    select: { id: true, name: true, address: true, city: true },
    orderBy: { name: "asc" },
  });
}
