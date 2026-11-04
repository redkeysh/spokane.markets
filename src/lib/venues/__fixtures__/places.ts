/**
 * The 2026-11-03 snapshot's 100 places (venues.json, with their event and market counts) as
 * place records, with upcoming events and next dates from events.json.
 */
import eventsJson from "@/lib/admin/__fixtures__/events.json";
import venuesJson from "@/lib/admin/__fixtures__/venues.json";
import { pacificDate } from "@/lib/admin/format";
import type { PlaceRecord } from "../place-review";

export const FIXTURE_TODAY = "2026-11-03";

export function fixturePlaces(): PlaceRecord[] {
  const upcoming = new Map<string, { count: number; next: PlaceRecord["next"] }>();
  for (const event of eventsJson) {
    if (!["PENDING", "DRAFT", "PUBLISHED"].includes(event.status)) continue;
    if (pacificDate(new Date(event.endDate)) < FIXTURE_TODAY) continue;
    const start = pacificDate(new Date(event.startDate));
    const date = start > FIXTURE_TODAY ? start : FIXTURE_TODAY;
    const entry = upcoming.get(event.venue.id) ?? { count: 0, next: null };
    entry.count += 1;
    if (!entry.next || date < entry.next.date) entry.next = { date, title: event.title };
    upcoming.set(event.venue.id, entry);
  }
  return venuesJson.map((v) => ({
    id: v.id,
    name: v.name,
    address: v.address,
    city: v.city,
    state: v.state,
    zip: v.zip,
    lat: null,
    lng: null,
    neighborhood: v.neighborhood,
    parkingNotes: v.parkingNotes,
    deletedAt: v.deletedAt ? new Date(v.deletedAt) : null,
    uses: { events: v._count.events, markets: v._count.markets, upcoming: upcoming.get(v.id)?.count ?? 0 },
    next: upcoming.get(v.id)?.next ?? null,
  }));
}

export function fixturePlace(name: string, address?: string): PlaceRecord {
  const matches = fixturePlaces().filter((p) => p.name === name && (!address || p.address === address));
  if (matches.length !== 1) throw new Error(`Expected one fixture place named ${name}, found ${matches.length}`);
  return matches[0];
}
