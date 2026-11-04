import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  class EventMutationError extends Error {}
  return {
    EventMutationError,
    requireAdminAction: vi.fn(),
    revalidateAdmin: vi.fn(),
    updateEventFields: vi.fn(),
    setEventStatuses: vi.fn(),
    archiveEvents: vi.fn(),
    undoDecision: vi.fn(),
    eventSlugProblem: vi.fn(),
    makeMarketFromEvents: vi.fn(),
    mergeVenues: vi.fn(),
    loadPlaceGroups: vi.fn(),
    eventFindMany: vi.fn(),
    eventFindFirst: vi.fn(),
    marketFindMany: vi.fn(),
    venueFindMany: vi.fn(),
    tagCount: vi.fn(),
    featureCount: vi.fn(),
  };
});

vi.mock("@/lib/admin/auth-action", () => ({ requireAdminAction: mocks.requireAdminAction }));
vi.mock("@/lib/admin/revalidate", () => ({ revalidateAdmin: mocks.revalidateAdmin }));
vi.mock("@/lib/admin/undo", () => ({ newDecisionId: () => "d_test", undoDecision: mocks.undoDecision }));
vi.mock("@/lib/events/mutations", () => ({
  EventMutationError: mocks.EventMutationError,
  updateEventFields: mocks.updateEventFields,
  setEventStatuses: mocks.setEventStatuses,
  archiveEvents: mocks.archiveEvents,
}));
vi.mock("@/lib/events/slug", () => ({ eventSlugProblem: mocks.eventSlugProblem }));
vi.mock("@/lib/markets/make-from-events", async (original) => ({
  ...(await original<typeof import("@/lib/markets/make-from-events")>()),
  makeMarketFromEvents: mocks.makeMarketFromEvents,
}));
vi.mock("@/lib/markets/queries", () => ({ loadPlaceGroups: mocks.loadPlaceGroups }));
vi.mock("@/lib/venues/merge", () => ({ mergeVenues: mocks.mergeVenues }));
vi.mock("@/lib/db", () => ({
  db: {
    event: { findMany: mocks.eventFindMany, findFirst: mocks.eventFindFirst },
    market: { findMany: mocks.marketFindMany },
    venue: { findMany: mocks.venueFindMany },
    tag: { count: mocks.tagCount },
    feature: { count: mocks.featureCount },
  },
}));

import {
  applyToSeriesDates,
  fixSeriesAddresses,
  keepCombined,
  linkSeriesToMarket,
  makeSeriesMarket,
  mergeSeriesPlace,
  publishSeries,
  seriesDecisionDetails,
} from "./twins-series";

const KEY = "series:market:kynm";
const REF = { decisionId: "d_test", decisionKey: KEY };
const STATUS = (changed: string[], extra: Partial<{ refused: { id: string; reason: string }[]; notified: string[] }> = {}) => ({
  changed,
  alreadyThere: [],
  missing: [],
  refused: [],
  notified: [],
  ...extra,
});

const kendall = (id: string, date: string, overrides: Record<string, unknown> = {}) => ({
  id,
  title: "Kendall Yards Christmas Market",
  slug: `kendall-yards-night-market-${date}`,
  status: "PENDING",
  startDate: new Date(`${date}T20:00:00Z`),
  imageUrl: null,
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireAdminAction.mockResolvedValue({ user: { id: "admin" } });
  mocks.eventSlugProblem.mockResolvedValue(null);
  mocks.updateEventFields.mockResolvedValue({});
  mocks.setEventStatuses.mockImplementation(async (ids: string[]) => STATUS(ids));
  mocks.undoDecision.mockResolvedValue({ ok: true, message: "Undone." });
});

