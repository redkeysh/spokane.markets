import { findTown } from "@/lib/admin/regions";
import { pairKey } from "@/lib/events/twins";

export type VenueLike = {
  id?: string;
  name: string;
  address: string;
  city: string;
  zip: string;
  lat?: number | null;
  lng?: number | null;
};

/** Coordinates closer than this are treated as the same spot. */
export const SAME_SPOT_METERS = 75;

/** Within this distance, the same street address and name is one venue even when the city or ZIP differs. */
export const NEARBY_METERS = 1000;

/** The admin venue form's starting pin. A venue saved without moving it has no real location. */
export const DEFAULT_PIN = { lat: 47.6588, lng: -117.426 } as const;

/** The coordinates, or null when they are missing or still the untouched DEFAULT_PIN. */
export function realCoords(v: { lat?: number | null; lng?: number | null }): { lat: number; lng: number } | null {
  if (v.lat == null || v.lng == null || Number.isNaN(v.lat) || Number.isNaN(v.lng)) return null;
  if (Math.abs(v.lat - DEFAULT_PIN.lat) < 1e-6 && Math.abs(v.lng - DEFAULT_PIN.lng) < 1e-6) return null;
  return { lat: v.lat, lng: v.lng };
}

const TOKEN_ALIASES: Record<string, string> = {
  street: "st",
  avenue: "ave",
  av: "ave",
  boulevard: "blvd",
  road: "rd",
  drive: "dr",
  lane: "ln",
  court: "ct",
  place: "pl",
  highway: "hwy",
  parkway: "pkwy",
  circle: "cir",
  terrace: "ter",
  trail: "trl",
  square: "sq",
  north: "n",
  south: "s",
  east: "e",
  west: "w",
  northeast: "ne",
  northwest: "nw",
  southeast: "se",
  southwest: "sw",
  suite: "ste",
  building: "bldg",
  center: "ctr",
  centre: "ctr",
  saint: "st",
  mount: "mt",
  fort: "ft",
};

function normalizeTokens(value: string): string[] {
  return value
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((token) => TOKEN_ALIASES[token] ?? token);
}

export function normalizeVenueName(name: string): string {
  const tokens = normalizeTokens(name);
  if (tokens[0] === "the" && tokens.length > 1) tokens.shift();
  return tokens.join(" ");
}

/** The normalized name without a trailing qualifier in parentheses or after a comma or spaced dash ("Kendall Yards (Summit Parkway)" -> "kendall yards"). */
export function baseVenueName(name: string): string {
  const base = normalizeVenueName(name.replace(/\([^)]*\)\s*$/, "").split(/,|\s\p{Pd}\s/u)[0]);
  return base || normalizeVenueName(name);
}

export function normalizeStreetAddress(address: string): string {
  return normalizeTokens(address).join(" ");
}

const STREET_TYPES = new Set(["st", "ave", "blvd", "rd", "dr", "ln", "ct", "pl", "hwy", "pkwy", "cir", "ter", "trl", "sq", "way"]);
const UNIT_MARKERS = new Set(["ste", "suit", "unit", "apt", "bldg", "rm", "room", "fl", "floor"]);

/** Street number and name only: drops a trailing unit and the street type ("4327 N Ash St Ste 1" -> "4327 n ash"). */
export function streetCore(address: string): string {
  const tokens = normalizeTokens(address);
  const unitAt = tokens.findIndex((t) => UNIT_MARKERS.has(t));
  return (unitAt === -1 ? tokens : tokens.slice(0, unitAt)).filter((t) => !STREET_TYPES.has(t)).join(" ");
}

/** The unit after a suite or unit marker ("404 N Havana St Suite 1" -> "1"), or "" when there is none. */
export function streetUnit(address: string): string {
  const tokens = normalizeTokens(address);
  const unitAt = tokens.findIndex((t) => UNIT_MARKERS.has(t));
  return unitAt === -1 ? "" : tokens.slice(unitAt + 1).join(" ");
}

function normalizeCity(city: string): string {
  return normalizeTokens(city).join(" ");
}

