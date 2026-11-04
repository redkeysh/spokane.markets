import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  eventFindMany: vi.fn(),
  marketFindMany: vi.fn(),
  venueFindMany: vi.fn(),
  vendorFindMany: vi.fn(),
  userFindMany: vi.fn(),
  submissionFindMany: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    event: { findMany: mocks.eventFindMany },
    market: { findMany: mocks.marketFindMany },
    venue: { findMany: mocks.venueFindMany },
    vendorProfile: { findMany: mocks.vendorFindMany },
    user: { findMany: mocks.userFindMany },
    submission: { findMany: mocks.submissionFindMany },
  },
}));

import {
  everyTermMatches,
  joinMeta,
  normalizeQuery,
  parseDateQuery,
  rankByName,
  searchAdmin,
  searchTerms,
} from "./search";

/** Tuesday Nov 3, 2026, 9:41 am Pacific. */
const NOW = new Date("2026-11-03T17:41:00.000Z");
const TODAY = "2026-11-03";

function pacific(isoDate: string, time = "10:00"): Date {
  return new Date(`${isoDate}T${time}:00-08:00`);
}

function eventRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "e1",
    title: "Kendall Yards Christmas Market",
    status: "PENDING",
    deletedAt: null,
    startDate: pacific("2026-11-28"),
    endDate: pacific("2026-11-28", "16:00"),
    scheduleDays: [],
    venue: { name: "Kendall Yards", city: "Spokane" },
    ...overrides,
  };
}

beforeEach(() => {
  for (const mock of Object.values(mocks)) mock.mockReset();
  mocks.eventFindMany.mockResolvedValue([]);
  mocks.marketFindMany.mockResolvedValue([]);
  mocks.venueFindMany.mockResolvedValue([]);
  mocks.vendorFindMany.mockResolvedValue([]);
  mocks.userFindMany.mockResolvedValue([]);
  mocks.submissionFindMany.mockResolvedValue([]);
});

describe("normalizeQuery and searchTerms", () => {
  it("collapses spaces and caps the length", () => {
    expect(normalizeQuery("  kendall   yards ")).toBe("kendall yards");
    expect(normalizeQuery("x".repeat(150))).toHaveLength(100);
  });

  it("splits into words without quotes or commas, each once, at most six", () => {
    expect(searchTerms(' "Kendall", yards kendall ')).toEqual(["Kendall", "yards"]);
    expect(searchTerms("a b c d e f g h")).toEqual(["a", "b", "c", "d", "e", "f"]);
    expect(searchTerms(" , ")).toEqual([]);
  });
});

describe("everyTermMatches", () => {
  it("needs every word in one of the fields, with both apostrophe forms", () => {
    const where = everyTermMatches<Record<string, unknown>>(["farmers'", "rathdrum"], [(m) => ({ title: m }), (m) => ({ slug: m })]);
    expect(where.AND).toHaveLength(2);
    expect(where.AND[0].OR).toEqual([
      { title: { contains: "farmers'", mode: "insensitive" } },
      { slug: { contains: "farmers'", mode: "insensitive" } },
      { title: { contains: "farmers’", mode: "insensitive" } },
      { slug: { contains: "farmers’", mode: "insensitive" } },
    ]);
    expect(where.AND[1].OR).toEqual([
      { title: { contains: "rathdrum", mode: "insensitive" } },
      { slug: { contains: "rathdrum", mode: "insensitive" } },
    ]);
  });
});