describe("publishSeries", () => {
  it("fixes the web addresses and sets one picture on every date, then publishes them, as one decision", async () => {
    mocks.eventFindMany.mockResolvedValue([kendall("e1", "2026-11-27"), kendall("e2", "2026-11-28", { imageUrl: "/uploads/a.webp" })]);
    const result = await publishSeries({ decisionKey: KEY, eventIds: ["e1", "e2"], fixAddresses: true, imageUrl: "/uploads/a.webp" });
    expect(mocks.updateEventFields.mock.calls).toEqual([
      ["e1", { slug: "kendall-yards-christmas-market-2026-11-27", imageUrl: "/uploads/a.webp" }, "admin", REF],
      ["e2", { slug: "kendall-yards-christmas-market-2026-11-28" }, "admin", REF],
    ]);
    expect(mocks.setEventStatuses).toHaveBeenCalledWith(["e1", "e2"], "PUBLISHED", "admin", REF);
    expect(result).toEqual({ ok: true, decisionId: "d_test", changed: ["e1", "e2"], alreadyThere: [], refused: [], notified: [] });
    expect(mocks.revalidateAdmin).toHaveBeenCalled();
  });

  it("publishes without touching the addresses when the owner unticked the fix", async () => {
    mocks.eventFindMany.mockResolvedValue([kendall("e1", "2026-11-27")]);
    await publishSeries({ decisionKey: KEY, eventIds: ["e1"], fixAddresses: false });
    expect(mocks.updateEventFields).not.toHaveBeenCalled();
    expect(mocks.setEventStatuses).toHaveBeenCalledOnce();
  });

  it("takes the next free address when another event holds the proposed one", async () => {
    mocks.eventFindMany.mockResolvedValue([kendall("e1", "2026-11-27")]);
    mocks.eventSlugProblem.mockResolvedValueOnce('"Old listing" already uses /events/kendall-yards-christmas-market-2026-11-27.').mockResolvedValue(null);
    await applyToSeriesDates({ decisionKey: KEY, eventIds: ["e1"], fixAddresses: true });
    expect(mocks.updateEventFields).toHaveBeenCalledWith("e1", { slug: "kendall-yards-christmas-market-2026-11-27-2" }, "admin", REF);
  });

  it("undoes the fixes when publishing fails", async () => {
    mocks.eventFindMany.mockResolvedValue([kendall("e1", "2026-11-27")]);
    mocks.setEventStatuses.mockRejectedValue(new mocks.EventMutationError("Someone else changed it."));
    const result = await publishSeries({ decisionKey: KEY, eventIds: ["e1"], fixAddresses: true });
    expect(mocks.undoDecision).toHaveBeenCalledWith("d_test", "admin");
    expect(result).toEqual({ ok: false, error: "Someone else changed it." });
  });

  it("refuses a picture link that is not a link", async () => {
    const result = await publishSeries({ decisionKey: KEY, eventIds: ["e1"], fixAddresses: false, imageUrl: "picture.jpg" });
    expect(result).toEqual({ ok: false, error: "A picture link starts with https://." });
    expect(mocks.eventFindMany).not.toHaveBeenCalled();
  });

  it("refuses without an admin", async () => {
    mocks.requireAdminAction.mockRejectedValue(new Error("Unauthorized"));
    expect(await publishSeries({ decisionKey: KEY, eventIds: ["e1"], fixAddresses: false })).toEqual({ ok: false, error: "Sign in as an admin to do this." });
  });
});

describe("applyToSeriesDates and fixSeriesAddresses", () => {
  it("writes the fixes without publishing, and reports no decision when nothing changed", async () => {
    mocks.eventFindMany.mockResolvedValue([kendall("e1", "2026-11-27", { slug: "kendall-yards-christmas-market-2026-11-27" })]);
    expect(await fixSeriesAddresses({ decisionKey: KEY, eventIds: ["e1"] })).toEqual({
      ok: true,
      decisionId: null,
      changed: [],
      alreadyThere: [],
      refused: [],
      notified: [],
    });
    expect(mocks.setEventStatuses).not.toHaveBeenCalled();
  });
});

