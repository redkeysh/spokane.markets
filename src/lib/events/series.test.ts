import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  eventFindUnique: vi.fn(),
  eventFindMany: vi.fn(),
  marketFindMany: vi.fn(),
  loadPlaceGroups: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    event: { findUnique: mocks.eventFindUnique, findMany: mocks.eventFindMany },
    market: { findMany: mocks.marketFindMany },
  },
}));
vi.mock("@/lib/markets/queries", () => ({ loadPlaceGroups: mocks.loadPlaceGroups }));

import { SNAPSHOT_NOW, snapshotDecisionEvents, snapshotIdByTitle, snapshotVenues } from "@/lib/admin/__fixtures__/snapshot";
import { findDuplicateGroups } from "@/lib/venues/match";
import { findSeries, getSeriesFor, type SeriesRow } from "./series";
import { placeGroupIndex } from "./twins";

const events = snapshotDecisionEvents();
const groups = placeGroupIndex(findDuplicateGroups(snapshotVenues.filter((v) => !v.deletedAt)));
const rowOf = (e: (typeof events)[number]): SeriesRow => ({
  id: e.id,
  title: e.title,
  startDate: e.startDate,
  venueId: e.venue.id,
  marketId: e.marketId,
  marketName: e.marketName,
});

describe("findSeries on the 2026-11-03 snapshot", () => {
  const waiting = events.filter((e) => e.status === "PENDING" || e.status === "DRAFT");
  const series = findSeries(waiting.map(rowOf), groups);
  const named = (name: string) => series.find((s) => s.name === name)!;

  it("finds the series among the waiting events, earliest first", () => {
    expect(series.map((s) => [s.name, s.eventIds.length])).toEqual([
      ["Spokane Farmers' Market", 4],
      ["Rathdrum Craft and Farmers Market", 5],
      ["Community Market at Silver Lake", 4],
      ["Kootenai County Farmers' Market", 2],
      ["A Very Merry Market", 4],
      ["German Christmas Market (Post Falls Public Market)", 4],
      ["Kendall Yards Christmas Market", 6],
      ["Cabin Fever Indoor Market", 2],
    ]);
  });

  it("groups a market's dates by the market, named by the market when their titles differ", () => {
    const rathdrum = named("Rathdrum Craft and Farmers Market");
    expect(rathdrum.key).toBe("series:market:cmvv9iv1q001i01mmql2udwe3");
    expect(rathdrum.eventIds[0]).toBe(snapshotIdByTitle("Handmade Holiday Craft Fair"));
    expect(rathdrum.eventIds[4]).toBe(snapshotIdByTitle("Family Fall Festival 2027"));
    expect(rathdrum).toMatchObject({ marketName: "Rathdrum Craft and Farmers Market", suggestMarket: false, suggestedMarket: null });
    expect(named("Kendall Yards Christmas Market")).toMatchObject({ marketName: "Kendall Yards Night Market", suggestMarket: false });
  });

  it("groups dates without a market by core title at one place, and keeps the date that already happened", () => {
    const farmers = named("Spokane Farmers' Market");
    expect(farmers.key.startsWith("series:spokane farmers market@")).toBe(true);
    expect(farmers.dates).toEqual(["2026-10-31", "2026-11-07", "2026-11-14", "2026-11-21"]);
    expect(farmers).toMatchObject({ marketId: null, suggestMarket: true, suggestedMarket: null });
    expect(named("German Christmas Market (Post Falls Public Market)").suggestedMarket).toBeNull();
  });

  it("suggests the market whose dates share the place and most of the title", () => {
    expect(named("Cabin Fever Indoor Market").suggestedMarket).toEqual({ id: "cmw0avyco004001mmxicboc40", name: "Kootenai County Farmers' Market" });
    expect(named("A Very Merry Market").suggestedMarket).toBeNull();
  });

  it("does not count Kendall Yards Night Market's summer listing, which is published and over", () => {
    const listed = findSeries(events.filter((e) => e.status !== "PUBLISHED" || e.endDate > SNAPSHOT_NOW).map(rowOf), groups);
    expect(listed.find((s) => s.name === "Kendall Yards Christmas Market")!.eventIds).toHaveLength(6);
  });
});