describe("parseDateQuery", () => {
  it.each([
    ["dec 12", "2026-12-12"],
    ["Dec. 12", "2026-12-12"],
    ["december 12th", "2026-12-12"],
    ["Sat Dec 12", "2026-12-12"],
    ["saturday, dec 12", "2026-12-12"],
    ["12 dec", "2026-12-12"],
    ["12th of", null],
    ["12/12", "2026-12-12"],
    ["12/12/27", "2027-12-12"],
    ["12-12-2027", "2027-12-12"],
    ["2027-01-09", "2027-01-09"],
    ["dec 12, 2027", "2027-12-12"],
    ["weekend of dec 19", "2026-12-19"],
    ["the week of nov 28", "2026-11-28"],
    ["sept 30", "2026-09-30"],
    ["jan 9", "2027-01-09"],
    ["oct 30", "2026-10-30"],
    ["aug 1", "2027-08-01"],
    ["feb 29", "2028-02-29"],
    ["today", TODAY],
    ["tomorrow", "2026-11-04"],
    ["this weekend", "2026-11-07"],
    ["next saturday", "2026-11-14"],
  ])("reads %s as %s", (query, expected) => {
    expect(parseDateQuery(query, TODAY)).toBe(expected);
  });

  it.each(["kendall", "market 5", "march madness", "12", "2027", "mar", "sat", "feb 30", "13/40", "sat market 12", "ma 5"])(
    "does not read %s as a date",
    (query) => {
      expect(parseDateQuery(query, TODAY)).toBeNull();
    }
  );
});

describe("rankByName", () => {
  it("puts live rows first, then whole and prefix matches, then word starts", () => {
    const rows = [
      { name: "The Kendall Market", archived: false },
      { name: "Kendall Yards", archived: true },
      { name: "Market at Kendall Yards", archived: false },
      { name: "Kendall Yards", archived: false },
      { name: "Kendallwood Hall", archived: false },
    ];
    const ranked = rankByName(rows, "kendall yards", (r) => [r.name], (r) => r.archived);
    expect(ranked.map((r) => `${r.name}${r.archived ? " (archived)" : ""}`)).toEqual([
      "Kendall Yards",
      "Kendallwood Hall",
      "The Kendall Market",
      "Market at Kendall Yards",
      "Kendall Yards (archived)",
    ]);
  });

  it("keeps the database order among equal rows", () => {
    const rows = [{ name: "B Kendall" }, { name: "A Kendall" }];
    expect(rankByName(rows, "kendall", (r) => [r.name], () => false)).toEqual(rows);
  });
});

describe("joinMeta", () => {
  it("joins with commas and drops blanks and repeats", () => {
    expect(joinMeta(["Sat Nov 7", null, "Spokane", " ", "spokane"])).toBe("Sat Nov 7, Spokane");
    expect(joinMeta([null, undefined])).toBeNull();
  });
});

