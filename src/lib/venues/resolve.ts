import { db } from "@/lib/db";
import { geocodeAddress } from "@/lib/geocode";
import { isSameVenue } from "./match";

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

/** The venue an input refers to, if one exists. Active venues win over archived ones. */
export async function findMatchingVenue(input: VenueAddressInput): Promise<VenueMatch | null> {
  const zip = input.zip.trim().slice(0, 5);
  const candidates = await db.venue.findMany({
    where: {
      OR: [
        ...(zip ? [{ zip: { startsWith: zip } }] : []),
        { city: { equals: input.city.trim(), mode: "insensitive" as const } },
      ],
    },
    select: MATCH_SELECT,
  });
  const matches = candidates.filter((candidate) => isSameVenue(input, candidate));
  return matches.find((m) => m.deletedAt === null) ?? matches[0] ?? null;
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

/**
 * Reuses the existing venue for an address when there is one; otherwise
 * geocodes (when no coordinates were supplied) and creates it. Never
 * fabricates a location: an address no provider can place is rejected.
 */
export async function findOrCreateVenue(input: VenueAddressInput): Promise<FindOrCreateVenueResult> {
  const fields = {
    name: input.name.trim(),
    address: input.address.trim(),
    city: input.city.trim(),
    state: input.state.trim(),
    zip: input.zip.trim(),
  };
  let coords = validCoords(input.lat, input.lng);

  const existing = await findMatchingVenue({ ...fields, ...coords });
  if (existing) return reuseExisting(existing);

  if (!coords) {
    coords = await geocodeAddress(fields);
    if (!coords) {
      return {
        error: `Couldn't find "${fields.address}, ${fields.city}, ${fields.state} ${fields.zip}" on the map. Check the street, city, state, and ZIP, or choose an existing venue.`,
      };
    }
    const nearby = await findMatchingVenue({ ...fields, ...coords });
    if (nearby) return reuseExisting(nearby);
  }

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
