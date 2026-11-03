import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  eventFindMany: vi.fn(),
  eventUpdateMany: vi.fn(),
  venueFindFirst: vi.fn(),
  marketFindMany: vi.fn(),
  marketCreate: vi.fn(),
  auditCreateMany: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/db", () => {
  const client = {
    event: { findMany: mocks.eventFindMany, updateMany: mocks.eventUpdateMany },
    venue: { findFirst: mocks.venueFindFirst },
    market: { findMany: mocks.marketFindMany, create: mocks.marketCreate },
    auditLog: { createMany: mocks.auditCreateMany },
    $transaction: (fn: (tx: unknown) => unknown) => fn(client),
  };
  return { db: client };
});

import { makeMarketFromEvents, marketDraftFromEvents, typicalScheduleFrom, type MarketSourceEvent } from "./make-from-events";

const day = (id: string, date: string, start = "12:00", end = "16:00", venueId = "kendall-summit", title = "Kendall Yards Christmas Market"): MarketSourceEvent => ({
  id,
  title,
  startDate: new Date(`${date}T20:00:00Z`),
  endDate: new Date(`${date}T23:59:00Z`),
  scheduleDays: [{ date, startTime: start, endTime: end, allDay: false }],
  venueId,
});

describe("marketDraftFromEvents", () => {
  it("reads the Kendall Yards Christmas Market dates as Fridays to Sundays, 12 to 4", () => {
    const events = ["2026-11-27", "2026-11-28", "2026-11-29", "2026-12-11", "2026-12-12", "2026-12-13"].map((d, i) => day(`k${i}`, d));
    expect(marketDraftFromEvents(events)).toEqual({
      name: "Kendall Yards Christmas Market",
      venueId: "kendall-summit",
      typicalSchedule: "Fridays to Sundays, 12:00 to 4:00 pm",
    });
  });

  it("reads one Saturday a month as a monthly pattern", () => {
    const events = ["2026-11-14", "2027-01-09", "2027-02-13", "2027-03-13"].map((d, i) =>
      day(`c${i}`, d, "10:00", "14:00", "silver-lake", "Community Market at Silver Lake")
    );
    expect(typicalScheduleFrom(events)).toBe("Second Saturday of the month, 10:00 am to 2:00 pm");
  });

  it("drops a year from the name and picks the most used place", () => {
    const events = [
      day("a", "2026-11-07", "10:00", "13:00", "park", "Spokane Farmers' Market"),
      day("b", "2026-11-14", "10:00", "13:00", "park", "Spokane Farmers' Market 2026"),
      day("c", "2026-11-21", "10:00", "13:00", "elsewhere", "Spokane Farmers' Market"),
    ];
    expect(marketDraftFromEvents(events)).toEqual({ name: "Spokane Farmers' Market", venueId: "park", typicalSchedule: "Saturdays, 10:00 am to 1:00 pm" });
  });

  it("leaves the hours out when the days differ", () => {
    expect(typicalScheduleFrom([day("a", "2026-11-27", "09:00", "19:00"), day("b", "2026-11-28", "10:00", "19:00")])).toBe("Fridays and Saturdays");
  });
});

describe("makeMarketFromEvents", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.eventFindMany.mockResolvedValue(
      ["2026-11-07", "2026-11-14"].map((d, i) => ({
        ...day(`e${i}`, d, "10:00", "13:00", "park", "Spokane Farmers' Market"),
        slug: `sfm-${d}`,
        marketId: null,
        scheduleDays: [{ date: new Date(`${d}T00:00:00Z`), startTime: "10:00", endTime: "13:00", allDay: false }],
      }))
    );
    mocks.venueFindFirst.mockResolvedValue({ id: "park" });
    mocks.marketFindMany.mockResolvedValue([{ slug: "spokane-farmers-market" }]);
    mocks.marketCreate.mockResolvedValue({ id: "m1", name: "Spokane Farmers' Market" });
  });

  it("creates the market with a free slug, links the dates and audits both", async () => {
    const result = await makeMarketFromEvents(["e0", "e1"], {}, "admin", { decisionId: "d1" });
    expect(result).toEqual({ marketId: "m1", slug: "spokane-farmers-market-2", linked: ["e0", "e1"] });
    expect(mocks.marketCreate.mock.calls[0][0].data).toMatchObject({
      name: "Spokane Farmers' Market",
      slug: "spokane-farmers-market-2",
      venueId: "park",
      typicalSchedule: "Saturdays, 10:00 am to 1:00 pm",
    });
    expect(mocks.eventUpdateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ marketId: "m1" }) }));
    const audit = mocks.auditCreateMany.mock.calls[0][0].data;
    expect(audit.map((a: { action: string }) => a.action)).toEqual(["CREATE_MARKET", "UPDATE_EVENT", "UPDATE_EVENT"]);
    expect(audit[1].metadata).toMatchObject({ previousValue: { marketId: null }, details: { decisionId: "d1" } });
  });

  it("uses an override and refuses an archived place", async () => {
    mocks.venueFindFirst.mockResolvedValue(null);
    await expect(makeMarketFromEvents(["e0"], { venueId: "gone" }, "admin")).rejects.toThrow("archived");
  });
});
