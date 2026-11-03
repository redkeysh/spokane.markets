import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  venueFindMany: vi.fn(),
  venueCreate: vi.fn(),
  venueDeleteMany: vi.fn(),
  marketFindMany: vi.fn(),
  marketCreate: vi.fn(),
  eventCreate: vi.fn(),
  scheduleDayCreateMany: vi.fn(),
  findMatchingVenue: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    venue: { findMany: mocks.venueFindMany, create: mocks.venueCreate, deleteMany: mocks.venueDeleteMany },
    market: { findMany: mocks.marketFindMany, create: mocks.marketCreate },
    $transaction: (fn: (tx: unknown) => unknown) =>
      fn({
        event: { create: mocks.eventCreate },
        eventScheduleDay: { createMany: mocks.scheduleDayCreateMany },
        tag: {},
        feature: {},
      }),
  },
}));
vi.mock("@/lib/neighborhoods", () => ({ getNeighborhoodSlugSet: async () => new Set<string>() }));
vi.mock("@/lib/venues/resolve", () => ({ findMatchingVenue: mocks.findMatchingVenue }));

import { deriveScheduleDays, importData, type ImportPayload } from "./data-import";

const venueRow = (name: string) => ({
  name,
  address: "1 Main St",
  city: "Spokane",
  state: "WA",
  zip: "99201",
  lat: 47.65,
  lng: -117.42,
});

const eventRow = (title: string, venueSlug: string) => ({
  title,
  startDate: "2026-12-05T10:00:00Z",
  endDate: "2026-12-05T16:00:00Z",
  venueSlug,
});

/** Venue ids that an event or market created during the test points at. */
let referencedVenueIds: Set<string>;

beforeEach(() => {
  vi.clearAllMocks();
  referencedVenueIds = new Set();
  mocks.venueFindMany.mockResolvedValue([]);
  mocks.marketFindMany.mockResolvedValue([]);
  mocks.findMatchingVenue.mockResolvedValue(null);
  mocks.venueCreate.mockImplementation(async ({ data }: { data: { name: string } }) => ({
    id: `venue-${data.name}`,
    name: data.name,
  }));
  mocks.eventCreate.mockImplementation(async ({ data }: { data: { slug: string; venueId: string } }) => {
    if (data.slug === "taken") throw new Error("Unique constraint failed on the fields: (`slug`)");
    referencedVenueIds.add(data.venueId);
    return { id: `event-${data.slug}` };
  });
  mocks.marketCreate.mockImplementation(async ({ data }: { data: { slug: string; venueId: string } }) => {
    referencedVenueIds.add(data.venueId);
    return { id: `market-${data.slug}`, slug: data.slug };
  });
  mocks.venueDeleteMany.mockImplementation(async ({ where }: { where: { id: string } }) => ({
    count: referencedVenueIds.has(where.id) ? 0 : 1,
  }));
});

