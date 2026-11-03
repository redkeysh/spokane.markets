import { cache } from "react";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { findDuplicateGroups } from "@/lib/venues/match";
import { pacificDate, startOfPacificDay } from "./format";
import { getModerationPendingCount } from "./queues";
import { getWeekendRail } from "./weekends";

/**
 * Archived places that still need a decision: an active market, or an event
 * that ends today or later and is not rejected or cancelled, still uses them.
 * The archived-in-use decision uses the same rule.
 */
export function archivedPlaceInUse(startOfToday: Date): Prisma.VenueWhereInput {
  return {
    deletedAt: { not: null },
    OR: [
      { events: { some: { deletedAt: null, status: { notIn: ["REJECTED", "CANCELLED"] }, endDate: { gte: startOfToday } } } },
      { markets: { some: { deletedAt: null } } },
    ],
  };
}

/** `label` is the dot's accessible name and tooltip. */
export type NavSignal = { dot: boolean; label: string };

export type NavSignals = { todo: NavSignal; markets: NavSignal; venues: NavSignal };

export type NavSignalCounts = {
  /** Pending and Draft stalls in this week's rail column. */
  weekendWaiting: number;
  /** Submissions, reviews, photos, reports and applications waiting. */
  publicWaiting: number;
  duplicateGroups: number;
  /** Archived places that upcoming events or active markets still use (archivedPlaceInUse). */
  archivedInUse: number;
  marketsAwaitingVerification: number;
};

function count(n: number, one: string, many: string, none: string): string {
  if (n === 0) return none;
  return `${n} ${n === 1 ? one : many}`;
}

/** The honey dots of the top bar and the words behind them. Pure. */
export function buildNavSignals(c: NavSignalCounts): NavSignals {
  return {
    todo: {
      dot: c.weekendWaiting > 0 || c.publicWaiting > 0,
      label: `To do: ${count(c.weekendWaiting, "waiting this weekend", "waiting this weekend", "nothing waiting this weekend")}, ${count(
        c.publicWaiting,
        "from the public",
        "from the public",
        "nothing from the public"
      )}`,
    },
    markets: {
      dot: c.marketsAwaitingVerification > 0,
      label: `Markets: ${count(c.marketsAwaitingVerification, "waiting for verification", "waiting for verification", "none waiting for verification")}`,
    },
    venues: {
      dot: c.duplicateGroups > 0 || c.archivedInUse > 0,
      label: `Venues: ${count(c.duplicateGroups, "duplicate group", "duplicate groups", "no duplicates")}, ${count(
        c.archivedInUse,
        "archived place in use",
        "archived places in use",
        "no archived places in use"
      )}`,
    },
  };
}

/** The top bar's dots for the admin layout: a few counts read in parallel, no per-row reads. */
export const getNavSignals = cache(async (): Promise<NavSignals> => {
  const now = new Date();
  const [rail, publicWaiting, activeVenues, archivedInUse, marketsAwaitingVerification] = await Promise.all([
    getWeekendRail(now),
    getModerationPendingCount(),
    db.venue.findMany({
      where: { deletedAt: null },
      select: { id: true, name: true, address: true, city: true, zip: true, lat: true, lng: true },
    }),
    db.venue.count({ where: archivedPlaceInUse(startOfPacificDay(pacificDate(now))) }),
    db.market.count({ where: { deletedAt: null, verificationStatus: "PENDING" } }),
  ]);
  const thisWeek = rail.weeks[0];
  return buildNavSignals({
    weekendWaiting: thisWeek ? thisWeek.pending + thisWeek.draft : 0,
    publicWaiting,
    duplicateGroups: findDuplicateGroups(activeVenues).length,
    archivedInUse,
    marketsAwaitingVerification,
  });
});
