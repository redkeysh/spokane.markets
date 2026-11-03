import { beforeEach, describe, expect, it, vi } from "vitest";

const { transactionMock, txEventCreate, txScheduleCreateMany, venueFindFirst } = vi.hoisted(() => ({
  transactionMock: vi.fn(),
  txEventCreate: vi.fn(),
  txScheduleCreateMany: vi.fn(),
  venueFindFirst: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: { $transaction: transactionMock, venue: { findFirst: venueFindFirst } },
}));
vi.mock("@/lib/venues/resolve", () => ({ findOrCreateVenue: vi.fn() }));

import {
  buildScheduleDayRecords,
  computeEventDatesFromSchedule,
  createEvent,
  type EventData,
} from "./event-service";

describe("buildScheduleDayRecords", () => {
  it("keeps distinct dates as separate rows", () => {
    const rows = buildScheduleDayRecords("e1", [
      { date: "2026-07-04", allDay: false, startTime: "10:00", endTime: "15:00" },
      { date: "2026-07-05", allDay: true },
    ]);
    expect(rows).toHaveLength(2);
    expect(rows[1]).toMatchObject({ startTime: "00:00", endTime: "23:59", allDay: true });
  });

  it("merges two sessions on one date into the span that covers both", () => {
    const rows = buildScheduleDayRecords("e1", [
      { date: "2026-07-04", allDay: false, startTime: "13:00", endTime: "17:00" },
      { date: "2026-07-04", allDay: false, startTime: "09:00", endTime: "12:00" },
    ]);
    expect(rows).toEqual([
      { eventId: "e1", date: new Date("2026-07-04T12:00:00.000Z"), startTime: "09:00", endTime: "17:00", allDay: false },
    ]);
  });

  it("makes a merged date all day when any session on it is all day", () => {
    const rows = buildScheduleDayRecords("e1", [
      { date: "2026-07-04", allDay: false, startTime: "13:00", endTime: "17:00" },
      { date: "2026-07-04", allDay: true },
    ]);
    expect(rows).toEqual([
      { eventId: "e1", date: new Date("2026-07-04T12:00:00.000Z"), startTime: "00:00", endTime: "23:59", allDay: true },
    ]);
  });
});

describe("computeEventDatesFromSchedule", () => {
  it("spans the merged sessions when a date appears more than once, in any order", () => {
    const { startDate, endDate } = computeEventDatesFromSchedule("", "", [
      { date: "2026-07-04", allDay: false, startTime: "13:00", endTime: "17:00" },
      { date: "2026-07-04", allDay: false, startTime: "09:00", endTime: "12:00" },
    ]);
    expect(startDate.toISOString()).toBe("2026-07-04T16:00:00.000Z");
    expect(endDate.toISOString()).toBe("2026-07-05T00:00:00.000Z");
    expect(startDate.getTime()).toBeLessThan(endDate.getTime());
  });

  it("uses the first and last dates across a multi-day schedule", () => {
    const { startDate, endDate } = computeEventDatesFromSchedule("", "", [
      { date: "2026-07-05", allDay: false, startTime: "10:00", endTime: "14:00" },
      { date: "2026-07-04", allDay: true },
    ]);
    expect(startDate.toISOString()).toBe("2026-07-04T07:00:00.000Z");
    expect(endDate.toISOString()).toBe("2026-07-05T21:00:00.000Z");
  });
});

describe("createEvent", () => {
  const data = {
    title: "Market Day",
    slug: "market-day",
    description: null,
    startDate: "2026-07-04T17:00:00.000Z",
    endDate: "2026-07-04T22:00:00.000Z",
    scheduleDays: [{ date: "2026-07-04", allDay: false, startTime: "10:00", endTime: "15:00" }],
    venueId: "venue-1",
  } as unknown as EventData;
  const tx = { event: { create: txEventCreate }, eventScheduleDay: { createMany: txScheduleCreateMany } };

  beforeEach(() => {
    vi.clearAllMocks();
    venueFindFirst.mockResolvedValue({ id: "venue-1" });
    transactionMock.mockImplementation(async (fn: (client: typeof tx) => Promise<unknown>) => fn(tx));
    txEventCreate.mockResolvedValue({ id: "event-1", slug: "market-day" });
  });

  it("writes the event, its schedule days, and the caller's step in one transaction", async () => {
    const inTransaction = vi.fn();
    const result = await createEvent(data, { status: "PUBLISHED", inTransaction });
    expect(result).toEqual({ event: { id: "event-1", slug: "market-day" }, error: null });
    expect(transactionMock).toHaveBeenCalledOnce();
    expect(txScheduleCreateMany).toHaveBeenCalledOnce();
    expect(inTransaction).toHaveBeenCalledWith(tx, { id: "event-1", slug: "market-day" });
  });

  it("propagates a failure from the caller's step so the transaction rolls back", async () => {
    const failure = new Error("already reviewed");
    await expect(
      createEvent(data, {
        inTransaction: async () => {
          throw failure;
        },
      })
    ).rejects.toBe(failure);
  });

  it("returns a venue error without opening a transaction", async () => {
    venueFindFirst.mockResolvedValue(null);
    const result = await createEvent(data);
    expect(result.event).toBeNull();
    expect(transactionMock).not.toHaveBeenCalled();
  });
});
