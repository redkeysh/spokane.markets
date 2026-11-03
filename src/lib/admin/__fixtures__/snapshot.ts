/**
 * The live listing snapshot of 2026-11-03 (events.json: the 138 non-archived
 * events; venues.json: all 100 places) shaped as decision and rail input.
 * The snapshot carries no schedule days, descriptions, tags or creation
 * times; see the options and defaults below.
 */
import type { DecisionEvent, DecisionInput, DecisionVenue } from "../decisions/types";
import { addDays, pacificDate, pacificTime } from "../format";
import type { RailInput } from "../weekends";
import eventsJson from "./events.json";
import venuesJson from "./venues.json";

/** 10:40 am Pacific on Tuesday, November 3, 2026, when the snapshot was taken. */
export const SNAPSHOT_NOW = new Date("2026-11-03T18:40:00.000Z");

type SnapshotEvent = (typeof eventsJson)[number];

export const snapshotEvents: SnapshotEvent[] = eventsJson;

export const snapshotVenues: DecisionVenue[] = venuesJson.map((v) => ({
  id: v.id,
  name: v.name,
  address: v.address,
  city: v.city,
  state: v.state,
  zip: v.zip,
  lat: null,
  lng: null,
  neighborhood: v.neighborhood,
  deletedAt: v.deletedAt ? new Date(v.deletedAt) : null,
}));

const venueById = new Map(snapshotVenues.map((v) => [v.id, v]));

/**
 * The schedule days the 20261103190000_backfill_event_schedule_days migration
 * writes for an event without any: one per Pacific date for spans of up to
 * seven days, the same hours every day when the start time is before the end
 * time, otherwise a first day from the start, a last day to the end, and all
 * day between.
 */
export function backfilledScheduleDays(startDate: Date, endDate: Date) {
  const firstDay = pacificDate(startDate);
  const lastDay = pacificDate(endDate);
  const startTime = pacificTime(startDate);
  const endTime = pacificTime(endDate);
  const days = [];
  for (let day = firstDay, n = 0; day <= lastDay && n <= 6; day = addDays(day, 1), n += 1) days.push(day);
  if (days[days.length - 1] !== lastDay) return [];
  const sameHours = startTime < endTime;
  return days.map((day) => ({
    date: day,
    startTime: sameHours || day === firstDay ? startTime : "00:00",
    endTime: sameHours || day === lastDay ? endTime : "23:59",
    allDay: !sameHours && day !== firstDay && day !== lastDay,
  }));
}

/** Creation times of the snapshot's two imports; the other events were added by hand earlier. */
function createdAtFor(id: string): Date {
  if (id.startsWith("cmvv9iv")) return new Date("2026-10-30T17:45:10.000Z");
  if (id.startsWith("cmw0avy")) return new Date("2026-11-03T06:22:11.000Z");
  return new Date("2026-04-01T17:00:00.000Z");
}

export type SnapshotOptions = {
  /** Add the schedule days the backfill migration writes (the state of the database after it ran). */
  backfill?: boolean;
};

export function snapshotDecisionEvents(options: SnapshotOptions = {}): DecisionEvent[] {
  return snapshotEvents.map((e) => {
    const startDate = new Date(e.startDate);
    const endDate = new Date(e.endDate);
    const venue = venueById.get(e.venue.id);
    if (!venue) throw new Error(`Snapshot event ${e.id} has an unknown venue ${e.venue.id}`);
    return {
      id: e.id,
      title: e.title,
      slug: e.slug,
      status: e.status,
      startDate,
      endDate,
      createdAt: createdAtFor(e.id),
      updatedAt: createdAtFor(e.id),
      scheduleDays: options.backfill ? backfilledScheduleDays(startDate, endDate) : [],
      description: null,
      imageUrl: null,
      websiteUrl: null,
      facebookUrl: null,
      instagramUrl: null,
      tagCount: 1,
      featureCount: 1,
      marketId: e.market?.id ?? null,
      marketName: e.market?.name ?? null,
      venue,
      submittedBy: null,
      submission: null,
    };
  });
}

export function snapshotDecisionInput(options: SnapshotOptions = {}): DecisionInput {
  return { now: SNAPSHOT_NOW, events: snapshotDecisionEvents(options), submissions: [], venues: snapshotVenues, memos: [] };
}

export function snapshotRailInput(options: SnapshotOptions = {}): RailInput {
  return {
    events: snapshotDecisionEvents(options).map((e) => ({
      id: e.id,
      title: e.title,
      status: e.status,
      startDate: e.startDate,
      endDate: e.endDate,
      scheduleDays: e.scheduleDays,
    })),
    submissions: [],
  };
}

export function snapshotIdByTitle(title: string, date?: string): string {
  const matches = snapshotEvents.filter((e) => e.title === title && (!date || pacificDate(new Date(e.startDate)) === date));
  if (matches.length !== 1) throw new Error(`Expected one snapshot event titled ${title}${date ? ` on ${date}` : ""}, found ${matches.length}`);
  return matches[0].id;
}
