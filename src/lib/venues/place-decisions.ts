import { formatDay } from "@/lib/admin/format";
import { townName } from "@/lib/admin/regions";
import type { Decision, DecisionContext, DecisionInput, DecisionRow, DecisionVenue } from "@/lib/admin/decisions/types";
import { isPossibleDuplicate, placeMemosOf } from "./match";
import { neighborhoodBuckets, type NeighborhoodRow, type SuggestablePlace } from "./neighborhood-suggest";
import {
  archivedInUse,
  duplicateGroups,
  nextOf,
  spellingRows,
  unusedPlaces,
  type PlaceRecord,
} from "./place-review";
import { listSome, plural } from "./words";

/**
 * The place decisions of the To do pile ("Places, no deadline"), built from the decision input.
 * Each needs to know what uses a place, so only venues that carry `uses` (event and market
 * counts, archived ones left out) are considered. ZIP decisions also need the neighborhood list
 * (`neighborhoods` on the input) to say what P does.
 */

export type DecisionVenueWithUses = DecisionVenue & { uses?: { events: number; markets: number } };

export type DecisionInputWithNeighborhoods = DecisionInput & { neighborhoods?: NeighborhoodRow[] };

export const SPELLING_KEY = "spelling";
export const UNUSED_KEY = "unused-places";

export function zipNeighborhoodKey(zip: string): string {
  return `zip-neighborhood:${zip}`;
}

export function archivedInUseKey(id: string): string {
  return `archived-in-use:${id}`;
}

const WAITING_OR_LIVE = new Set(["PENDING", "DRAFT", "PUBLISHED"]);

/** Places with known usage, with their upcoming events and next event from the input's events. */
export function placeRecords(ctx: DecisionContext): PlaceRecord[] {
  const upcoming = new Map<string, { count: number; next: PlaceRecord["next"] }>();
  for (const event of ctx.input.events) {
    if (!WAITING_OR_LIVE.has(event.status) || ctx.ended(event)) continue;
    const date = ctx.upcomingDates(event)[0];
    const entry = upcoming.get(event.venue.id) ?? { count: 0, next: null };
    entry.count += 1;
    if (date && (!entry.next || date < entry.next.date)) entry.next = { date, title: event.title };
    upcoming.set(event.venue.id, entry);
  }
  return (ctx.input.venues as DecisionVenueWithUses[])
    .filter((v): v is DecisionVenueWithUses & { uses: { events: number; markets: number } } => !!v.uses)
    .map((v) => ({
      id: v.id,
      name: v.name,
      address: v.address,
      city: v.city,
      state: v.state,
      zip: v.zip,
      lat: v.lat,
      lng: v.lng,
      neighborhood: v.neighborhood,
      deletedAt: v.deletedAt,
      uses: { events: v.uses.events, markets: v.uses.markets, upcoming: upcoming.get(v.id)?.count ?? 0 },
      next: upcoming.get(v.id)?.next ?? null,
    }));
}

function venueRow(place: PlaceRecord): DecisionRow {
  return { type: "venue", id: place.id, title: place.name, ...(place.next ? { firstDate: place.next.date } : {}) };
}

function nextLine(ctx: DecisionContext, next: PlaceRecord["next"]): string {
  return next ? `next ${formatDay(next.date, ctx.now)}` : "nothing coming up";
}

/** One decision per duplicate group: "Spokane Community College, 3 records". */
export function placeDuplicateDecisions(ctx: DecisionContext): Decision[] {
  return duplicateGroups(placeRecords(ctx), placeMemosOf(ctx.input.memos)).map((plan) => ({
    key: plan.key,
    kind: "place-duplicates",
    lane: "places",
    title: `${plan.records[0].name.trim()}, ${plural(plan.records.length, "record")}`,
    detail: plan.safe
      ? "Same address; the extra records hold nothing"
      : plan.addressesDiffer
        ? "Addresses differ"
        : `Same street, ${nextLine(ctx, plan.next)}`,
    rows: plan.records.map(venueRow),
    settles: [],
    primary: { label: `Merge ${plan.records.length} into one`, action: "merge" },
    ...(plan.next ? { firstDate: plan.next.date } : {}),
  }));
}