describe("findSeries rules", () => {
  const row = (id: string, overrides: Partial<SeriesRow> = {}): SeriesRow => ({
    id,
    title: "Holiday Market",
    startDate: new Date(`2026-12-0${id.slice(-1)}T18:00:00Z`),
    venueId: "hall",
    marketId: null,
    ...overrides,
  });

  it("needs two different dates: two copies on one date are twins, not a series", () => {
    expect(findSeries([row("a1"), row("b1")], new Map())).toEqual([]);
    expect(findSeries([row("a1"), row("b2")], new Map())).toHaveLength(1);
  });

  it("joins places listed twice, and keeps other places apart", () => {
    const places = new Map([
      ["hall", "group"],
      ["hall-2", "group"],
    ]);
    expect(findSeries([row("a1"), row("b2", { venueId: "hall-2" })], places)[0]).toMatchObject({ eventIds: ["a1", "b2"], venueId: "hall" });
    expect(findSeries([row("a1"), row("b2", { venueId: "church" })], places)).toEqual([]);
  });

  it("matches titles by their core, without years and ordinals", () => {
    const series = findSeries([row("a1", { title: "11th Annual Holiday Market 2026" }), row("b2"), row("c3", { title: "Holiday Market" })], new Map());
    expect(series[0]).toMatchObject({ name: "Holiday Market", eventIds: ["a1", "b2", "c3"], dates: ["2026-12-01", "2026-12-02", "2026-12-03"] });
  });

  it("names a market series by the title most of its dates share", () => {
    const market = { marketId: "m1", marketName: "Saturday Market" };
    const series = findSeries([row("a1", { ...market, title: "Winter Fair" }), row("b2", { ...market, title: "Winter Fair" }), row("c3", { ...market, title: "Last Call" })], new Map());
    expect(series[0]).toMatchObject({ key: "series:market:m1", name: "Winter Fair", marketName: "Saturday Market" });
  });

  it("suggests no market whose dates name another season", () => {
    const markets = [{ id: "m1", name: "Fairgrounds Market", listings: [{ title: "Spring Craft Fair", venueId: "hall" }] }];
    expect(findSeries([row("a1", { title: "Fall Craft Fair" }), row("b2", { title: "Fall Craft Fair" })], new Map(), { markets })[0].suggestedMarket).toBeNull();
    expect(findSeries([row("a1", { title: "Craft Fair" }), row("b2", { title: "Craft Fair" })], new Map(), { markets })[0].suggestedMarket).toEqual({ id: "m1", name: "Fairgrounds Market" });
  });

  it("suggests a market by its home place even before it has dates", () => {
    const markets = [{ id: "m1", name: "Holiday Market at the Hall", venueId: "hall", listings: [] }];
    expect(findSeries([row("a1"), row("b2")], new Map(), { markets })[0].suggestedMarket).toEqual({ id: "m1", name: "Holiday Market at the Hall" });
    expect(findSeries([row("a1", { venueId: "church" }), row("b2", { venueId: "church" })], new Map(), { markets })[0].suggestedMarket).toBeNull();
  });
});

describe("getSeriesFor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.loadPlaceGroups.mockResolvedValue(new Map());
    mocks.marketFindMany.mockResolvedValue([]);
  });

  const listing = (id: string, date: string, overrides: Record<string, unknown> = {}) => ({
    id,
    title: "A Very Merry Market",
    startDate: new Date(`${date}T18:00:00Z`),
    endDate: new Date(`${date}T23:00:00Z`),
    venueId: "mall",
    marketId: null,
    market: null,
    scheduleDays: [],
    ...overrides,
  });

  it("returns the series of the event, among listed dates that have not ended", async () => {
    mocks.eventFindUnique.mockResolvedValue({ id: "b", deletedAt: null });
    mocks.eventFindMany.mockResolvedValue([listing("a", "2026-10-30"), listing("b", "2026-11-27"), listing("c", "2026-12-04"), listing("d", "2026-12-11")]);
    const series = await getSeriesFor("b", SNAPSHOT_NOW);
    expect(series).toMatchObject({ name: "A Very Merry Market", eventIds: ["b", "c", "d"] });
    expect(mocks.eventFindMany.mock.calls[0][0].where).toMatchObject({ deletedAt: null });
  });

  it("returns null for an archived event or one with no other date", async () => {
    mocks.eventFindUnique.mockResolvedValue({ id: "b", deletedAt: new Date() });
    expect(await getSeriesFor("b", SNAPSHOT_NOW)).toBeNull();
    mocks.eventFindUnique.mockResolvedValue({ id: "b", deletedAt: null });
    mocks.eventFindMany.mockResolvedValue([listing("b", "2026-11-27")]);
    expect(await getSeriesFor("b", SNAPSHOT_NOW)).toBeNull();
  });
});
