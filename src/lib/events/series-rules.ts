/**
 * Series: one event repeated on several dates (same market, or the same core
 * title at one place group, on two or more dates). Pure, so modules the
 * browser loads (the Events list) can use it; series.ts adds the database read.
 */
import { pacificDate } from "@/lib/admin/format";
import { coreTitle, titleOverlap, titleWords } from "./normalize-title";
import { TWIN_OVERLAP } from "./twins";

export type SeriesRow = {
  id: string;
  title: string;
  startDate: Date;
  venueId: string;
  marketId: string | null;
  /** The market's name, when the row has one; used to name the series and to suggest a market. */
  marketName?: string | null;
};

/** A market a series without one could join. `listings` are its dates' titles and places. */
export type SeriesMarket = {
  id: string;
  name: string;
  /** Its home place. */
  venueId?: string | null;
  listings: { title: string; venueId: string }[];
};

export type Series = {
  /** "series:<core title>@<place group>" or "series:market:<marketId>". */
  key: string;
  /** Display name, e.g. "Kendall Yards Christmas Market". */
  name: string;
  /** Event ids in date order. */
  eventIds: string[];
  marketId: string | null;
  marketName: string | null;
  /** True when the series has no market yet, so "Make a market" applies. */
  suggestMarket: boolean;
  /** A market that looks like this series' own (same place, similar name), for "Link N dates". */
  suggestedMarket: { id: string; name: string } | null;
  /** The place most of its dates use. */
  venueId: string;
  /** Distinct Pacific start dates, sorted. */
  dates: string[];
};

const SEASON_WORDS: Record<string, string> = {
  spring: "spring",
  summer: "summer",
  fall: "fall",
  autumn: "fall",
  winter: "winter",
  holiday: "winter",
  christmas: "winter",
};

function seasonsOf(title: string): Set<string> {
  return new Set([...titleWords(title)].map((w) => SEASON_WORDS[w]).filter(Boolean));
}

/** "Spring Craft Fair" and "Fall Craft Fair" name different seasons; a title without a season names none. */
function seasonsConflict(a: string, b: string): boolean {
  const sa = seasonsOf(a);
  const sb = seasonsOf(b);
  return sa.size > 0 && sb.size > 0 && ![...sa].some((s) => sb.has(s));
}

function mostCommon<T>(values: T[], tieBreak: (a: T, b: T) => number): { value: T; count: number } {
  const counts = new Map<T, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  const [value, count] = [...counts].sort((a, b) => b[1] - a[1] || tieBreak(a[0], b[0]))[0];
  return { value, count };
}

const byLengthThenName = (a: string, b: string) => a.length - b.length || a.localeCompare(b);

/**
 * The series' name: the title that at least half its dates (and more than one) share, else the
 * market's name, else the shortest title.
 */
function seriesName(rows: SeriesRow[], marketName: string | null): string {
  const top = mostCommon(
    rows.map((r) => r.title.trim()),
    byLengthThenName
  );
  if (top.count > 1 && top.count * 2 >= rows.length) return top.value;
  return marketName?.trim() || top.value;
}

function byStart(a: SeriesRow, b: SeriesRow): number {
  return a.startDate.getTime() - b.startDate.getTime() || a.title.localeCompare(b.title) || a.id.localeCompare(b.id);
}

/** Markets named by the rows themselves, when no list is given. */
function marketsFromRows(rows: SeriesRow[]): SeriesMarket[] {
  const markets = new Map<string, SeriesMarket>();
  for (const row of rows) {
    if (!row.marketId || !row.marketName) continue;
    const market = markets.get(row.marketId) ?? { id: row.marketId, name: row.marketName, listings: [] };
    market.listings.push({ title: row.title, venueId: row.venueId });
    markets.set(row.marketId, market);
  }
  return [...markets.values()];
}

/**
 * The market whose home place or dates share a place group with the series and whose name, or
 * one of its dates' titles, shares at least TWIN_OVERLAP of the series title's words without
 * naming another season. The closest match wins.
 */
function suggestMarket(rows: SeriesRow[], groupOf: (venueId: string) => string, markets: SeriesMarket[]): { id: string; name: string } | null {
  const places = new Set(rows.map((r) => groupOf(r.venueId)));
  const titles = [...new Set(rows.map((r) => r.title))];
  let best: { market: SeriesMarket; score: number } | null = null;
  for (const market of markets) {
    const marketPlaces = new Set([...(market.venueId ? [market.venueId] : []), ...market.listings.map((l) => l.venueId)].map(groupOf));
    if (![...places].some((p) => marketPlaces.has(p))) continue;
    const names = [market.name, ...new Set(market.listings.map((l) => l.title))];
    let score = 0;
    for (const title of titles) {
      for (const name of names) {
        if (seasonsConflict(title, name)) continue;
        score = Math.max(score, titleOverlap(title, name));
      }
    }
    if (score < TWIN_OVERLAP) continue;
    if (!best || score > best.score || (score === best.score && market.name.localeCompare(best.market.name) < 0)) best = { market, score };
  }
  return best ? { id: best.market.id, name: best.market.name } : null;
}

/**
 * Groups rows into series: rows of one market, and rows without a market that share a core title
 * at one place group (venue id to group id; a venue in no group is its own). A group needs two or
 * more distinct Pacific start dates. A series without a market names the market that looks like
 * its own, from `markets` or, without it, from the markets the rows name.
 */
export function findSeries(rows: SeriesRow[], placeGroups: ReadonlyMap<string, string>, options: { markets?: SeriesMarket[] } = {}): Series[] {
  const groupOf = (venueId: string) => placeGroups.get(venueId) ?? venueId;
  const groups = new Map<string, SeriesRow[]>();
  for (const row of rows) {
    let key: string;
    if (row.marketId) key = `series:market:${row.marketId}`;
    else {
      const core = coreTitle(row.title);
      if (!core) continue;
      key = `series:${core}@${groupOf(row.venueId)}`;
    }
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }

  const markets = options.markets ?? marketsFromRows(rows);
  const out: Series[] = [];
  for (const [key, list] of groups) {
    const sorted = [...list].sort(byStart);
    const dates = [...new Set(sorted.map((r) => pacificDate(r.startDate)))].sort();
    if (dates.length < 2) continue;
    const marketId = sorted[0].marketId;
    const marketName = marketId
      ? (sorted.find((r) => r.marketName)?.marketName ?? markets.find((m) => m.id === marketId)?.name ?? null)
      : null;
    const venueId = mostCommon(
      sorted.map((r) => r.venueId),
      (a, b) => sorted.findIndex((r) => r.venueId === a) - sorted.findIndex((r) => r.venueId === b)
    ).value;
    out.push({
      key,
      name: seriesName(sorted, marketName),
      eventIds: sorted.map((r) => r.id),
      marketId,
      marketName,
      suggestMarket: !marketId,
      suggestedMarket: marketId ? null : suggestMarket(sorted, groupOf, markets),
      venueId,
      dates,
    });
  }
  return out.sort((a, b) => a.dates[0].localeCompare(b.dates[0]) || a.name.localeCompare(b.name) || a.key.localeCompare(b.key));
}