function zip5(zip: string): string {
  return zip.trim().slice(0, 5);
}

/** Same ZIP, or the same city name when either ZIP is missing or malformed. */
export function sameLocality(a: VenueLike, b: VenueLike): boolean {
  const za = zip5(a.zip);
  const zb = zip5(b.zip);
  if (/^\d{5}$/.test(za) && /^\d{5}$/.test(zb)) return za === zb;
  return normalizeCity(a.city) !== "" && normalizeCity(a.city) === normalizeCity(b.city);
}

/** Same first three ZIP digits: one postal area, such as 992 for both Spokane and Spokane Valley. */
function sameZipArea(a: VenueLike, b: VenueLike): boolean {
  const za = zip5(a.zip);
  const zb = zip5(b.zip);
  return /^\d{5}$/.test(za) && /^\d{5}$/.test(zb) && za.slice(0, 3) === zb.slice(0, 3);
}

/** One known town however its name is spelled ("SPOKANE" and "Spokane", "Post Falles" and "Post Falls"). */
function sameKnownTown(a: VenueLike, b: VenueLike): boolean {
  const ta = findTown(a.city);
  return ta !== null && ta === findTown(b.city);
}

function nameTokenOverlap(a: string, b: string) {
  const ta = new Set(normalizeVenueName(a).split(" ").filter(Boolean));
  const tb = new Set(normalizeVenueName(b).split(" ").filter(Boolean));
  const shared = [...ta].filter((t) => tb.has(t)).length;
  const union = new Set([...ta, ...tb]).size;
  return { ta, tb, jaccard: union > 0 ? shared / union : 0 };
}

function numberTokens(tokens: Set<string>): string {
  return [...tokens].filter((t) => /\d/.test(t)).sort().join(" ");
}

/**
 * Near-identical names: safe for automatic reuse ("St. Luke Lutheran Church" =
 * "St Luke Lutheran Church"). Names with different numbers never match
 * ("Building 7" and "Building 8").
 */
export function namesMatch(a: string, b: string): boolean {
  const na = normalizeVenueName(a);
  if (na !== "" && na === normalizeVenueName(b)) return true;
  const { ta, tb, jaccard } = nameTokenOverlap(a, b);
  return numberTokens(ta) === numberTokens(tb) && jaccard >= 0.75;
}

/**
 * One-way: `qualified` has a trailing qualifier and equals `plain` without it
 * ("Kendall Yards (Summit Parkway)" against "Kendall Yards"). A plain name
 * never matches a qualified one, and two qualifiers on one base name never
 * match each other.
 */
export function qualifiedNameMatches(qualified: string, plain: string): boolean {
  const base = baseVenueName(qualified);
  return base !== normalizeVenueName(qualified) && base === normalizeVenueName(plain);
}

/** Looser: mostly overlapping words, or one name inside the other ("Kendall Yards" in "Kendall Yards (Summit Parkway)"). */
export function namesLookAlike(a: string, b: string): boolean {
  if (namesMatch(a, b)) return true;
  const { ta, tb, jaccard } = nameTokenOverlap(a, b);
  if (jaccard >= 0.6) return true;
  const [small, large] = ta.size <= tb.size ? [ta, tb] : [tb, ta];
  return small.size >= 2 && [...small].every((t) => large.has(t));
}

export function distanceMeters(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number }
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const earthRadius = 6371000;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * earthRadius * Math.asin(Math.sqrt(h));
}

/** False when either side has no real coordinates (see realCoords). */
function withinMeters(a: VenueLike, b: VenueLike, meters: number): boolean {
  const ca = realCoords(a);
  const cb = realCoords(b);
  return ca !== null && cb !== null && distanceMeters(ca, cb) <= meters;
}

function atSameSpot(a: VenueLike, b: VenueLike): boolean {
  return withinMeters(a, b, SAME_SPOT_METERS);
}

/** Same street number and name, and the same unit unless either address has none. */
function sameStreetAddress(a: VenueLike, b: VenueLike): boolean {
  const core = streetCore(a.address);
  if (core === "" || core !== streetCore(b.address)) return false;
  const ua = streetUnit(a.address);
  const ub = streetUnit(b.address);
  return ua === "" || ub === "" || ua === ub;
}

