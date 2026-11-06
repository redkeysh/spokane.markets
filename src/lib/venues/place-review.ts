import { pairKey } from "@/lib/events/twins";
import {
  distanceMeters,
  findDuplicateGroups,
  normalizeStreetAddress,
  normalizeVenueName,
  realCoords,
  sameLocality,
  streetCore,
  type DuplicateMemos,
} from "./match";
import type { MergeOverrides } from "./merge";
import { spellingFixes, type SpellingFix } from "./tidy";
import { addressProblems, type PlaceProblem } from "./place-check";
import { findTown } from "@/lib/admin/regions";

/**
 * Pure rules behind the Venues views and the place decisions on To do: duplicate groups with
 * their merge defaults, places nothing uses, archived places still in use, spelling.
 */

export type PlaceUses = {
  /** Events that point at the place and are not archived, any status or date. */
  events: number;
  /** Markets whose home is the place and are not archived. */
  markets: number;
  /** Events that end today or later and are not rejected, cancelled or archived. */
  upcoming: number;
};

export type PlaceRecord = {
  id: string;
  name: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  lat: number | null;
  lng: number | null;
  neighborhood: string | null;
  parkingNotes?: string | null;
  deletedAt: Date | null;
  uses: PlaceUses;
  /** The next event here: its Pacific date ("2026-11-07") and title. */
  next: { date: string; title: string } | null;
};

export function inUse(place: Pick<PlaceRecord, "uses">): boolean {
  return place.uses.events > 0 || place.uses.markets > 0;
}

/** By the date of the next event, places with nothing coming up last, then by name. */
export function byNext(a: Pick<PlaceRecord, "next" | "name">, b: Pick<PlaceRecord, "next" | "name">): number {
  return (a.next?.date ?? "9999").localeCompare(b.next?.date ?? "9999") || a.name.localeCompare(b.name);
}

/** The earliest next event among records. */
export function nextOf(records: readonly Pick<PlaceRecord, "next" | "name">[]): PlaceRecord["next"] {
  return [...records].sort(byNext)[0]?.next ?? null;
}

export type MergeField = "name" | "address" | "town" | "neighborhood";
export const MERGE_FIELDS: readonly MergeField[] = ["name", "address", "town", "neighborhood"];

/** The value a record offers for a merge field, as shown and compared. */
export function fieldValue(record: PlaceRecord, field: MergeField): string {
  switch (field) {
    case "name":
      return record.name.trim();
    case "address":
      return record.address.trim();
    case "town":
      return `${record.city.trim()}, ${record.state.trim()} ${record.zip.trim()}`;
    case "neighborhood":
      return record.neighborhood ?? "";
  }
}

/** Words written out ("North", "Street") rather than in the short postal form cost a point each. */
const LONG_FORMS = new Set([
  "street",
  "avenue",
  "boulevard",
  "road",
  "drive",
  "lane",
  "court",
  "place",
  "highway",
  "parkway",
  "circle",
  "terrace",
  "trail",
  "north",
  "south",
  "east",
  "west",
  "suite",
]);

const STREET_TYPES = new Set(["st", "ave", "blvd", "rd", "dr", "ln", "ct", "pl", "hwy", "pkwy", "cir", "ter", "trl", "way", "loop", "sq"]);

/**
 * Lower is the standard short address form: "1810 N Greene St" over "1810 North Greene Street",
 * over shouting, and over a street with its type left off ("1622 E Wellesley").
 */
export function addressFormCost(address: string): number {
  const words = address
    .trim()
    .split(/\s+/)
    .map((w) => w.toLowerCase().replace(/[^a-z]/g, ""));
  const long = words.filter((w) => LONG_FORMS.has(w)).length;
  const typed = words.some((w) => STREET_TYPES.has(w) || (LONG_FORMS.has(w) && !["north", "south", "east", "west", "suite"].includes(w)));
  const shouting = /[a-z]/.test(address) ? 0 : 1;
  const typo = /\bsuit\b/i.test(address) ? 1 : 0;
  return long + shouting * 2 + typo + (typed ? 0 : 1);
}

/** Lower is a cleaner town line: a known town spelled right, a two-letter state, a five-digit ZIP. */
function townCost(record: PlaceRecord): number {
  const town = findTown(record.city);
  return (
    (town && town.name === record.city.trim() ? 0 : 1) +
    (/^(WA|ID)$/.test(record.state.trim()) ? 0 : 1) +
    (/^\d{5}$/.test(record.zip.trim()) ? 0 : 1) +
    addressProblems(record).length
  );
}