describe("importData unused venue cleanup", () => {
  it("removes a created venue whose only event failed and reports it", async () => {
    const payload: ImportPayload = {
      venues: [venueRow("Hall A"), venueRow("Hall B")],
      events: [
        { ...eventRow("Craft Fair", "hall-a"), slug: "craft-fair" },
        { ...eventRow("Holiday Market", "hall-b"), slug: "taken" },
      ],
    };

    const result = await importData(payload);

    expect(result).toMatchObject({ venuesCreated: 1, venuesRemoved: 1, eventsCreated: 1 });
    expect(result.errors).toContain('Venue "Hall B": removed because none of its markets or events were imported');
    expect(mocks.venueDeleteMany).toHaveBeenCalledWith({
      where: { id: "venue-Hall B", events: { none: {} }, markets: { none: {} } },
    });
  });

  it("keeps a created venue that only a market uses", async () => {
    const result = await importData({
      venues: [venueRow("Hall A")],
      markets: [{ name: "Hall Market", venueSlug: "hall-a" }],
      events: [{ ...eventRow("Craft Fair", "hall-a"), slug: "taken" }],
    });
    expect(result).toMatchObject({ venuesCreated: 1, venuesRemoved: 0, marketsCreated: 1, eventsCreated: 0 });
  });

  it("removes a created venue that no row referenced", async () => {
    const result = await importData({
      venues: [venueRow("Hall A"), venueRow("Hall B")],
      events: [eventRow("Craft Fair", "hall-a")],
    });
    expect(result).toMatchObject({ venuesCreated: 1, venuesRemoved: 1 });
  });

  it("keeps every venue from a venues-only import", async () => {
    const result = await importData({ venues: [venueRow("Hall A"), venueRow("Hall B")] });
    expect(result).toMatchObject({ venuesCreated: 2, venuesRemoved: 0 });
    expect(mocks.venueDeleteMany).not.toHaveBeenCalled();
  });

  it("never deletes an existing venue the import matched", async () => {
    mocks.findMatchingVenue.mockResolvedValue({ id: "existing-1", name: "Hall A", deletedAt: null });
    const result = await importData({
      venues: [venueRow("Hall A")],
      events: [{ ...eventRow("Craft Fair", "hall-a"), slug: "taken" }],
    });
    expect(result).toMatchObject({ venuesCreated: 0, venuesRemoved: 0 });
    expect(mocks.venueDeleteMany).not.toHaveBeenCalled();
  });
});

describe("deriveScheduleDays", () => {
  const derive = (start: string, end: string) => deriveScheduleDays(new Date(start), new Date(end));

  it("gives a same-day event its Pacific hours", () => {
    expect(derive("2026-12-05T18:00:00Z", "2026-12-06T00:00:00Z")).toEqual([
      { date: "2026-12-05", startTime: "10:00", endTime: "16:00", allDay: false },
    ]);
  });

  it("repeats the hours on each day when the start time is earlier than the end time", () => {
    expect(derive("2026-07-10T16:00:00Z", "2026-07-12T23:00:00Z")).toEqual([
      { date: "2026-07-10", startTime: "09:00", endTime: "16:00", allDay: false },
      { date: "2026-07-11", startTime: "09:00", endTime: "16:00", allDay: false },
      { date: "2026-07-12", startTime: "09:00", endTime: "16:00", allDay: false },
    ]);
  });

  it("splits a continuous span into a partial first day, all-day middle days, and a partial last day", () => {
    expect(derive("2026-07-10T17:00:00Z", "2026-07-12T16:00:00Z")).toEqual([
      { date: "2026-07-10", startTime: "10:00", endTime: "23:59", allDay: false },
      { date: "2026-07-11", startTime: "00:00", endTime: "23:59", allDay: true },
      { date: "2026-07-12", startTime: "00:00", endTime: "09:00", allDay: false },
    ]);
  });

  it("uses Pacific dates and times across the end of daylight saving time", () => {
    expect(derive("2026-10-31T16:00:00Z", "2026-11-02T00:00:00Z")).toEqual([
      { date: "2026-10-31", startTime: "09:00", endTime: "16:00", allDay: false },
      { date: "2026-11-01", startTime: "09:00", endTime: "16:00", allDay: false },
    ]);
  });

  it("ends a span that stops at exactly Pacific midnight on the day before", () => {
    expect(derive("2026-07-10T16:00:00Z", "2026-07-12T07:00:00Z")).toEqual([
      { date: "2026-07-10", startTime: "09:00", endTime: "23:59", allDay: false },
      { date: "2026-07-11", startTime: "00:00", endTime: "23:59", allDay: true },
    ]);
  });

  it("derives up to seven days and gives up on longer spans", () => {
    expect(derive("2026-07-01T16:00:00Z", "2026-07-07T23:00:00Z")).toHaveLength(7);
    expect(derive("2026-07-01T16:00:00Z", "2026-07-08T23:00:00Z")).toBeNull();
  });
});

