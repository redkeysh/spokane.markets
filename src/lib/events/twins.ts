import { pacificDate, pacificTime } from "@/lib/admin/format";
import { titleOverlap } from "./normalize-title";

export type TwinRow = { id: string; title: string; startDate: Date; venueId: string };

export type TwinPair = {
  /** pairKey of the two ids. */
  key: string;
  /** In start order, then by title. */
  ids: [string, string];
  /** Pacific start date both share. */
  date: string;
  /** Shared words as a share of the shorter core title. */
  overlap: number;
};

/** At this share of the shorter core title's words, two same-day, same-place events are the same event. */
export const TWIN_OVERLAP = 0.6;

/** Twins whose start times are further apart than this are only "maybe" twins. */
export const TWIN_MAX_START_GAP_MS = 3 * 60 * 60 * 1000;

/** Start times close enough for twins; a start at 12:00 am (all day, or hours unknown) fits any time. */
function startsAlign(a: Date, b: Date): boolean {
  if (pacificTime(a) === "00:00" || pacificTime(b) === "00:00") return true;
  return Math.abs(a.getTime() - b.getTime()) <= TWIN_MAX_START_GAP_MS;
}

/** Two ids sorted and joined with "|", the key an AdminMemo stores for a pair. */
export function pairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

/** venue id to group id, from duplicate place groups (a venue in no group is its own group). */
export function placeGroupIndex(groups: { id: string }[][]): Map<string, string> {
  const index = new Map<string, string>();
  for (const group of groups) {
    const groupId = group.map((v) => v.id).sort()[0];
    for (const venue of group) index.set(venue.id, groupId);
  }
  return index;
}

/**
 * Pairs of events on the same Pacific start date at the same place (or at
 * places in one duplicate group). Core titles sharing at least TWIN_OVERLAP of
 * the shorter one's words, with start times within TWIN_MAX_START_GAP_MS, are
 * twins; any other shared word makes them "maybe" twins. Pairs whose key is
 * in `notSameEvent` are skipped.
 */
export function findTwins(
  rows: TwinRow[],
  placeGroups: Map<string, string>,
  notSameEvent: Iterable<string> = []
): { twins: TwinPair[]; maybe: TwinPair[] } {
  const dismissed = new Set(notSameEvent);
  const buckets = new Map<string, (TwinRow & { date: string })[]>();
  for (const row of rows) {
    const date = pacificDate(row.startDate);
    const key = `${date}|${placeGroups.get(row.venueId) ?? row.venueId}`;
    buckets.set(key, [...(buckets.get(key) ?? []), { ...row, date }]);
  }

  const twins: TwinPair[] = [];
  const maybe: TwinPair[] = [];
  for (const bucket of buckets.values()) {
    const sorted = [...bucket].sort(
      (a, b) => a.startDate.getTime() - b.startDate.getTime() || a.title.localeCompare(b.title) || a.id.localeCompare(b.id)
    );
    for (let i = 0; i < sorted.length; i++) {
      for (let j = i + 1; j < sorted.length; j++) {
        const a = sorted[i];
        const b = sorted[j];
        const key = pairKey(a.id, b.id);
        if (a.id === b.id || dismissed.has(key)) continue;
        const overlap = titleOverlap(a.title, b.title);
        if (overlap === 0) continue;
        const twin = overlap >= TWIN_OVERLAP && startsAlign(a.startDate, b.startDate);
        (twin ? twins : maybe).push({ key, ids: [a.id, b.id], date: a.date, overlap });
      }
    }
  }
  const byDate = (x: TwinPair, y: TwinPair) => x.date.localeCompare(y.date) || x.key.localeCompare(y.key);
  return { twins: twins.sort(byDate), maybe: maybe.sort(byDate) };
}
