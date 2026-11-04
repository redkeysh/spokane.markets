import { describe, expect, it } from "vitest";
import { changeDetails, copyChoices, firstFreeDay, historyDay, marketHistorySentence, seasonRows, whenText } from "./page-view";
import { changedKeys, emptyMarketDetails, normalizeMarketLinks } from "./details";
import { seasonsOf, type BoardEvent, type BoardMarket } from "./board";

const NOW = new Date("2026-11-03T18:40:00.000Z");

function ev(id: string, start: string, end: string, extra: Partial<BoardEvent> = {}): BoardEvent {
  return {
    id,
    title: "Kendall Yards Christmas Market",
    slug: id,
    status: "PENDING",
    startDate: new Date(start),
    endDate: new Date(end),
    scheduleDays: [],
    imageUrl: null,
    venueId: "v",
    venueName: "Kendall Yards",
    marketId: "m",
    deletedAt: null,
    ...extra,
  };
}

describe("market page words", () => {
  it("says when each date is", () => {
    expect(whenText(ev("a", "2026-11-27T20:00:00Z", "2026-11-28T00:00:00Z"), NOW)).toBe("Fri Nov 27, 12:00 to 4:00 pm");
    expect(whenText(ev("b", "2026-12-12T18:00:00Z", "2026-12-14T00:00:00Z"), NOW)).toBe("Sat Dec 12 to Sun Dec 13");
    expect(whenText(ev("c", "2026-05-21T00:00:00Z", "2026-09-17T03:30:00Z"), NOW)).toBe("Wednesdays, Wed May 20 to Wed Sep 16");
  });

  it("flags a date whose web address names another event, beside No picture", () => {
    const market: BoardMarket = {
      id: "m",
      name: "Rathdrum Craft and Farmers Market",
      slug: "rathdrum",
      verificationStatus: "UNVERIFIED",
      deletedAt: null,
      typicalSchedule: null,
      venue: { id: "v", name: "Rathdrum Lions Club", address: "", city: "Rathdrum", deletedAt: null },
    };
    const events = [
      ev("fall", "2027-10-16T16:00:00Z", "2027-10-17T00:00:00Z", { title: "Family Fall Festival 2027", slug: "rathdrum-craft-and-farmers-market-2027-10-16" }),
      ev("ok", "2027-10-09T16:00:00Z", "2027-10-10T00:00:00Z", { title: "Holiday Craft Fair", slug: "rathdrum-craft-and-farmers-market-2027-10-09", imageUrl: "https://example.com/p.jpg" }),
    ];
    const rows = seasonRows(seasonsOf(events, NOW), market, events, NOW).flatMap((s) => s.rows);
    expect(rows.find((r) => r.id === "fall")?.flags).toEqual(["No picture", "Web address says otherwise"]);
    expect(rows.find((r) => r.id === "ok")?.flags).toEqual([]);
  });

  it("offers the newest date to copy first, with its hours", () => {
    const choices = copyChoices([ev("a", "2026-11-27T20:00:00Z", "2026-11-28T00:00:00Z"), ev("b", "2026-12-13T20:00:00Z", "2026-12-14T00:00:00Z")], NOW);
    expect(choices[0]).toEqual({
      id: "b",
      label: "Kendall Yards Christmas Market, Sun Dec 13",
      date: "2026-12-13",
      hours: { startTime: "12:00", endTime: "16:00", allDay: false },
    });
  });

  it("starts new dates after the last listed one", () => {
    expect(firstFreeDay([ev("a", "2026-12-13T20:00:00Z", "2026-12-14T00:00:00Z")], "2026-11-03")).toBe("2026-12-14");
    expect(firstFreeDay([ev("a", "2026-09-26T17:00:00Z", "2026-09-27T02:00:00Z", { status: "PUBLISHED" })], "2026-11-03")).toBe("2026-11-03");
    expect(firstFreeDay([ev("a", "2026-12-13T20:00:00Z", "2026-12-14T00:00:00Z", { status: "REJECTED" })], "2026-11-03")).toBe("2026-11-03");
  });

  it("heads history days as the History page does", () => {
    expect(historyDay("2026-11-03", "2026-11-03")).toBe("Today, Tuesday Nov 3");
    expect(historyDay("2026-11-02", "2026-11-03")).toBe("Yesterday, Monday Nov 2");
    expect(historyDay("2025-10-30", "2026-11-03")).toBe("Thursday Oct 30, 2025");
  });

  it("words market changes in the owner's terms", () => {
    const base = { actor: "You", title: "Kendall Yards Night Market" };
    expect(marketHistorySentence({ ...base, action: "UPDATE_MARKET", newValue: { verificationStatus: "VERIFIED" } })).toBe("You verified Kendall Yards Night Market.");
    expect(marketHistorySentence({ ...base, action: "UPDATE_MARKET", newValue: { venueId: "x", typicalSchedule: "y", vendorCapacity: 3, publicRosterEnabled: false } })).toBe(
      "You changed Kendall Yards Night Market: home place, typical schedule, vendor settings."
    );
    expect(marketHistorySentence({ ...base, action: "SOFT_DELETE_MARKET", newValue: null })).toBe("You archived Kendall Yards Night Market.");
    expect(marketHistorySentence({ ...base, action: "CREATE_MARKET", newValue: null })).toBeNull();
    expect(changeDetails({ typicalSchedule: null }, { typicalSchedule: "Saturdays" })).toEqual([{ label: "typical schedule", before: null, after: "Saturdays" }]);
  });
});

describe("market details", () => {
  it("makes bare domains and handles into links", () => {
    const values = normalizeMarketLinks(emptyMarketDetails({ websiteUrl: "kendallyards.com", facebookUrl: "kendallyards", instagramUrl: "@kendallyards" }));
    expect(values.websiteUrl).toBe("https://kendallyards.com");
    expect(values.facebookUrl).toBe("https://facebook.com/kendallyards");
    expect(values.instagramUrl).toBe("https://instagram.com/kendallyards");
    expect(normalizeMarketLinks(emptyMarketDetails()).websiteUrl).toBe("");
  });

  it("names the fields that changed, ignoring the order of badges", () => {
    const before = emptyMarketDetails({ name: "A", listingCommunityBadgeIds: ["b1", "b2"] });
    expect(changedKeys(before, { ...before, listingCommunityBadgeIds: ["b2", "b1"] })).toEqual([]);
    expect(changedKeys(before, { ...before, name: "B", vendorCapacity: 40 })).toEqual(["name", "vendorCapacity"]);
  });
});
