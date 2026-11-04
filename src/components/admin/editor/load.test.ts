import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  eventFindUnique: vi.fn(),
  eventFindMany: vi.fn(),
  venueFindMany: vi.fn(),
  venueFindFirst: vi.fn(),
  marketFindMany: vi.fn(),
  marketFindFirst: vi.fn(),
  tagFindMany: vi.fn(),
  featureFindMany: vi.fn(),
  notificationTarget: vi.fn(),
  getHistory: vi.fn(),
  getSeriesFor: vi.fn(),
  getPairKeys: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    event: { findUnique: mocks.eventFindUnique, findMany: mocks.eventFindMany },
    venue: { findMany: mocks.venueFindMany, findFirst: mocks.venueFindFirst },
    market: { findMany: mocks.marketFindMany, findFirst: mocks.marketFindFirst },
    tag: { findMany: mocks.tagFindMany },
    feature: { findMany: mocks.featureFindMany },
  },
}));
vi.mock("@/lib/events/mutations", () => ({ notificationTarget: mocks.notificationTarget }));
vi.mock("@/lib/admin/history", () => ({ getHistory: mocks.getHistory }));
vi.mock("@/lib/admin/memo", () => ({ getPairKeys: mocks.getPairKeys, getPlaceMemos: async () => ({}) }));
vi.mock("@/lib/events/series", () => ({ getSeriesFor: mocks.getSeriesFor }));
vi.mock("@/lib/submissions/venue-outcome", () => ({ venueOutcome: vi.fn() }));

import type { HistoryEntry } from "@/lib/admin/history";
import { editorNav, historyRows, loadEditorOptions, loadEventEditor, originalFields } from "./load";

const EVENT_ROW = {
  id: "e1",
  title: "Emerge Holiday Market",
  slug: "emerge-holiday-market-2026-11-14",
  description: null,
  status: "PUBLISHED",
  venueId: "v1",
  marketId: "m-old",
  imageUrl: null,
  showImageInList: true,
  imageFocalX: 50,
  imageFocalY: 50,
  websiteUrl: null,
  facebookUrl: null,
  instagramUrl: null,
  participationMode: null,
  vendorCapacity: null,
  publicIntentListEnabled: null,
  publicIntentNamesEnabled: null,
  publicRosterEnabled: null,
  complianceNotes: null,
  startDate: new Date("2026-11-14T18:00:00Z"),
  endDate: new Date("2026-11-15T00:00:00Z"),
  scheduleDays: [],
  tags: [],
  features: [],
  submittedBy: { id: "u1", name: "Dana Reyes", email: "dana@example.com", role: "ORGANIZER" },
  submissionFrom: null,
  createdAt: new Date("2026-10-01T17:00:00Z"),
  updatedAt: new Date("2026-11-02T17:00:00Z"),
  deletedAt: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.eventFindUnique.mockResolvedValue(EVENT_ROW);
  mocks.eventFindMany.mockResolvedValue([]);
  mocks.venueFindMany.mockResolvedValue([]);
  mocks.venueFindFirst.mockResolvedValue(null);
  mocks.marketFindMany.mockResolvedValue([{ id: "m1", name: "Kendall Yards Night Market", venueId: null }]);
  mocks.marketFindFirst.mockResolvedValue(null);
  mocks.tagFindMany.mockResolvedValue([]);
  mocks.featureFindMany.mockResolvedValue([]);
  mocks.notificationTarget.mockResolvedValue(["Dana Reyes"]);
  mocks.getHistory.mockResolvedValue([]);
  mocks.getSeriesFor.mockResolvedValue(null);
  mocks.getPairKeys.mockResolvedValue(new Set());
});

function entry(overrides: Partial<HistoryEntry>): HistoryEntry {
  return {
    id: "a1",
    at: new Date("2026-11-03T17:41:00Z"),
    time: "9:41 am",
    timestamp: "Nov 3, 2026 at 9:41 am",
    actor: "You",
    sentence: "You changed Emerge Holiday Market: title.",
    link: null,
    href: null,
    targetType: "EVENT",
    targetId: "e1",
    title: "Emerge Holiday Market",
    previousValue: null,
    newValue: null,
    details: [],
    decisionId: null,
    canUndo: false,
    ...overrides,
  };
}

