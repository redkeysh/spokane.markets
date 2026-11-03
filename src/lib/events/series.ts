/**
 * Series: one event repeated on several dates (same market, or the same core
 * title at one place group, on two or more dates). Finds no series.
 */

export type SeriesRow = {
  id: string;
  title: string;
  startDate: Date;
  venueId: string;
  marketId: string | null;
};

export type Series = {
  /** "series:<core title>@<place group>" or "series:market:<marketId>". */
  key: string;
  /** Display name, e.g. "Kendall Yards Christmas Market". */
  name: string;
  /** Event ids in date order. */
  eventIds: string[];
  marketId: string | null;
  /** True when the series has no market yet, so "Make a market" applies. */
  suggestMarket: boolean;
};

export function findSeries(_rows: SeriesRow[], _placeGroups: Map<string, string>): Series[] {
  return [];
}

export async function getSeriesFor(_eventId: string): Promise<Series | null> {
  return null;
}