describe("markets for a series", () => {
  it("links every date that is not linked yet", async () => {
    mocks.eventFindMany.mockResolvedValue([
      { id: "c1", marketId: null },
      { id: "c2", marketId: "kcfm" },
    ]);
    const result = await linkSeriesToMarket({ decisionKey: "series:cabin", eventIds: ["c1", "c2"], marketId: "kcfm" });
    expect(mocks.updateEventFields).toHaveBeenCalledExactlyOnceWith("c1", { marketId: "kcfm" }, "admin", { decisionId: "d_test", decisionKey: "series:cabin" });
    expect(result).toMatchObject({ ok: true, decisionId: "d_test", changed: ["c1"] });
  });

  it("makes a market from the dates through makeMarketFromEvents", async () => {
    mocks.makeMarketFromEvents.mockResolvedValue({ marketId: "m-new", slug: "a-very-merry-market", linked: ["a", "b"] });
    const result = await makeSeriesMarket({ decisionKey: "series:merry", eventIds: ["a", "b"] });
    expect(mocks.makeMarketFromEvents).toHaveBeenCalledWith(["a", "b"], {}, "admin", { decisionId: "d_test", decisionKey: "series:merry" });
    expect(result).toMatchObject({ ok: true, decisionId: "d_test", changed: ["a", "b"], marketId: "m-new" });
  });

  it("merges the place into the market's home", async () => {
    mocks.mergeVenues.mockResolvedValue({ ok: true, keepId: "home", eventsMoved: 6, marketsMoved: 0, eventSlugs: [], marketSlugs: [] });
    expect(await mergeSeriesPlace({ decisionKey: KEY, keepId: "home", mergeIds: ["kys"] })).toMatchObject({ ok: true, decisionId: "d_test" });
    expect(mocks.mergeVenues).toHaveBeenCalledWith("home", ["kys"], "admin", REF);
    mocks.mergeVenues.mockResolvedValue({ ok: false, error: "The place to keep no longer exists or is archived." });
    expect(await mergeSeriesPlace({ decisionKey: KEY, keepId: "home", mergeIds: ["kys"] })).toEqual({ ok: false, error: "The place to keep no longer exists or is archived." });
  });
});

describe("seriesDecisionDetails", () => {
  const select = (rows: unknown[]) => rows;

  it("finds the market, the place listed twice, and the addresses to fix", async () => {
    mocks.eventFindMany
      .mockResolvedValueOnce(
        select([
          {
            ...kendall("e1", "2026-11-27"),
            endDate: new Date("2026-11-28T00:00:00Z"),
            venueId: "kys",
            marketId: "kynm",
            venue: { name: "Kendall Yards (Summit Parkway)" },
            scheduleDays: [],
          },
        ])
      )
      .mockResolvedValueOnce([]);
    mocks.loadPlaceGroups.mockResolvedValue(
      new Map([
        ["kys", "group"],
        ["home", "group"],
      ])
    );
    mocks.marketFindMany.mockResolvedValue([
      { id: "kynm", name: "Kendall Yards Night Market", venueId: "home", verificationStatus: "VERIFIED", venue: { name: "Kendall Yards" } },
    ]);
    mocks.venueFindMany.mockResolvedValue([
      { id: "kys", name: "Kendall Yards (Summit Parkway)", _count: { events: 6 } },
      { id: "home", name: "Kendall Yards", _count: { events: 1 } },
    ]);
    const details = await seriesDecisionDetails({ eventIds: ["e1"] });
    expect(details).toEqual({
      market: { id: "kynm", name: "Kendall Yards Night Market", verified: true, homeName: "Kendall Yards" },
      suggestedMarket: null,
      draft: null,
      place: {
        id: "kys",
        name: "Kendall Yards (Summit Parkway)",
        keep: { id: "home", name: "Kendall Yards", marketHome: true },
        mergeIds: ["kys"],
        others: ["Kendall Yards"],
      },
      addresses: [
        {
          eventId: "e1",
          title: "Kendall Yards Christmas Market",
          from: "kendall-yards-night-market-2026-11-27",
          to: "kendall-yards-christmas-market-2026-11-27",
          live: false,
          problem: null,
        },
      ],
    });
  });

  it("suggests the market whose dates look like the series, and drafts one when none does", async () => {
    const cabin = (id: string, date: string) => ({
      id,
      title: "Cabin Fever Indoor Market",
      slug: `cabin-fever-indoor-market-${date}`,
      status: "DRAFT",
      startDate: new Date(`${date}T18:00:00Z`),
      endDate: new Date(`${date}T23:00:00Z`),
      imageUrl: null,
      venueId: "fair",
      marketId: null,
      venue: { name: "Kootenai County Fairgrounds" },
      scheduleDays: [{ date: new Date(`${date}T00:00:00Z`), startTime: "10:00", endTime: "15:00", allDay: false }],
    });
    mocks.loadPlaceGroups.mockResolvedValue(new Map());
    mocks.marketFindMany.mockResolvedValue([{ id: "kcfm", name: "Kootenai County Farmers' Market", venueId: "other", verificationStatus: "UNVERIFIED", venue: { name: "Other" } }]);
    mocks.eventFindMany
      .mockResolvedValueOnce([cabin("c1", "2027-01-30"), cabin("c2", "2027-02-27")])
      .mockResolvedValueOnce([{ title: "Cabin Fever Market (Kootenai County Farmers' Market)", venueId: "fair", marketId: "kcfm" }]);
    const details = await seriesDecisionDetails({ eventIds: ["c1", "c2"] });
    expect(details?.suggestedMarket).toEqual({ id: "kcfm", name: "Kootenai County Farmers' Market" });
    expect(details?.draft).toEqual({ name: "Cabin Fever Indoor Market", venueName: "Kootenai County Fairgrounds", typicalSchedule: "Saturdays, 10:00 am to 3:00 pm" });
    expect(details?.addresses).toEqual([]);
    expect(details?.place).toBeNull();
  });
});