export type DuplicateGroupPlan = {
  /** The place-duplicates decision key: the ids sorted and joined with "|". */
  key: string;
  /** The suggested record to keep first, then by listings. */
  records: PlaceRecord[];
  keepId: string;
  /** Default record id for name, address and town; the default neighborhood slug, null when no record has one. */
  defaults: MergeDefaults;
  differs: Record<MergeField, boolean>;
  /** Street numbers or streets differ, so the records may be two places. */
  addressesDiffer: boolean;
  /** Pins of two records more than this far apart, when both have real pins. */
  farthestMeters: number | null;
  /** Same street address, and every record but the kept one holds nothing: merging moves nothing. */
  safe: boolean;
  next: PlaceRecord["next"];
};

export function duplicateKey(ids: readonly string[]): string {
  return `place-duplicates:${[...ids].sort().join("|")}`;
}

function listings(record: PlaceRecord): number {
  return record.uses.events + record.uses.markets;
}

/** Defaults: the record with the most listings for the name, the standard short address, the cleanest town line, any set neighborhood. */
export function planDuplicateGroup(group: readonly PlaceRecord[]): DuplicateGroupPlan {
  const records = [...group].sort((a, b) => listings(b) - listings(a) || b.uses.upcoming - a.uses.upcoming || a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
  const keep = records[0];
  const pickBest = (cost: (r: PlaceRecord) => number) => records.reduce((best, r) => (cost(r) < cost(best) ? r : best), keep).id;
  const differs = Object.fromEntries(
    MERGE_FIELDS.map((field) => [field, new Set(records.map((r) => (field === "neighborhood" ? fieldValue(r, field) : normalizeFor(field, r)))).size > 1])
  ) as Record<MergeField, boolean>;
  const withNeighborhood = records.find((r) => r.neighborhood);
  const defaults: MergeDefaults = {
    name: keep.id,
    address: pickBest((r) => addressFormCost(r.address)),
    town: pickBest(townCost),
    neighborhood: keep.neighborhood ?? withNeighborhood?.neighborhood ?? null,
  };
  const cores = new Set(records.map((r) => streetCore(r.address)));
  const addresses = new Set(records.map((r) => normalizeStreetAddress(r.address)));
  let farthest: number | null = null;
  for (let i = 0; i < records.length; i++) {
    for (let j = i + 1; j < records.length; j++) {
      const a = realCoords(records[i]);
      const b = realCoords(records[j]);
      if (a && b) farthest = Math.max(farthest ?? 0, distanceMeters(a, b));
    }
  }
  const sameAddress = addresses.size === 1 && records.every((r) => sameLocality(r, keep) || findTown(r.city) === findTown(keep.city));
  return {
    key: duplicateKey(records.map((r) => r.id)),
    records,
    keepId: keep.id,
    defaults,
    differs,
    addressesDiffer: cores.size > 1,
    farthestMeters: farthest,
    safe: sameAddress && records.slice(1).every((r) => !inUse(r)),
    next: nextOf(records),
  };
}

function normalizeFor(field: MergeField, record: PlaceRecord): string {
  if (field === "name") return normalizeVenueName(record.name);
  if (field === "address") return normalizeStreetAddress(record.address);
  return fieldValue(record, field).toLowerCase();
}

/** Plans for duplicate groups already found, by next event. */
export function duplicatePlans(groups: readonly (readonly PlaceRecord[])[]): DuplicateGroupPlan[] {
  return groups
    .map(planDuplicateGroup)
    .sort((a, b) => byNext({ next: a.next, name: a.records[0].name }, { next: b.next, name: b.records[0].name }) || a.key.localeCompare(b.key));
}

/** Duplicate groups among active places, honoring the owner's "different" and "same" pairs, by next event. */
export function duplicateGroups(places: readonly PlaceRecord[], memos: DuplicateMemos = {}): DuplicateGroupPlan[] {
  return duplicatePlans(findDuplicateGroups(places.filter((p) => !p.deletedAt), memos));
}

/** Every pair key in a group, for "Different places". */
export function pairKeys(ids: readonly string[]): string[] {
  const keys: string[] = [];
  for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) keys.push(pairKey(ids[i], ids[j]));
  return keys;
}

export type MergeDefaults = { name: string; address: string; town: string; neighborhood: string | null };

/** Record ids for name, address and town; a neighborhood slug (or null for none). */
export type MergeChoices = { keepId: string } & MergeDefaults;

export type MergePlan = { keepId: string; mergeIds: string[]; overrides: MergeOverrides };

/**
 * Turns the choices of a merge table into the merge to run. The address carries its record's pin.
 * When the chosen name and address together already belong to another record (and not to the
 * chosen one), that record is kept, since no two places may share both.
 */
