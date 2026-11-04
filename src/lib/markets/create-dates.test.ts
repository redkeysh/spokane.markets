import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  marketFindFirst: vi.fn(),
  eventFindMany: vi.fn(),
  eventCreate: vi.fn(),
  redirectFindMany: vi.fn(),
  auditCreateMany: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/db", () => {
  const client = {
    market: { findFirst: mocks.marketFindFirst },
    event: { findMany: mocks.eventFindMany, create: mocks.eventCreate },
    eventSlugRedirect: { findMany: mocks.redirectFindMany },
    auditLog: { createMany: mocks.auditCreateMany },
    $transaction: (fn: (tx: unknown) => unknown) => fn(client),
  };
  return { db: client };
});

import { createMarketDates } from "./create-dates";

const HOME = { id: "kendall", name: "Kendall Yards", address: "1335 W Summit Pkwy", city: "Spokane", state: "WA", zip: "99201", deletedAt: null };
const MARKET = {
  id: "m1",
  name: "Kendall Yards Night Market",
  slug: "kendall-yards-night-market",
  description: "Market description",
  imageUrl: null,
  imageFocalX: 50,
  imageFocalY: 50,
  websiteUrl: "https://kendallyards.com",
  facebookUrl: null,
  instagramUrl: null,
  venue: HOME,
};
const SOURCE = {
  id: "src",
  title: "Kendall Yards Christmas Market 2026",
  startDate: new Date("2026-12-13T20:00:00Z"),
  description: "Holiday booths",
  imageUrl: "https://example.com/p.jpg",
  showImageInList: true,
  websiteUrl: null,
  vendorCategoryPolicy: null,
  participationMode: "REQUEST_TO_JOIN",
  tags: [{ id: "t1" }],
  features: [{ id: "f1" }, { id: "f2" }],
};

describe("createMarketDates", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.marketFindFirst.mockResolvedValue(MARKET);
    mocks.eventFindMany.mockImplementation(async (args: { where: { id?: unknown; marketId?: string; OR?: unknown } }) => {
      if (args.where.id) return [SOURCE];
      if (args.where.OR) return [{ slug: "kendall-yards-christmas-market-2027-11-26" }];
      return [{ startDate: new Date("2027-11-27T20:00:00Z"), endDate: new Date("2027-11-28T00:00:00Z"), scheduleDays: [{ date: new Date("2027-11-27T00:00:00Z") }] }];
    });
    mocks.redirectFindMany.mockResolvedValue([]);
    let n = 0;
    mocks.eventCreate.mockImplementation(async (args: { data: { slug: string; title: string } }) => ({ id: `e${++n}`, slug: args.data.slug, title: args.data.title }));
  });

  it("creates one draft per date at the home place, copied from the chosen date, each with its schedule day", async () => {
    const result = await createMarketDates(
      "m1",
      {
        dates: ["2027-11-26", "2027-11-27", "2027-11-28"].map((date) => ({ date, startTime: "12:00", endTime: "16:00" })),
        copyFromEventId: "src",
        status: "DRAFT",
      },
      "admin"
    );

    expect(result.skipped).toEqual(["2027-11-27"]);
    expect(result.created.map((c) => [c.date, c.slug])).toEqual([
      ["2027-11-26", "kendall-yards-christmas-market-2027-11-26-2"],
      ["2027-11-28", "kendall-yards-christmas-market-2027-11-28"],
    ]);
    const data = mocks.eventCreate.mock.calls[0][0].data;
    expect(data).toMatchObject({
      title: "Kendall Yards Christmas Market 2027",
      status: "DRAFT",
      venueId: "kendall",
      marketId: "m1",
      description: "Holiday booths",
      imageUrl: "https://example.com/p.jpg",
      participationMode: "REQUEST_TO_JOIN",
      tags: { connect: [{ id: "t1" }] },
      features: { connect: [{ id: "f1" }, { id: "f2" }] },
      scheduleDays: { create: [{ startTime: "12:00", endTime: "16:00", allDay: false }] },
    });
    expect(data.scheduleDays.create[0].date.toISOString()).toBe("2027-11-26T12:00:00.000Z");
    expect(data.startDate.toISOString()).toBe("2027-11-26T20:00:00.000Z");
    expect(data.endDate.toISOString()).toBe("2027-11-27T00:00:00.000Z");
    expect("vendorCategoryPolicy" in data).toBe(false);
    expect("websiteUrl" in data).toBe(false);

    const audit = mocks.auditCreateMany.mock.calls[0][0].data;
    expect(audit).toHaveLength(2);
    expect(audit[0]).toMatchObject({ action: "CREATE_EVENT", targetType: "EVENT", targetId: "e1", userId: "admin" });
    expect(audit[0].metadata.newValue).toMatchObject({ status: "DRAFT", marketId: "m1", copiedFrom: "src" });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/markets/kendall-yards-night-market");
  });

  it("uses the market's own details when there is nothing to copy", async () => {
    await createMarketDates("m1", { dates: [{ date: "2027-01-09", allDay: true }], status: "DRAFT" }, "admin");
    expect(mocks.eventCreate.mock.calls[0][0].data).toMatchObject({
      title: "Kendall Yards Night Market",
      description: "Market description",
      websiteUrl: "https://kendallyards.com",
      scheduleDays: { create: [{ startTime: "00:00", endTime: "23:59", allDay: true }] },
    });
  });

  it("refuses a market whose home place is archived, and publishing at a place with no ZIP", async () => {
    mocks.marketFindFirst.mockResolvedValueOnce({ ...MARKET, venue: { ...HOME, deletedAt: new Date() } });
    await expect(createMarketDates("m1", { dates: [{ date: "2027-01-09", allDay: true }], status: "DRAFT" }, "admin")).rejects.toThrow("is archived");
    mocks.marketFindFirst.mockResolvedValueOnce({ ...MARKET, venue: { ...HOME, zip: "" } });
    await expect(createMarketDates("m1", { dates: [{ date: "2027-01-09", allDay: true }], status: "PUBLISHED" }, "admin")).rejects.toThrow("no ZIP");
    expect(mocks.eventCreate).not.toHaveBeenCalled();
  });

  it("refuses to copy a date that is not part of the market", async () => {
    mocks.eventFindMany.mockResolvedValueOnce([]);
    await expect(
      createMarketDates("m1", { dates: [{ date: "2027-01-09", allDay: true }], copyFromEventId: "other", status: "DRAFT" }, "admin")
    ).rejects.toThrow("no longer part of this market");
  });

  it("refuses an archived market", async () => {
    mocks.marketFindFirst.mockResolvedValueOnce(null);
    await expect(createMarketDates("gone", { dates: [{ date: "2027-01-09", allDay: true }], status: "DRAFT" }, "admin")).rejects.toThrow("archived");
  });

  it("refuses dates that have gone by and any status but Draft or Published", async () => {
    await expect(createMarketDates("m1", { dates: [{ date: "2020-01-04", allDay: true }], status: "DRAFT" }, "admin")).rejects.toThrow("has gone by");
    await expect(
      createMarketDates("m1", { dates: [{ date: "2027-01-09", allDay: true }], status: "CANCELLED" as unknown as "DRAFT" }, "admin")
    ).rejects.toThrow("either Draft or Published");
    expect(mocks.marketFindFirst).not.toHaveBeenCalled();
    expect(mocks.eventCreate).not.toHaveBeenCalled();
  });
});
