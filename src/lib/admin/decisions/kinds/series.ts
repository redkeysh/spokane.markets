import { formatDayRange } from "@/lib/admin/format";
import { findSeries, type SeriesMarket } from "@/lib/events/series-rules";
import type { Decision, DecisionContext, DecisionEvent } from "../types";
import { byStart, firstDateOf, publishLabel } from "./shared";

/** Every market the input names, with its dates' titles and places, so a series can be matched to one. */
function marketsOf(events: DecisionEvent[]): SeriesMarket[] {
  const markets = new Map<string, SeriesMarket>();
  for (const e of events) {
    if (!e.marketId || !e.marketName) continue;
    const market = markets.get(e.marketId) ?? { id: e.marketId, name: e.marketName, listings: [] };
    market.listings.push({ title: e.title, venueId: e.venue.id });
    markets.set(e.marketId, market);
  }
  return [...markets.values()];
}

/** "Rathdrum Lions Club, Sat Nov 7 to Sat Oct 16, 2027": from the first upcoming day to the last day of any date. */
function seriesDetail(ctx: DecisionContext, events: DecisionEvent[], venueId: string): string {
  const dates = events.flatMap((e) => ctx.upcomingDates(e)).sort();
  const place = events.find((e) => e.venue.id === venueId)?.venue.name ?? events[0].venue.name;
  const span = dates.length ? formatDayRange(dates[0], dates[dates.length - 1], ctx.now) : "";
  return span ? `${place}, ${span}` : place;
}

/**
 * One event on several dates: the upcoming waiting dates of one market, or of one core title at
 * one place group, that no earlier kind took. Claiming them keeps series dates out of the ready
 * batch, so the series is published (and its web addresses and market fixed) as one decision.
 */
export function find(ctx: DecisionContext): Decision[] {
  const open = ctx.unclaimedWaiting().filter((e) => !ctx.ended(e));
  const series = findSeries(
    open.map((e) => ({ id: e.id, title: e.title, startDate: e.startDate, venueId: e.venue.id, marketId: e.marketId, marketName: e.marketName })),
    ctx.placeGroups,
    { markets: marketsOf(ctx.input.events) }
  );
  return series.map((s): Decision => {
    const events = s.eventIds.map((id) => ctx.eventById.get(id)!).sort(byStart);
    const notifies = ctx.notifies(events);
    const count = events.length;
    return {
      key: s.key,
      kind: "series",
      lane: ctx.laneOf(events[0]),
      title: `${s.name}, ${count} dates`,
      detail: seriesDetail(ctx, events, s.venueId),
      rows: events.map((e) => ctx.row(e)),
      settles: events.map((e) => e.id),
      primary: { label: publishLabel(`Publish ${count} dates`, notifies), action: "publish", notifies },
      firstDate: firstDateOf(ctx, events),
    };
  });
}