describe("keepCombined", () => {
  beforeEach(() => {
    mocks.eventFindFirst.mockResolvedValue({ status: "PENDING" });
    mocks.archiveEvents.mockResolvedValue({ archived: ["two"], missing: [] });
    mocks.tagCount.mockResolvedValue(3);
    mocks.featureCount.mockResolvedValue(0);
  });

  it("writes the chosen fields, publishes, then archives the other copy as its duplicate", async () => {
    const changes = { scheduleDays: [{ date: "2026-11-06", allDay: false, startTime: "17:30", endTime: "21:00" }], tagIds: ["a", "b", "c"] };
    const result = await keepCombined({ decisionKey: "twins:one|two", keepId: "one", archiveIds: ["two"], changes, publish: true });
    const ref = { decisionId: "d_test", decisionKey: "twins:one|two" };
    expect(mocks.updateEventFields).toHaveBeenCalledWith("one", changes, "admin", ref);
    expect(mocks.setEventStatuses).toHaveBeenCalledWith(["one"], "PUBLISHED", "admin", ref);
    expect(mocks.archiveEvents).toHaveBeenCalledWith(["two"], "admin", { ...ref, duplicateOfId: "one" });
    expect(result).toEqual({ ok: true, decisionId: "d_test", changed: ["one"], alreadyThere: [], refused: [], notified: [], archived: ["two"] });
  });

  it("keeps the combined copy as a draft without publishing", async () => {
    await keepCombined({ decisionKey: "twins:one|two", keepId: "one", archiveIds: ["two"], changes: { title: "Rebel Junk Holiday Market" }, publish: false });
    expect(mocks.updateEventFields).toHaveBeenCalledWith("one", { title: "Rebel Junk Holiday Market", status: "DRAFT" }, "admin", expect.anything());
    expect(mocks.setEventStatuses).not.toHaveBeenCalled();
  });

  it("undoes the written fields when publishing is refused, and archives nothing", async () => {
    mocks.setEventStatuses.mockResolvedValue(STATUS([], { refused: [{ id: "one", reason: "Its place has no ZIP." }] }));
    const result = await keepCombined({ decisionKey: "twins:one|two", keepId: "one", archiveIds: ["two"], changes: { title: "X" }, publish: true });
    expect(result).toEqual({ ok: false, error: "Nothing was changed. Its place has no ZIP." });
    expect(mocks.undoDecision).toHaveBeenCalledWith("d_test", "admin");
    expect(mocks.archiveEvents).not.toHaveBeenCalled();
  });

  it("refuses to archive the copy it keeps, and tags that no longer exist", async () => {
    expect(await keepCombined({ decisionKey: "k", keepId: "one", archiveIds: ["one"], changes: {}, publish: false })).toEqual({
      ok: false,
      error: "The event to keep cannot also be archived.",
    });
    mocks.tagCount.mockResolvedValue(1);
    expect(await keepCombined({ decisionKey: "k", keepId: "one", archiveIds: ["two"], changes: { tagIds: ["a", "b"] }, publish: false })).toEqual({
      ok: false,
      error: "A chosen tag or feature no longer exists. Reload and choose again.",
    });
  });
});