/**
 * Strict: safe to reuse `existing` automatically instead of creating `input`.
 * Requires a near-identical name at the same street address (or, in the same
 * city or ZIP, the same spot), or a qualified input name whose base equals the
 * existing plain name at the same street address. Different places that share
 * an address under unrelated names ("Riverfront Park" and "Spokane Pavilion at
 * Riverfront Park") or different qualifiers stay apart. When the city and ZIP
 * differ, the street address must match and both venues must have real
 * coordinates within NEARBY_METERS.
 */
export function isSameVenue(input: VenueLike, existing: VenueLike): boolean {
  const sameAddress = sameStreetAddress(input, existing);
  const localityMatches = sameLocality(input, existing);
  if (!localityMatches && !(sameAddress && withinMeters(input, existing, NEARBY_METERS))) return false;
  if (namesMatch(input.name, existing.name)) return sameAddress || atSameSpot(input, existing);
  return sameAddress && qualifiedNameMatches(input.name, existing.name);
}

/**
 * Loose: worth showing an admin as a possible duplicate. Also catches the same
 * address under a different name, the same name with a mistyped address, and
 * the same address and name with the city and ZIP typed differently within one
 * postal area or one town. Never used to merge without an admin's choice.
 */
export function isPossibleDuplicate(a: VenueLike, b: VenueLike): boolean {
  if (isSameVenue(a, b) || isSameVenue(b, a)) return true;
  if (sameLocality(a, b) && sameStreetAddress(a, b)) return true;
  if (sameLocality(a, b) && normalizeVenueName(a.name) === normalizeVenueName(b.name)) return true;
  if ((sameZipArea(a, b) || sameKnownTown(a, b)) && sameStreetAddress(a, b) && namesLookAlike(a.name, b.name)) return true;
  return atSameSpot(a, b) && namesLookAlike(a.name, b.name);
}

export type DuplicateMemos = {
  /** pairKey of two places the owner said are different: that pair is never linked directly. */
  different?: ReadonlySet<string>;
  /** pairKey of two places the owner said are one place: always linked. */
  same?: ReadonlySet<string>;
};

/** The owner's "different places" and "same place" pairs among memo rows, as findDuplicateGroups takes them. */
export function placeMemosOf(memos: readonly { kind: string; key: string }[]): DuplicateMemos {
  return {
    different: new Set(memos.filter((m) => m.kind === "not-same-place").map((m) => m.key)),
    same: new Set(memos.filter((m) => m.kind === "same-place").map((m) => m.key)),
  };
}

/** Meters in one degree of latitude on the sphere distanceMeters uses. */
const METERS_PER_DEGREE_LAT = (6371000 * Math.PI) / 180;

/**
 * Index pairs (i, j) of pinned venues that may be within SAME_SPOT_METERS of each other. The pins go
 * into a grid of cells at least that wide in both directions (the width in longitude is set for the
 * pin farthest from the equator, with the columns dividing 360 degrees evenly so the grid wraps), and
 * each pin is paired with the pins of its own and the eight neighboring cells.
 */
function nearbyPairs(venues: readonly VenueLike[], add: (i: number, j: number) => void): void {
  const pins = venues.flatMap((venue, i) => {
    const coords = realCoords(venue);
    return coords ? [{ i, lat: coords.lat, lng: (((coords.lng + 180) % 360) + 360) % 360 }] : [];
  });
  if (pins.length < 2) return;
  const latSpan = (SAME_SPOT_METERS / METERS_PER_DEGREE_LAT) * 1.01;
  const farthest = Math.min(90, pins.reduce((most, p) => Math.max(most, Math.abs(p.lat)), 0) + latSpan);
  const cos = Math.cos((farthest * Math.PI) / 180);
  const columns = cos > latSpan / 360 ? Math.max(1, Math.floor((360 * cos) / latSpan)) : 1;
  const lngSpan = 360 / columns;
  const cells = new Map<string, number[]>();
  const cellKey = (row: number, column: number) => `${row}:${((column % columns) + columns) % columns}`;
  const placed = pins.map((pin) => {
    const row = Math.floor(pin.lat / latSpan);
    const column = Math.floor(pin.lng / lngSpan);
    const key = cellKey(row, column);
    cells.set(key, [...(cells.get(key) ?? []), pin.i]);
    return { i: pin.i, row, column };
  });
  for (const { i, row, column } of placed) {
    const seen = new Set<string>();
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        const key = cellKey(row + dr, column + dc);
        if (seen.has(key)) continue;
        seen.add(key);
        for (const j of cells.get(key) ?? []) if (j > i) add(i, j);
      }
    }
  }
}