describe("searchAdmin", () => {
  it("does not search below two characters", async () => {
    expect(await searchAdmin(" k ", NOW)).toEqual({ query: "k", weekend: null, groups: [] });
    expect(mocks.eventFindMany).not.toHaveBeenCalled();
  });

  it("searches every group with each word required, upcoming events before the rest", async () => {
    mocks.eventFindMany
      .mockResolvedValueOnce([eventRow()])
      .mockResolvedValueOnce([
        eventRow({
          id: "e2",
          status: "PUBLISHED",
          startDate: pacific("2025-12-06"),
          endDate: pacific("2025-12-07", "16:00"),
        }),
        eventRow({ id: "e3", deletedAt: new Date("2026-10-01T00:00:00Z") }),
      ]);

    const results = await searchAdmin("kendall yards", NOW);

    const [titleSoon, titleBefore, anySoon, anyBefore] = mocks.eventFindMany.mock.calls.map((c) => c[0]);
    expect(titleSoon.where.AND[0].AND.map((t: { OR: unknown[] }) => t.OR)).toEqual([
      [{ title: { contains: "kendall", mode: "insensitive" } }],
      [{ title: { contains: "yards", mode: "insensitive" } }],
    ]);
    expect(titleBefore.where.AND[0]).toEqual(titleSoon.where.AND[0]);
    const terms = anySoon.where.AND[0].AND;
    expect(terms).toHaveLength(2);
    expect(terms[0].OR).toContainEqual({ venue: { city: { contains: "kendall", mode: "insensitive" } } });
    expect(terms[1].OR).toContainEqual({ market: { name: { contains: "yards", mode: "insensitive" } } });
    expect(anyBefore.where.AND[0]).toEqual(anySoon.where.AND[0]);
    const upcoming = { deletedAt: null, endDate: { gte: new Date("2026-11-03T08:00:00.000Z") } };
    for (const call of [titleSoon, anySoon]) {
      expect(call.where.AND[1]).toEqual(upcoming);
      expect(call.orderBy[0]).toEqual({ startDate: "asc" });
    }
    for (const call of [titleBefore, anyBefore]) {
      expect(call.where.AND[1]).toEqual({ NOT: upcoming });
      expect(call.orderBy[0]).toEqual({ deletedAt: { sort: "asc", nulls: "first" } });
    }

    expect(results.weekend).toBeNull();
    expect(results.groups.map((g) => g.key)).toEqual(["events"]);
    expect(results.groups[0]).toEqual({
      key: "events",
      heading: "Events",
      moreHref: null,
      hits: [
        {
          id: "e1",
          href: "/admin/events/e1",
          title: "Kendall Yards Christmas Market",
          meta: "Sat Nov 28, Kendall Yards, Spokane",
          status: "PENDING",
          note: null,
        },
        {
          id: "e2",
          href: "/admin/events/e2",
          title: "Kendall Yards Christmas Market",
          meta: "Sat Dec 6, 2025 to Sun Dec 7, 2025, Kendall Yards, Spokane",
          status: "PUBLISHED",
          note: null,
        },
        expect.objectContaining({ id: "e3", status: "ARCHIVED" }),
      ],
    });
  });

  it("lists title matches before events that match only on place or town, each once", async () => {
    mocks.eventFindMany
      .mockResolvedValueOnce([eventRow({ id: "t1" })])
      .mockResolvedValueOnce([eventRow({ id: "t2", startDate: pacific("2025-11-29"), endDate: pacific("2025-11-29", "16:00") })])
      .mockResolvedValueOnce([eventRow({ id: "a1", title: "Holiday Bazaar" }), eventRow({ id: "t1" })])
      .mockResolvedValueOnce([]);
    const results = await searchAdmin("kendall", NOW);
    expect(results.groups[0].hits.map((h) => h.id)).toEqual(["t1", "t2", "a1"]);
    expect(results.groups[0].moreHref).toBeNull();
  });

  it("uses schedule days for an event's dates", async () => {
    mocks.eventFindMany.mockResolvedValueOnce([
      eventRow({
        startDate: pacific("2026-11-27"),
        endDate: pacific("2026-11-29", "16:00"),
        scheduleDays: [{ date: new Date("2026-11-29T00:00:00Z") }, { date: new Date("2026-11-27T00:00:00Z") }],
      }),
    ]);
    const results = await searchAdmin("kendall", NOW);
    expect(results.groups[0].hits[0].meta).toBe("Fri Nov 27 to Sun Nov 29, Kendall Yards, Spokane");
  });

  it("offers the full list when more than five match", async () => {
    mocks.eventFindMany
      .mockResolvedValueOnce([1, 2, 3, 4].map((n) => eventRow({ id: `u${n}` })))
      .mockResolvedValueOnce([1, 2].map((n) => eventRow({ id: `p${n}` })));
    mocks.venueFindMany.mockResolvedValueOnce(
      Array.from({ length: 6 }, (_, n) => ({
        id: `v${n}`,
        name: `Hall ${n}`,
        address: "1 Main St",
        city: "Spokane",
        deletedAt: null,
        _count: { events: n },
      }))
    );

    const results = await searchAdmin("hall & co", NOW);
    const events = results.groups.find((g) => g.key === "events")!;
    const places = results.groups.find((g) => g.key === "places")!;
    expect(events.hits.map((h) => h.id)).toEqual(["u1", "u2", "u3", "u4", "p1"]);
    expect(events.moreHref).toBe("/admin/events?q=hall%20%26%20co");
    expect(places.hits).toHaveLength(5);
    expect(places.moreHref).toBe("/admin/venues?q=hall%20%26%20co");
    expect(places.hits[0]).toEqual({
      id: "v0",
      href: "/admin/venues/v0",
      title: "Hall 0",
      meta: "1 Main St, Spokane, No events",
      status: null,
      note: null,
    });
    expect(places.hits[1].meta).toBe("1 Main St, Spokane, 1 event");
  });

  it("describes markets, vendors and people in plain words", async () => {
    mocks.marketFindMany.mockResolvedValueOnce([
      {
        id: "m1",
        name: "Spokane Farmers' Market",
        deletedAt: null,
        verificationStatus: "PENDING",
        venue: { name: "Fifth and Browne", city: "Spokane" },
        _count: { events: 4 },
      },
      {
        id: "m2",
        name: "Old Spokane Market",
        deletedAt: new Date(),
        verificationStatus: "VERIFIED",
        venue: { name: "Fifth and Browne", city: "Spokane" },
        _count: { events: 1 },
      },
    ]);
    mocks.vendorFindMany.mockResolvedValueOnce([
      {
        id: "d1",
        businessName: "Spokane Honey Co",
        deletedAt: null,
        verificationStatus: "UNVERIFIED",
        primaryCategory: "Food",
        serviceAreaLabel: "Spokane Valley",
        userId: null,
      },
    ]);
    mocks.userFindMany.mockResolvedValueOnce([
      { id: "u1", name: null, email: "spokane@example.com", role: "USER", accountStatus: "ACTIVE" },
      { id: "u2", name: "Dana Spokane", email: "dana@example.com", role: "ORGANIZER", accountStatus: "SUSPENDED" },
    ]);

    const results = await searchAdmin("spokane", NOW);
    const byKey = Object.fromEntries(results.groups.map((g) => [g.key, g]));

    expect(results.groups.map((g) => g.key)).toEqual(["markets", "vendors", "people"]);
    expect(byKey.markets.hits).toEqual([
      {
        id: "m1",
        href: "/admin/markets/m1",
        title: "Spokane Farmers' Market",
        meta: "Fifth and Browne, Spokane, 4 dates",
        status: "VERIFICATION_PENDING",
        note: null,
      },
      expect.objectContaining({ id: "m2", meta: "Fifth and Browne, Spokane, 1 date", status: "ARCHIVED" }),
    ]);
    expect(byKey.vendors.hits[0]).toEqual({
      id: "d1",
      href: "/admin/vendors/d1",
      title: "Spokane Honey Co",
      meta: "Food, Spokane Valley, Not claimed",
      status: null,
      note: null,
    });
    expect(byKey.people.hits).toEqual([
      { id: "u1", href: "/admin/users/u1", title: "spokane@example.com", meta: null, status: null, note: "Member" },
      {
        id: "u2",
        href: "/admin/users/u2",
        title: "Dana Spokane",
        meta: "dana@example.com",
        status: null,
        note: "Organizer, suspended",
      },
    ]);

    const [prefixCall, anyCall] = mocks.userFindMany.mock.calls.map((c) => c[0]);
    expect(anyCall.where.AND[0].OR).toEqual([
      { name: { contains: "spokane", mode: "insensitive" } },
      { email: { contains: "spokane", mode: "insensitive" } },
    ]);
    expect(anyCall.take).toBe(6);
    expect(prefixCall.where.AND[1]).toEqual({
      OR: [
        { name: { startsWith: "spokane", mode: "insensitive" } },
        { email: { startsWith: "spokane", mode: "insensitive" } },
      ],
    });
    expect(prefixCall.take).toBe(50);
  });

  it("puts name matches ahead of rows that only match a town, each once", async () => {
    const place = (id: string, name: string) => ({
      id,
      name,
      address: "1 Main St",
      city: "Spokane",
      deletedAt: null,
      _count: { events: 1 },
    });
    mocks.venueFindMany
      .mockResolvedValueOnce([place("v9", "Spokane Convention Center"), place("v2", "Downtown Spokane")])
      .mockResolvedValueOnce([
        place("v1", "9th and Perry"),
        place("v2", "Downtown Spokane"),
        place("v3", "Arbor Crest"),
        place("v4", "Bing Crosby House"),
        place("v5", "Corbin Park"),
        place("v6", "Dutch Jake's Park"),
      ]);

    const results = await searchAdmin("spokane", NOW);
    const places = results.groups.find((g) => g.key === "places")!;

    const [namedCall, anyCall] = mocks.venueFindMany.mock.calls.map((c) => c[0]);
    expect(namedCall.where.AND[0].OR).toEqual([{ name: { contains: "spokane", mode: "insensitive" } }]);
    expect(anyCall.where.AND[0].OR).toContainEqual({ city: { contains: "spokane", mode: "insensitive" } });
    expect(places.hits.map((h) => h.id)).toEqual(["v9", "v2", "v1", "v3", "v4"]);
    expect(places.moreHref).toBe("/admin/venues?q=spokane");
  });

  it("answers a date with its weekend, counted the way the rail counts", async () => {
    mocks.eventFindMany.mockResolvedValueOnce([
      {
        id: "a",
        title: "German Christmas Market",
        status: "PUBLISHED",
        startDate: pacific("2026-12-11"),
        endDate: pacific("2026-12-13", "18:00"),
        scheduleDays: [],
      },
      {
        id: "b",
        title: "A Very Merry Market",
        status: "DRAFT",
        startDate: pacific("2026-12-12"),
        endDate: pacific("2026-12-12", "15:00"),
        scheduleDays: [],
      },
      {
        id: "c",
        title: "Market the week after",
        status: "PENDING",
        startDate: pacific("2026-12-14"),
        endDate: pacific("2026-12-14", "15:00"),
        scheduleDays: [],
      },
    ]);
    mocks.submissionFindMany.mockResolvedValueOnce([
      { id: "s1", eventTitle: "Craft fair", eventDate: "2026-12-13", eventTime: "10:00", allDay: false, scheduleDays: null },
      { id: "s2", eventTitle: "Later fair", eventDate: "2027-03-01", eventTime: "10:00", allDay: false, scheduleDays: null },
    ]);

    const results = await searchAdmin("thu dec 10", NOW);

    expect(mocks.marketFindMany).not.toHaveBeenCalled();
    const where = mocks.eventFindMany.mock.calls[0][0].where;
    expect(where.startDate).toEqual({ lt: new Date("2026-12-14T08:00:00.000Z") });
    expect(where.endDate).toEqual({ gte: new Date("2026-12-07T08:00:00.000Z") });
    expect(results.groups).toEqual([]);
    expect(results.weekend).toMatchObject({
      saturday: "2026-12-12",
      title: "Weekend of Sat Dec 12",
      meta: "Includes Thu Dec 10, 1 pending, 1 draft",
      onRail: true,
      week: { key: "2026-12-12", live: 1, pending: 1, draft: 1, stalls: [] },
    });
  });

  it("names local days and weeks beyond the rail", async () => {
    const dec19 = await searchAdmin("dec 19", NOW);
    expect(dec19.weekend).toMatchObject({ meta: "Saturday before Christmas", onRail: true });

    const jan9 = await searchAdmin("jan 9", NOW);
    expect(jan9.weekend).toMatchObject({ title: "Weekend of Sat Jan 9, 2027", meta: null, onRail: false });

    const thisWeekend = await searchAdmin("this weekend", NOW);
    expect(thisWeekend.weekend).toMatchObject({ saturday: "2026-11-07", meta: "This weekend", onRail: true });
  });

  it("counts this week from today on", async () => {
    mocks.eventFindMany.mockResolvedValueOnce([
      {
        id: "monday",
        title: "Yesterday's market",
        status: "PUBLISHED",
        startDate: pacific("2026-11-02"),
        endDate: pacific("2026-11-02", "15:00"),
        scheduleDays: [],
      },
      {
        id: "saturday",
        title: "Saturday market",
        status: "PENDING",
        startDate: pacific("2026-11-07"),
        endDate: pacific("2026-11-07", "15:00"),
        scheduleDays: [],
      },
    ]);
    const results = await searchAdmin("nov 7", NOW);
    expect(mocks.eventFindMany.mock.calls[0][0].where.endDate).toEqual({ gte: new Date("2026-11-03T08:00:00.000Z") });
    expect(results.weekend?.week).toMatchObject({ live: 0, pending: 1, draft: 0 });
  });
});
