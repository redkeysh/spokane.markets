import { describe, expect, it } from "vitest";
import type { EventListRow, GroupEntry } from "./events-query";
import { buildGroupItems, itemIds, orderWeeks, sortTableRows } from "./events-list-order";

function row(id: string, overrides: Partial<EventListRow> = {}): EventListRow {
  return {
    id,
    title: id,
    slug: id,
    mark: "PENDING",
    archived: false,
    waiting: true,
    placeLine: "Kendall Yards, Spokane",
    marketName: null,
    flags: [],
    needs: [],
    area: "Spokane",
    source: "hand",
    sourceLabel: "Added by hand",
    twin: null,
    series: null,
    tradeShow: false,
    tells: null,
    firstDate: "2026-11-07",
    startIso: "2026-11-07T18:00:00.000Z",
    startLabel: "Sat Nov 7, 10 am",
    updatedIso: "2026-11-01T18:00:00.000Z",
    updatedLabel: "Nov 1, 2026 at 10:00 am",
    ...overrides,
  };
}

function entry(id: string, day: string, at = ""): GroupEntry {
  return { id, day, at, time: "", extraDays: 0 };
}

describe("orderWeeks", () => {
  it("puts this weekend and the coming ones first, then the past ones latest first", () => {
    expect(orderWeeks(["2026-10-31", "2026-11-14", "2026-10-24", "2026-11-07"], "2026-11-07")).toEqual([
      "2026-11-07",
      "2026-11-14",
      "2026-10-31",
      "2026-10-24",
    ]);
  });
});

describe("buildGroupItems", () => {
  it("orders by day, then opening time, then title, with archived rows last", () => {
    const rows = new Map([
      ["b", row("b", { title: "Bazaar" })],
      ["a", row("a", { title: "Art fair" })],
      ["z", row("z", { archived: true, mark: "ARCHIVED" })],
      ["f", row("f")],
    ]);
    const items = buildGroupItems(
      [entry("z", "2026-11-06"), entry("b", "2026-11-07", "09:00"), entry("a", "2026-11-07", "09:00"), entry("f", "2026-11-06", "18:00")],
      rows
    );
    expect(items.flatMap(itemIds)).toEqual(["f", "a", "b", "z"]);
  });

  it("brackets twins at the place of the first and keeps them together", () => {
    const twin = { key: "twins:t1|t2", maybe: false };
    const rows = new Map([
      ["t1", row("t1", { twin })],
      ["x", row("x")],
      ["t2", row("t2", { twin })],
    ]);
    const items = buildGroupItems([entry("t1", "2026-11-06", "18:00"), entry("x", "2026-11-06", "19:00"), entry("t2", "2026-11-07")], rows);
    expect(items.map((i) => i.type)).toEqual(["twins", "event"]);
    expect(itemIds(items[0])).toEqual(["t1", "t2"]);
  });

  it("leaves a twin alone when its partner is not in the weekend", () => {
    const rows = new Map([["t1", row("t1", { twin: { key: "twins:t1|t2", maybe: false } })]]);
    expect(buildGroupItems([entry("t1", "2026-11-06")], rows).map((i) => i.type)).toEqual(["event"]);
  });

  it("collapses two or more dates of a series, and not a single one", () => {
    const series = { key: "series:k", name: "Kendall Yards Christmas Market", index: 1, total: 6, noMarket: false };
    const rows = new Map([
      ["k1", row("k1", { series })],
      ["k2", row("k2", { series: { ...series, index: 2 } })],
      ["k3", row("k3", { series: { ...series, index: 3 } })],
      ["solo", row("solo", { series: { ...series, key: "series:solo" } })],
    ]);
    const items = buildGroupItems(
      [entry("k2", "2026-11-28"), entry("k1", "2026-11-27"), entry("solo", "2026-11-27", "08:00"), entry("k3", "2026-11-29")],
      rows
    );
    expect(items.map((i) => i.type)).toEqual(["series", "event"]);
    expect(itemIds(items[0])).toEqual(["k1", "k2", "k3"]);
    expect(items[0].type === "series" && items[0].total).toBe(6);
  });

  it("brackets twins rather than folding them into their series", () => {
    const series = { key: "series:k", name: "K", index: 1, total: 3, noMarket: false };
    const twin = { key: "twins:a|b", maybe: true };
    const rows = new Map([
      ["a", row("a", { series, twin })],
      ["b", row("b", { series, twin })],
    ]);
    const items = buildGroupItems([entry("a", "2026-11-07"), entry("b", "2026-11-07")], rows);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ type: "twins", maybe: true });
  });
});

describe("sortTableRows", () => {
  const rows = [
    row("1", { title: "Bazaar", startIso: "2026-11-08T18:00:00.000Z", marketName: "Night Market", mark: "DRAFT", updatedIso: "2026-11-02T00:00:00Z" }),
    row("2", { title: "art fair", startIso: "2026-11-07T18:00:00.000Z", marketName: null, mark: "PUBLISHED", updatedIso: "2026-11-03T00:00:00Z" }),
    row("3", { title: "Craft show", startIso: "2026-11-06T18:00:00.000Z", marketName: "Farmers Market", mark: "ARCHIVED", updatedIso: "2026-11-01T00:00:00Z" }),
  ];

  it("sorts by start by default and both ways", () => {
    expect(sortTableRows(rows, "start", "asc").map((r) => r.id)).toEqual(["3", "2", "1"]);
    expect(sortTableRows(rows, "start", "desc").map((r) => r.id)).toEqual(["1", "2", "3"]);
  });

  it("sorts titles without regard to case", () => {
    expect(sortTableRows(rows, "title", "asc").map((r) => r.title)).toEqual(["art fair", "Bazaar", "Craft show"]);
  });

  it("keeps rows without a market last either way", () => {
    expect(sortTableRows(rows, "market", "asc").map((r) => r.id)).toEqual(["3", "1", "2"]);
    expect(sortTableRows(rows, "market", "desc").map((r) => r.id)).toEqual(["1", "3", "2"]);
  });

  it("sorts status live first, archived last", () => {
    expect(sortTableRows(rows, "status", "asc").map((r) => r.mark)).toEqual(["PUBLISHED", "DRAFT", "ARCHIVED"]);
  });

  it("sorts by last change", () => {
    expect(sortTableRows(rows, "updated", "desc").map((r) => r.id)).toEqual(["2", "1", "3"]);
  });
});