/**
 * Index pairs (i < j) that isPossibleDuplicate can hold for, and more: every rule it applies needs
 * the same street core, the same normalized name, or two real pins within SAME_SPOT_METERS, so
 * only venues sharing a street core or a name, or pinned close together, are paired.
 */
function candidatePairs(venues: readonly VenueLike[]): [number, number][] {
  const pairs = new Map<string, [number, number]>();
  const add = (i: number, j: number) => {
    const [a, b] = i < j ? [i, j] : [j, i];
    pairs.set(`${a},${b}`, [a, b]);
  };
  const addBuckets = (keyOf: (v: VenueLike) => string | null) => {
    const buckets = new Map<string, number[]>();
    venues.forEach((venue, i) => {
      const key = keyOf(venue);
      if (key === null) return;
      const bucket = buckets.get(key);
      if (bucket) bucket.push(i);
      else buckets.set(key, [i]);
    });
    for (const bucket of buckets.values()) {
      for (let x = 0; x < bucket.length; x++) for (let y = x + 1; y < bucket.length; y++) add(bucket[x], bucket[y]);
    }
  };
  addBuckets((v) => streetCore(v.address) || null);
  addBuckets((v) => normalizeVenueName(v.name));
  nearbyPairs(venues, add);
  return [...pairs.values()];
}

/** Index pairs of the venues whose ids form a key of `keys` (pairKey of two ids). */
function memoPairs(venues: readonly { id: string }[], keys: ReadonlySet<string>): [number, number][] {
  const indexOf = new Map(venues.map((v, i) => [v.id, i]));
  const pairs: [number, number][] = [];
  for (const key of keys) {
    for (let at = key.indexOf("|"); at !== -1; at = key.indexOf("|", at + 1)) {
      const i = indexOf.get(key.slice(0, at));
      const j = indexOf.get(key.slice(at + 1));
      if (i !== undefined && j !== undefined && i !== j && pairKey(venues[i].id, venues[j].id) === key) {
        pairs.push(i < j ? [i, j] : [j, i]);
        break;
      }
    }
  }
  return pairs;
}

/**
 * Groups (2 or more venues each) linked by isPossibleDuplicate or a "same"
 * memo, transitively. A "different" memo removes only its own pair's link, so
 * a group the owner split pair by pair falls apart. Only candidate pairs are
 * compared (see candidatePairs), so the cost grows about linearly with the
 * number of venues.
 */
export function findDuplicateGroups<T extends VenueLike & { id: string }>(venues: T[], memos: DuplicateMemos = {}): T[][] {
  const parent = venues.map((_, i) => i);
  const find = (i: number): number => {
    let root = i;
    while (parent[root] !== root) root = parent[root];
    parent[i] = root;
    return root;
  };
  const join = (i: number, j: number) => {
    parent[find(i)] = find(j);
  };
  if (memos.same?.size) for (const [i, j] of memoPairs(venues, memos.same)) join(i, j);
  for (const [i, j] of candidatePairs(venues)) {
    if (memos.different?.has(pairKey(venues[i].id, venues[j].id))) continue;
    if (isPossibleDuplicate(venues[i], venues[j])) join(i, j);
  }
  const groups = new Map<number, T[]>();
  venues.forEach((venue, i) => {
    const root = find(i);
    const group = groups.get(root);
    if (group) group.push(venue);
    else groups.set(root, [venue]);
  });
  return [...groups.values()].filter((group) => group.length > 1);
}