describe("importData schedule days", () => {
  const importEvent = (row: Record<string, unknown>) =>
    importData({ events: [{ title: "Craft Fair", slug: "craft-fair", venueId: "venue-1", ...row } as never] });
  const eventData = () => mocks.eventCreate.mock.calls[0][0].data as { startDate: Date; endDate: Date };
  const dayRecords = () =>
    (mocks.scheduleDayCreateMany.mock.calls[0][0].data as { eventId: string; date: Date; startTime: string; endTime: string; allDay: boolean }[]).map(
      (d) => ({ ...d, date: d.date.toISOString().slice(0, 10) })
    );

  it("derives days from the start and end when the row has none", async () => {
    const result = await importEvent({ startDate: "2026-12-05T18:00:00Z", endDate: "2026-12-06T00:00:00Z" });

    expect(result).toMatchObject({ eventsCreated: 1, eventsNeedingSchedule: [] });
    expect(dayRecords()).toEqual([
      { eventId: "event-craft-fair", date: "2026-12-05", startTime: "10:00", endTime: "16:00", allDay: false },
    ]);
    expect(eventData().startDate.toISOString()).toBe("2026-12-05T18:00:00.000Z");
    expect(eventData().endDate.toISOString()).toBe("2026-12-06T00:00:00.000Z");
  });

  it("writes the row's schedule days, merges duplicate dates, and dates the event from them", async () => {
    const result = await importEvent({
      scheduleDays: [
        { date: "2026-12-12", startTime: "10:00", endTime: "15:00" },
        { date: "2026-12-05", startTime: "12:00", endTime: "16:00" },
        { date: "2026-12-05", startTime: "09:00", endTime: "14:00" },
      ],
    });

    expect(result).toMatchObject({ eventsCreated: 1, errors: [] });
    expect(dayRecords()).toEqual([
      { eventId: "event-craft-fair", date: "2026-12-05", startTime: "09:00", endTime: "16:00", allDay: false },
      { eventId: "event-craft-fair", date: "2026-12-12", startTime: "10:00", endTime: "15:00", allDay: false },
    ]);
    expect(eventData().startDate.toISOString()).toBe("2026-12-05T17:00:00.000Z");
    expect(eventData().endDate.toISOString()).toBe("2026-12-12T23:00:00.000Z");
  });

  it("treats a 00:00 to 23:59 day as all day, as the event forms do", async () => {
    await importEvent({ scheduleDays: [{ date: "2026-12-05", startTime: "00:00", endTime: "23:59" }] });
    expect(dayRecords()[0]).toMatchObject({ allDay: true });
  });

  it.each([
    [[{ date: "2026-12-05" }], "scheduleDays.0.startTime"],
    [[{ date: "12/05/2026", allDay: true }], "scheduleDays.0.date"],
    [[{ date: "2026-02-30", allDay: true }], '"2026-02-30"'],
    [[], "scheduleDays"],
  ])("rejects invalid schedule days %j", async (scheduleDays, mention) => {
    const result = await importEvent({ scheduleDays });
    expect(result.eventsCreated).toBe(0);
    expect(result.errors[0]).toContain(mention);
    expect(mocks.eventCreate).not.toHaveBeenCalled();
  });

  it("rejects a timed day that starts after it ends, naming the day", async () => {
    const result = await importEvent({
      scheduleDays: [
        { date: "2026-12-05", startTime: "10:00", endTime: "16:00" },
        { date: "2026-12-06", startTime: "16:00", endTime: "10:00" },
      ],
    });
    expect(result.errors).toEqual(["Event 1 (Craft Fair): scheduleDays.1 starts at 16:00, after it ends at 10:00"]);
    expect(mocks.eventCreate).not.toHaveBeenCalled();
  });

  it.each(["24:00", "25:00", "12:60"])("rejects the out-of-range time %s", async (time) => {
    const result = await importEvent({ scheduleDays: [{ date: "2026-12-05", startTime: "09:00", endTime: time }] });
    expect(result.errors).toEqual([
      `Event 1 (Craft Fair): invalid scheduleDays.0.endTime "${time}": use a time from 00:00 to 23:59`,
    ]);
    expect(mocks.eventCreate).not.toHaveBeenCalled();
  });

  it("reads a date-only start and end as all-day Pacific dates", async () => {
    await importEvent({ startDate: "2026-12-05", endDate: "2026-12-06" });
    expect(dayRecords()).toEqual([
      { eventId: "event-craft-fair", date: "2026-12-05", startTime: "00:00", endTime: "23:59", allDay: true },
      { eventId: "event-craft-fair", date: "2026-12-06", startTime: "00:00", endTime: "23:59", allDay: true },
    ]);
    expect(eventData().startDate.toISOString()).toBe("2026-12-05T08:00:00.000Z");
    expect(eventData().endDate.toISOString()).toBe("2026-12-07T07:59:00.000Z");
  });

  it("reads a date and time without an offset as Pacific time", async () => {
    await importEvent({ startDate: "2026-07-04T10:00", endDate: "2026-07-04T16:00:00" });
    expect(dayRecords()).toEqual([
      { eventId: "event-craft-fair", date: "2026-07-04", startTime: "10:00", endTime: "16:00", allDay: false },
    ]);
    expect(eventData().startDate.toISOString()).toBe("2026-07-04T17:00:00.000Z");
  });

  it("ends an event that stops at exactly Pacific midnight on the day before, without a phantom day", async () => {
    await importEvent({ startDate: "2026-12-05T18:00:00-08:00", endDate: "2026-12-06T00:00:00-08:00" });
    expect(dayRecords()).toEqual([
      { eventId: "event-craft-fair", date: "2026-12-05", startTime: "18:00", endTime: "23:59", allDay: false },
    ]);
    expect(eventData().endDate.toISOString()).toBe("2026-12-06T07:59:00.000Z");
  });

  it("treats an iCal-style midnight-to-midnight span as all-day days", async () => {
    await importEvent({ startDate: "2026-12-05T00:00", endDate: "2026-12-07T00:00" });
    expect(dayRecords().map((d) => [d.date, d.allDay])).toEqual([
      ["2026-12-05", true],
      ["2026-12-06", true],
    ]);
  });

  it.each(["12/05/2026", "Dec 5, 2026", "2026-12-05T25:00", "2026-02-30", "2026-12-05T10:00:00+0800", "1733400000000"])(
    "rejects the date format %s with a row error",
    async (startDate) => {
      const result = await importEvent({ startDate, endDate: "2026-12-06" });
      expect(result.errors).toEqual([
        `Event 1 (Craft Fair): invalid startDate "${startDate}": use YYYY-MM-DD, YYYY-MM-DDTHH:mm in Pacific time, or an ISO time with Z or an offset`,
      ]);
      expect(mocks.eventCreate).not.toHaveBeenCalled();
    }
  );

  it("requires start and end dates when the row has no schedule days", async () => {
    const result = await importEvent({ startDate: "2026-12-05T18:00:00Z" });
    expect(result.errors[0]).toContain("startDate and endDate are required");
  });

  it("imports a span over seven days without schedule days and reports it", async () => {
    const result = await importEvent({ startDate: "2026-12-01T18:00:00Z", endDate: "2026-12-24T01:00:00Z" });

    expect(result).toMatchObject({
      eventsCreated: 1,
      eventsNeedingSchedule: [{ row: 1, title: "Craft Fair", slug: "craft-fair" }],
    });
    expect(result.errors[0]).toContain("spans more than 7 days");
    expect(mocks.scheduleDayCreateMany).not.toHaveBeenCalled();
    expect(eventData().startDate.toISOString()).toBe("2026-12-01T18:00:00.000Z");
  });
});
