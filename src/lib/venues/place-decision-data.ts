import { db } from "@/lib/db";
import { pacificDate, startOfPacificDay } from "@/lib/admin/format";
import { neighborhoodBuckets, type NeighborhoodBuckets, type NeighborhoodRow, type SuggestablePlace } from "./neighborhood-suggest";
import { loadArchivedInUseIds, loadNeighborhoods, loadPlaceMemos, loadPlaceRecords, upcomingEventsWhere } from "./place-data";
import {
  addressMismatches,
  byNext,
  duplicateGroups,
  planDuplicateGroup,
  spellingRows,
  unusedPlaces,
  type DuplicateGroupPlan,
  type PlaceRecord,
  type SpellingRow,
} from "./place-review";
import type { PlaceProblem } from "./place-check";
import { moveCandidates } from "./place-decisions";

export type ListingRef = { id: string; title: string; status: string; date: string | null; kind: "event" | "market" };

export type ArchivedInUseItem = {
  place: PlaceRecord;
  /** Upcoming events and active markets that still point at the place. */
  listings: ListingRef[];
  /** Active places that look like the same place, to move the listings to. */
  candidates: PlaceRecord[];
};

export type PlaceDecisionData =
  | { kind: "place-duplicates"; key: string; plan: DuplicateGroupPlan; neighborhoods: NeighborhoodRow[] }
  | { kind: "zip-neighborhood"; key: string; zip: string; buckets: NeighborhoodBuckets; neighborhoods: NeighborhoodRow[] }
  | { kind: "spelling"; key: string; rows: SpellingRow[]; mismatches: { place: PlaceRecord; problems: PlaceProblem[] }[] }
  | { kind: "archived-in-use"; key: string; item: ArchivedInUseItem }
  | { kind: "unused-places"; key: string; rows: { place: PlaceRecord; duplicateOf: string | null }[] };

export function asSuggestable(place: PlaceRecord): SuggestablePlace {
  return {
    id: place.id,
    name: place.name,
    address: place.address,
    city: place.city,
    state: place.state,
    zip: place.zip,
    neighborhood: place.neighborhood,
    nextDate: place.next?.date ?? null,
  };
}

/**
 * The archived places in `ids` (from loadArchivedInUseIds), by next event, with their upcoming
 * events and active markets and the active places they could move to.
 */
export async function loadArchivedInUse(records: PlaceRecord[], ids: ReadonlySet<string>, now: Date = new Date()): Promise<ArchivedInUseItem[]> {
  const places = records
    .filter((r) => r.deletedAt && ids.has(r.id))
    .sort(byNext);
  if (places.length === 0) return [];
  const placeIds = places.map((p) => p.id);
  const [events, markets] = await Promise.all([
    db.event.findMany({
      where: { venueId: { in: placeIds }, ...upcomingEventsWhere(startOfPacificDay(pacificDate(now))) },
      select: { id: true, title: true, status: true, startDate: true, venueId: true },
      orderBy: { startDate: "asc" },
    }),
    db.market.findMany({ where: { venueId: { in: placeIds }, deletedAt: null }, select: { id: true, name: true, verificationStatus: true, venueId: true } }),
  ]);
  return places.map((place) => ({
    place,
    listings: [
      ...events
        .filter((e) => e.venueId === place.id)
        .map((e) => ({ id: e.id, title: e.title, status: e.status, date: pacificDate(e.startDate), kind: "event" as const })),
      ...markets
        .filter((m) => m.venueId === place.id)
        .map((m) => ({ id: m.id, title: m.name, status: m.verificationStatus, date: null, kind: "market" as const })),
    ],
    candidates: moveCandidates(place, records),
  }));
}

/** What the To do pane of a place decision shows, by decision key; null when the decision is settled. */
export async function loadPlaceDecision(key: string): Promise<PlaceDecisionData | null> {
  const [records, neighborhoods] = await Promise.all([loadPlaceRecords(), loadNeighborhoods()]);
  const active = records.filter((r) => !r.deletedAt);

  if (key.startsWith("place-duplicates:")) {
    const ids = new Set(key.slice("place-duplicates:".length).split("|"));
    const group = active.filter((r) => ids.has(r.id));
    if (group.length < 2) return null;
    const memos = await loadPlaceMemos();
    const grouped = duplicateGroups(group, memos).find((g) => g.records.length === group.length);
    return { kind: "place-duplicates", key, plan: grouped ?? planDuplicateGroup(group), neighborhoods };
  }
  if (key.startsWith("zip-neighborhood:")) {
    const zip = key.slice("zip-neighborhood:".length);
    const missing = active.filter((r) => !r.neighborhood && (r.zip.trim().slice(0, 5) || "no ZIP") === zip);
    if (missing.length === 0) return null;
    return {
      kind: "zip-neighborhood",
      key,
      zip,
      buckets: neighborhoodBuckets(missing.map(asSuggestable), active.map(asSuggestable), neighborhoods),
      neighborhoods,
    };
  }
  if (key === "spelling") {
    const rows = spellingRows(records);
    return rows.length ? { kind: "spelling", key, rows, mismatches: addressMismatches(records) } : null;
  }
  if (key.startsWith("archived-in-use:")) {
    const id = key.slice("archived-in-use:".length);
    const ids = await loadArchivedInUseIds();
    if (!ids.has(id)) return null;
    const item = (await loadArchivedInUse(records, new Set([id])))[0];
    return item ? { kind: "archived-in-use", key, item } : null;
  }
  if (key === "unused-places") {
    const rows = unusedPlaces(records, duplicateGroups(records, await loadPlaceMemos()));
    return rows.some((r) => !r.duplicateOf) ? { kind: "unused-places", key, rows } : null;
  }
  return null;
}