describe("originalFields", () => {
  it("rebuilds what was sent from the oldest previous value of each edited field", () => {
    const current = { eventTitle: "Big Give 2027", venueCity: "Spokane", venueZip: "99224" };
    const edits = [
      { previousValue: { eventTitle: "BIG GIVE", venueCity: "SPOKANE" } },
      { previousValue: { eventTitle: "Big Give", unknown: "x" } },
    ];
    expect(originalFields(current, edits)).toEqual({ eventTitle: "BIG GIVE", venueCity: "SPOKANE", venueZip: "99224" });
  });
});

describe("historyRows", () => {
  it("keeps one row per decision, newest first, with the decision id for undo", () => {
    const rows = historyRows(
      [
        entry({ id: "a3", decisionId: "d2", canUndo: true, sentence: "You published Emerge Holiday Market." }),
        entry({ id: "a2", decisionId: "d2", canUndo: true }),
        entry({ id: "a1", at: new Date("2026-11-02T17:00:00Z"), time: "9:00 am" }),
        entry({ id: "a0", at: new Date("2026-10-30T17:00:00Z") }),
      ],
      "2026-11-03"
    );
    expect(rows.map((r) => [r.id, r.day, r.canUndo])).toEqual([
      ["d2", "Today", true],
      ["a1", "Yesterday", false],
      ["a0", "Fri Oct 30", false],
    ]);
  });
});

describe("editorNav", () => {
  it("names the way back and carries it to the next record", () => {
    expect(editorNav({ from: "todo", d: "single:e1" }, "event")).toEqual({
      backHref: "/admin?d=single%3Ae1",
      backLabel: "Back to To do",
      carry: "?from=todo&d=single%3Ae1",
      from: "todo",
      decision: "single:e1",
    });
    expect(editorNav({ from: "events", q: "bridal", copy: "e1" }, "event").backHref).toBe("/admin/events?q=bridal");
  });

  it("keeps the Events list's own filters as the way back for the next record and a new event", () => {
    const nav = editorNav({ from: "events", show: "live", week: "2026-11-21", apply: "all" }, "event");
    expect(nav.backHref).toBe("/admin/events?show=live&week=2026-11-21");
    expect(nav.carry).toBe(`?from=events&back=${encodeURIComponent("/admin/events?show=live&week=2026-11-21")}`);
    expect(editorNav({ from: "events" }, "event").carry).toBe("?from=events");
  });
});

describe("loadEventEditor", () => {
  it("names who a rejection tells on a live event with a submitter", async () => {
    const props = await loadEventEditor("e1", {}, "admin-1");
    expect(mocks.notificationTarget).toHaveBeenCalledWith(["e1"]);
    expect(props?.context.notifies).toEqual(["Dana"]);
  });

  it("opens with all dates of the series chosen only for ?apply=all on a series date", async () => {
    expect((await loadEventEditor("e1", { apply: "all" }, null))?.context.applyToAll).toBe(false);
    mocks.getSeriesFor.mockResolvedValue({ key: "s", name: "Emerge Holiday Market", eventIds: ["e1", "e2"], marketId: null, suggestMarket: false });
    expect((await loadEventEditor("e1", { apply: "all" }, null))?.context.applyToAll).toBe(true);
    expect((await loadEventEditor("e1", {}, null))?.context.applyToAll).toBe(false);
  });
});

describe("loadEditorOptions", () => {
  it("adds the record's archived market, marked as archived", async () => {
    mocks.marketFindFirst.mockResolvedValue({ id: "m-old", name: "Old Market", venueId: null });
    const options = await loadEditorOptions("v1", "m-old");
    expect(mocks.marketFindFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "m-old", deletedAt: { not: null } } }));
    expect(options.markets).toEqual([
      { id: "m1", name: "Kendall Yards Night Market", venueId: null },
      { id: "m-old", name: "Old Market", venueId: null, archived: true },
    ]);
  });
});
