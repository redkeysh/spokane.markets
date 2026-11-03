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

function nameTokenOverlap(a: string, b: string) {
  const ta = new Set(normalizeVenueName(a).split(" ").filter(Boolean));
  const tb = new Set(normalizeVenueName(b).split(" ").filter(Boolean));
  const shared = [...ta].filter((t) => tb.has(t)).length;
  const union = new Set([...ta, ...tb]).size;
  return { ta, tb, jaccard: union > 0 ? shared / union : 0 };
}

/** Near-identical names: safe for automatic reuse ("St. Luke Lutheran Church" = "St Luke Lutheran Church"). */
export function namesMatch(a: string, b: string): boolean {
  const na = normalizeVenueName(a);
  if (na !== "" && na === normalizeVenueName(b)) return true;
  return nameTokenOverlap(a, b).jaccard >= 0.75;
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

function atSameSpot(a: VenueLike, b: VenueLike): boolean {
  if (a.lat == null || a.lng == null || b.lat == null || b.lng == null) return false;
  return distanceMeters({ lat: a.lat, lng: a.lng }, { lat: b.lat, lng: b.lng }) <= SAME_SPOT_METERS;
}

function sameStreetAddress(a: VenueLike, b: VenueLike): boolean {
  const core = streetCore(a.address);
  return core !== "" && core === streetCore(b.address);
}

/**
 * Strict: safe to reuse an existing venue automatically instead of creating a
 * new one. Requires a near-identical name plus the same street address or spot.
 */
export function isSameVenue(a: VenueLike, b: VenueLike): boolean {
  if (!sameLocality(a, b) && !atSameSpot(a, b)) return false;
  if (!namesMatch(a.name, b.name)) return false;
  return sameStreetAddress(a, b) || atSameSpot(a, b);
}

/**
 * Loose: worth showing an admin as a possible duplicate. Also catches the same
 * address under a different name, and the same name with a mistyped address.
 */
export function isPossibleDuplicate(a: VenueLike, b: VenueLike): boolean {
  if (isSameVenue(a, b)) return true;
  if (sameLocality(a, b) && sameStreetAddress(a, b)) return true;
  if (sameLocality(a, b) && normalizeVenueName(a.name) === normalizeVenueName(b.name)) return true;
  return atSameSpot(a, b) && namesLookAlike(a.name, b.name);
}

/** Groups (2 or more venues each) linked by isPossibleDuplicate, transitively. */
export function findDuplicateGroups<T extends VenueLike & { id: string }>(venues: T[]): T[][] {
  const parent = new Map(venues.map((v) => [v.id, v.id]));
  const find = (id: string): string => {
    let root = id;
    while (parent.get(root) !== root) root = parent.get(root)!;
    parent.set(id, root);
    return root;
  };
  for (let i = 0; i < venues.length; i++) {
    for (let j = i + 1; j < venues.length; j++) {
      if (isPossibleDuplicate(venues[i], venues[j])) {
        parent.set(find(venues[i].id), find(venues[j].id));
      }
    }
  }
  const groups = new Map<string, T[]>();
  for (const venue of venues) {
    const root = find(venue.id);
    groups.set(root, [...(groups.get(root) ?? []), venue]);
  }
  return [...groups.values()].filter((group) => group.length > 1);
}
