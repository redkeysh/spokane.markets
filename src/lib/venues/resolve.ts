import { db } from "@/lib/db";
import { geocodeAddress } from "@/lib/geocode";
import { isSameVenue, NEARBY_METERS, realCoords } from "./match";

export type VenueAddressInput = {
  name: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  lat?: number | null;
  lng?: number | null;
};

export type VenueMatch = {
  id: string;
  name: string;
  address: string;
  city: string;
  zip: string;
  lat: number;
  lng: number;
  deletedAt: Date | null;
};

const MATCH_SELECT = {
  id: true,
  name: true,
  address: true,
  city: true,
  zip: true,
  lat: true,
  lng: true,
  deletedAt: true,
} as const;

function validCoords(lat?: number | null, lng?: number | null) {
  return typeof lat === "number" && typeof lng === "number" && !Number.isNaN(lat) && !Number.isNaN(lng)
    ? { lat, lng }
    : null;
}

const METERS_PER_DEGREE_LAT = 111_320;

/** A lat/lng box around a point that contains every spot within NEARBY_METERS of it. */
function nearbyBox(coords: { lat: number; lng: number }) {
  const latDelta = NEARBY_METERS / METERS_PER_DEGREE_LAT;
  const lngDelta = latDelta / Math.cos((coords.lat * Math.PI) / 180);
  return {
    lat: { gte: coords.lat - latDelta, lte: coords.lat + latDelta },
    lng: { gte: coords.lng - lngDelta, lte: coords.lng + lngDelta },
  };
}

type MatchCandidate = { name: string; address: string; city: string; zip: string; lat?: number | null; lng?: number | null; deletedAt: Date | null };

/** The match among `candidates`: the same venue (isSameVenue), active ones before archived ones. */
function pickMatch<T extends MatchCandidate>(input: VenueAddressInput, candidates: readonly T[]): T | null {
  const matches = candidates.filter((candidate) => isSameVenue(input, candidate));
  return matches.find((m) => m.deletedAt === null) ?? matches[0] ?? null;
}

/**
 * The venue an input refers to, if one exists. Active venues win over archived
 * ones. Candidates share the input's ZIP or city, or lie near its coordinates
 * when it has real ones (see realCoords).
 */
export async function findMatchingVenue(input: VenueAddressInput): Promise<VenueMatch | null> {
  const zip = input.zip.trim().slice(0, 5);
  const coords = realCoords(input);
  const candidates = await db.venue.findMany({
    where: {
      OR: [
        ...(zip ? [{ zip: { startsWith: zip } }] : []),
        { city: { equals: input.city.trim(), mode: "insensitive" as const } },
        ...(coords ? [nearbyBox(coords)] : []),
      ],
    },
    select: MATCH_SELECT,
  });
  return pickMatch(input, candidates);
}

/**
 * findMatchingVenue over venues already loaded (archived ones included), with the same
 * candidate rule, for a caller that holds every venue.
 */
export function findMatchingVenueAmong<T extends MatchCandidate>(input: VenueAddressInput, venues: readonly T[]): T | null {
  const zip = input.zip.trim().slice(0, 5);
  const city = input.city.trim().toLowerCase();
  const coords = realCoords(input);
  const box = coords ? nearbyBox(coords) : null;
  const candidates = venues.filter(
    (v) =>
      (zip !== "" && v.zip.startsWith(zip)) ||
      v.city.toLowerCase() === city ||
      (box !== null &&
        typeof v.lat === "number" &&
        typeof v.lng === "number" &&
        v.lat >= box.lat.gte &&
        v.lat <= box.lat.lte &&
        v.lng >= box.lng.gte &&
        v.lng <= box.lng.lte)
  );
  return pickMatch(input, candidates);
}

export type FindOrCreateVenueResult =
  | { venueId: string; created: boolean }
  | { error: string };

function reuseExisting(venue: { id: string; name: string; deletedAt: Date | null }): FindOrCreateVenueResult {
  if (venue.deletedAt) {
    return {
      error: `The venue "${venue.name}" exists but is archived. Restore it under Catalog > Venues and try again.`,
    };
  }
  return { venueId: venue.id, created: false };
}

function trimFields(input: VenueAddressInput) {
  return {
    name: input.name.trim(),
    address: input.address.trim(),
    city: input.city.trim(),
    state: input.state.trim(),
    zip: input.zip.trim(),
  };
}

export type VenueLookup =
  | { status: "existing"; venue: VenueMatch }
  | { status: "new"; coords: { lat: number; lng: number } }
  | { status: "unplaceable" };

/**
 * What findOrCreateVenue does for an input, without creating anything: the
 * matching venue (possibly archived), the coordinates a new venue would get,
 * or "unplaceable" when no geocoder can place the address. Without supplied
 * coordinates it geocodes and matches again at the geocoded spot.
 */
export async function lookupVenue(input: VenueAddressInput): Promise<VenueLookup> {
  const fields = trimFields(input);
  const supplied = validCoords(input.lat, input.lng);
  const existing = await findMatchingVenue({ ...fields, ...supplied });
  if (existing) return { status: "existing", venue: existing };
  if (supplied) return { status: "new", coords: supplied };

  const geocoded = await geocodeAddress(fields);
  if (!geocoded) return { status: "unplaceable" };
  const nearby = await findMatchingVenue({ ...fields, ...geocoded });
  return nearby ? { status: "existing", venue: nearby } : { status: "new", coords: geocoded };
}

/**
 * Reuses the existing venue for an address when there is one; otherwise
 * creates it at the supplied or geocoded coordinates (see lookupVenue). Never
 * fabricates a location: an address no provider can place is rejected.
 */
export async function findOrCreateVenue(input: VenueAddressInput): Promise<FindOrCreateVenueResult> {
  const fields = trimFields(input);
  const lookup = await lookupVenue(input);
  if (lookup.status === "existing") return reuseExisting(lookup.venue);
  if (lookup.status === "unplaceable") {
    return {
      error: `Couldn't find "${fields.address}, ${fields.city}, ${fields.state} ${fields.zip}" on the map. Check the street, city, state, and ZIP, or choose an existing venue.`,
    };
  }
  const coords = lookup.coords;

  try {
    const venue = await db.venue.create({ data: { ...fields, lat: coords.lat, lng: coords.lng } });
    return { venueId: venue.id, created: true };
  } catch (err) {
    // (name, address) is unique: a concurrent request may have just created this venue.
    if (err && typeof err === "object" && "code" in err && (err as { code: unknown }).code === "P2002") {
      const raced = await db.venue.findFirst({
        where: { name: fields.name, address: fields.address },
        select: { id: true, name: true, deletedAt: true },
      });
      if (raced) return reuseExisting(raced);
    }
    throw err;
  }
}