export function mergePlan(records: readonly PlaceRecord[], choices: MergeChoices): MergePlan {
  const byId = new Map(records.map((r) => [r.id, r]));
  const from = (id: string | null) => (id ? byId.get(id) : undefined);
  const chosen = byId.get(choices.keepId)!;
  const nameFrom = from(choices.name) ?? chosen;
  const addressFrom = from(choices.address) ?? chosen;
  const townFrom = from(choices.town) ?? chosen;
  const holds = (r: PlaceRecord) => r.name.trim() === nameFrom.name.trim() && r.address.trim() === addressFrom.address.trim();
  const keep = holds(chosen) ? chosen : (records.find(holds) ?? chosen);
  const overrides: MergeOverrides = {};
  if (nameFrom.name !== keep.name) overrides.name = nameFrom.name.trim();
  if (addressFrom.address !== keep.address) {
    overrides.address = addressFrom.address.trim();
    const pin = realCoords(addressFrom);
    if (pin) {
      overrides.lat = pin.lat;
      overrides.lng = pin.lng;
    }
  }
  if (townFrom.id !== keep.id) {
    if (townFrom.city !== keep.city) overrides.city = townFrom.city.trim();
    if (townFrom.state !== keep.state) overrides.state = townFrom.state.trim();
    if (townFrom.zip !== keep.zip) overrides.zip = townFrom.zip.trim();
  }
  if (choices.neighborhood !== keep.neighborhood) overrides.neighborhood = choices.neighborhood;
  return { keepId: keep.id, mergeIds: records.map((r) => r.id).filter((id) => id !== keep.id), overrides };
}

/** The defaults of a plan as choices. */
export function defaultChoices(plan: DuplicateGroupPlan): MergeChoices {
  return { keepId: plan.keepId, ...plan.defaults };
}

/** Choosing a record to keep takes its name, address and town too; the neighborhood choice stays. */
export function keepRecordChoices(choices: MergeChoices, id: string): MergeChoices {
  return { ...choices, keepId: id, name: id, address: id, town: id };
}

/** The place a merge leaves, in one line: "Spokane Community College, The Lair, 1810 N Greene St, Spokane WA 99217". */
export function mergeResultLine(records: readonly PlaceRecord[], choices: MergeChoices): { line: string; events: number; markets: number } {
  const byId = new Map(records.map((r) => [r.id, r]));
  const keep = byId.get(choices.keepId)!;
  const name = byId.get(choices.name)?.name ?? keep.name;
  const address = byId.get(choices.address)?.address ?? keep.address;
  const town = byId.get(choices.town) ?? keep;
  return {
    line: `${name.trim()}, ${address.trim()}, ${town.city.trim()} ${town.state.trim()} ${town.zip.trim()}`,
    events: records.reduce((n, r) => n + r.uses.events, 0),
    markets: records.reduce((n, r) => n + r.uses.markets, 0),
  };
}

/** Active places no event and no market uses, by name. `duplicateOf` names the group a record belongs to. */
export function unusedPlaces(places: readonly PlaceRecord[], groups: readonly DuplicateGroupPlan[] = []): { place: PlaceRecord; duplicateOf: string | null }[] {
  const groupOf = new Map<string, string>();
  for (const group of groups) for (const r of group.records) groupOf.set(r.id, group.records[0].name);
  return places
    .filter((p) => !p.deletedAt && !inUse(p))
    .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id))
    .map((place) => ({ place, duplicateOf: groupOf.get(place.id) ?? null }));
}

/** Archived places an upcoming event or an active market still uses (the rule of nav-signals' archivedPlaceInUse). */
export function archivedInUse(places: readonly PlaceRecord[]): PlaceRecord[] {
  return places.filter((p) => p.deletedAt && (p.uses.upcoming > 0 || p.uses.markets > 0)).sort(byNext);
}

export type SpellingRow = { place: PlaceRecord; fixes: SpellingFix[] };

/** Active places with spelling fixes, by next event. */
export function spellingRows(places: readonly PlaceRecord[]): SpellingRow[] {
  return places
    .filter((p) => !p.deletedAt)
    .map((place) => ({ place, fixes: spellingFixes(place) }))
    .filter((row) => row.fixes.length > 0)
    .sort((a, b) => byNext(a.place, b.place));
}

/** Active places whose town, ZIP and state disagree: judgment calls, listed with an edit link, never fixed in bulk. */
export function addressMismatches(places: readonly PlaceRecord[]): { place: PlaceRecord; problems: PlaceProblem[] }[] {
  return places
    .filter((p) => !p.deletedAt)
    .map((place) => ({ place, problems: addressProblems(place) }))
    .filter((row) => row.problems.length > 0)
    .sort((a, b) => byNext(a.place, b.place));
}