function suggestable(place: PlaceRecord): SuggestablePlace {
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
 * What P does for a ZIP's places, as the pane offers it: set the sure suggestions, else open the
 * confirm that adds the missing neighborhood, else nothing (the owner picks one of two per place).
 */
export function zipPrimaryLabel(places: readonly SuggestablePlace[], everyone: readonly SuggestablePlace[], neighborhoods: readonly NeighborhoodRow[]): string {
  const buckets = neighborhoodBuckets(places, everyone, neighborhoods);
  const sure = buckets.sure.reduce((n, g) => n + g.places.length, 0);
  if (sure > 0) return `Set for ${sure}`;
  const none = buckets.none[0];
  if (none) return `${none.inactive ? "Turn on" : "Add"} "${none.proposal.label}" and set for ${none.places.length}`;
  return `Pick for ${places.length}`;
}

/** One decision per ZIP whose active places have no neighborhood. */
export function zipNeighborhoodDecisions(ctx: DecisionContext): Decision[] {
  const neighborhoods = (ctx.input as DecisionInputWithNeighborhoods).neighborhoods;
  if (!neighborhoods) return [];
  const records = placeRecords(ctx);
  const everyone = records.filter((p) => !p.deletedAt).map(suggestable);
  const byZip = new Map<string, PlaceRecord[]>();
  for (const place of records) {
    if (place.deletedAt || place.neighborhood) continue;
    const zip = place.zip.trim().slice(0, 5) || "no ZIP";
    byZip.set(zip, [...(byZip.get(zip) ?? []), place]);
  }
  return [...byZip].map(([zip, places]) => {
    const next = nextOf(places);
    const towns = [...new Set(places.map((p) => townName(p.city)))];
    return {
      key: zipNeighborhoodKey(zip),
      kind: "zip-neighborhood" as const,
      lane: "places" as const,
      title: `No neighborhood: ${towns.join(" and ")} ${zip}`,
      detail: `${plural(places.length, "place")}, ${nextLine(ctx, next)}`,
      rows: places.map(venueRow),
      settles: [],
      primary: { label: zipPrimaryLabel(places.map(suggestable), everyone, neighborhoods), action: "set-neighborhood" as const },
      ...(next ? { firstDate: next.date } : {}),
    };
  });
}

/** One decision for every safe spelling fix: "Spelling on 9 places". */
export function spellingDecisions(ctx: DecisionContext): Decision[] {
  const rows = spellingRows(placeRecords(ctx));
  if (rows.length === 0) return [];
  const next = nextOf(rows.map((r) => r.place));
  return [
    {
      key: SPELLING_KEY,
      kind: "spelling",
      lane: "places",
      title: `Spelling on ${plural(rows.length, "place")}`,
      detail: rows
        .slice(0, 2)
        .map((r) => `${r.fixes[0].before} to ${r.fixes[0].after}`)
        .join(", "),
      rows: rows.map((r) => venueRow(r.place)),
      settles: [],
      primary: { label: `Fix ${rows.length}`, action: "edit" },
      ...(next ? { firstDate: next.date } : {}),
    },
  ];
}

/** Active places an archived place's listings could move to: the ones that look like the same place. */
export function moveCandidates(place: PlaceRecord, records: readonly PlaceRecord[]): PlaceRecord[] {
  return records.filter((other) => !other.deletedAt && other.id !== place.id && isPossibleDuplicate(place, other)).slice(0, 3);
}

/**
 * One decision per archived place an upcoming event or an active market still uses. When an
 * active place looks like the same place, P moves the listings there; otherwise P restores it.
 */
export function archivedInUseDecisions(ctx: DecisionContext): Decision[] {
  const records = placeRecords(ctx);
  return archivedInUse(records).map((place) => {
    const candidate = moveCandidates(place, records)[0];
    return {
      key: archivedInUseKey(place.id),
      kind: "archived-in-use" as const,
      lane: "places" as const,
      title: `${place.name.trim()}: archived, still in use`,
      detail: [
        place.uses.upcoming ? plural(place.uses.upcoming, "upcoming event") : null,
        place.uses.markets ? plural(place.uses.markets, "market") : null,
      ]
        .filter(Boolean)
        .join(" and "),
      rows: [venueRow(place)],
      settles: [],
      primary: candidate ? { label: `Move its listings to ${candidate.name.trim()}`, action: "merge" as const } : { label: "Restore", action: "edit" as const },
      ...(place.next ? { firstDate: place.next.date } : {}),
    };
  });
}

/**
 * One decision for the active places nothing uses: "10 places nothing uses". Records that are the
 * empty half of a duplicate group are left to the merge, so P archives only the others; with
 * none of those, there is no decision.
 */
export function unusedPlaceDecisions(ctx: DecisionContext): Decision[] {
  const records = placeRecords(ctx);
  const rows = unusedPlaces(records, duplicateGroups(records, placeMemosOf(ctx.input.memos)));
  const archivable = rows.filter((r) => !r.duplicateOf);
  if (archivable.length === 0) return [];
  return [
    {
      key: UNUSED_KEY,
      kind: "unused-places",
      lane: "places",
      title: `${plural(rows.length, "place")} nothing uses`,
      detail: `${listSome(archivable.map((r) => r.place.name.trim()))}.${rows.length > archivable.length ? ` ${rows.length - archivable.length} more are left to merging.` : ""}`,
      rows: rows.map((r) => venueRow(r.place)),
      settles: [],
      primary: { label: `Archive ${archivable.length}`, action: "archive" },
    },
  ];
}
