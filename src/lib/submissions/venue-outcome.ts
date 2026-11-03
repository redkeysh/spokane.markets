import type { Submission } from "@prisma/client";
import { db } from "@/lib/db";
import { lookupVenue } from "@/lib/venues/resolve";
import { distanceMeters, realCoords } from "@/lib/venues/match";

export type SubmissionVenueFields = Pick<Submission, "venueName" | "venueAddress" | "venueCity" | "venueState" | "venueZip">;

export type NearestVenue = { venueId: string; name: string; address: string; meters: number };

export type VenueOutcome =
  | { outcome: "incomplete"; note: string; missing: string[] }
  | { outcome: "unplaceable"; note: string }
  | { outcome: "new"; lat: number; lng: number; note: string; nearest: NearestVenue | null }
  | { outcome: "archived"; venueId: string; name: string; note: string }
  | { outcome: "existing"; venueId: string; name: string; address: string };

/** How far from a new place an existing one is still offered instead ("Use that instead"). */
export const NEAREST_VENUE_METERS = 2000;

const METERS_PER_DEGREE_LAT = 111_320;

/** The closest active place within NEAREST_VENUE_METERS of a spot, or null. */
export async function nearestActiveVenue(coords: { lat: number; lng: number }): Promise<NearestVenue | null> {
  const latDelta = NEAREST_VENUE_METERS / METERS_PER_DEGREE_LAT;
  const lngDelta = latDelta / Math.cos((coords.lat * Math.PI) / 180);
  const candidates = await db.venue.findMany({
    where: {
      deletedAt: null,
      lat: { gte: coords.lat - latDelta, lte: coords.lat + latDelta },
      lng: { gte: coords.lng - lngDelta, lte: coords.lng + lngDelta },
    },
    select: { id: true, name: true, address: true, lat: true, lng: true },
  });
  let best: NearestVenue | null = null;
  for (const venue of candidates) {
    const at = realCoords(venue);
    if (!at) continue;
    const meters = Math.round(distanceMeters(coords, at));
    if (meters <= NEAREST_VENUE_METERS && (!best || meters < best.meters)) {
      best = { venueId: venue.id, name: venue.name, address: venue.address, meters };
    }
  }
  return best;
}

const PARTS = [
  ["venueName", "name"],
  ["venueAddress", "street"],
  ["venueCity", "city"],
  ["venueState", "state"],
  ["venueZip", "ZIP"],
] as const;

/**
 * What approving a submission does with its place, using the same lookup
 * approval uses: "existing" reuses an active place, "archived" matches an
 * archived one (approval fails until it is restored), "new" creates one at
 * the geocoded spot (with the nearest active place, if one is close), and
 * "incomplete" or "unplaceable" make approval fail.
 */
export async function venueOutcome(s: SubmissionVenueFields): Promise<VenueOutcome> {
  const missing = PARTS.filter(([key]) => !s[key]?.trim()).map(([, word]) => word);
  if (missing.length > 0) {
    return {
      outcome: "incomplete",
      note: "Venue name, street, city, state, or ZIP is missing, so approval will fail.",
      missing,
    };
  }
  const lookup = await lookupVenue({
    name: s.venueName,
    address: s.venueAddress,
    city: s.venueCity!,
    state: s.venueState!,
    zip: s.venueZip!,
  });
  if (lookup.status === "unplaceable") {
    return { outcome: "unplaceable", note: "No geocoder can place this address, so approval will fail. Fix the address first." };
  }
  if (lookup.status === "new") {
    return {
      outcome: "new",
      lat: lookup.coords.lat,
      lng: lookup.coords.lng,
      note: "Approval creates a new venue at these coordinates.",
      nearest: await nearestActiveVenue(lookup.coords),
    };
  }
  const match = lookup.venue;
  if (match.deletedAt) {
    return { outcome: "archived", venueId: match.id, name: match.name, note: "Matches an archived venue; restore it before approving." };
  }
  return { outcome: "existing", venueId: match.id, name: match.name, address: match.address };
}
