import { describe, expect, it } from "vitest";
import { importReport, skippedDuplicatesSentence } from "./data-import-report";
import { RENDER_STATUS_ORDER, RENDER_STATUS_WORDS, renderSubject, scaleWord } from "./marketing/words";
import { groupPromotions, promotionPhase } from "./promotion-words";
import { ROLE_ORDER, ROLE_WORDS, STATUS_ORDER, STATUS_WORDS, userCounts } from "./user-words";

describe("user words", () => {
  it("counts markets and reviews, leaving out zeros", () => {
    expect(userCounts(0, 0)).toBeNull();
    expect(userCounts(1, 0)).toBe("1 market");
    expect(userCounts(0, 5)).toBe("5 reviews");
    expect(userCounts(2, 1)).toBe("2 markets, 1 review");
  });

  it("has a word for every role and account status, in sentence case", () => {
    for (const role of ROLE_ORDER) expect(ROLE_WORDS[role].one).toMatch(/^[A-Z][a-z]+$/);
    for (const status of STATUS_ORDER) expect(STATUS_WORDS[status]).toMatch(/^[A-Z][a-z]+$/);
  });
});

describe("promotion phases", () => {
  const now = new Date("2026-11-03T17:41:00Z");
  const at = (iso: string) => new Date(iso);

  it("is showing from the first instant to the last", () => {
    expect(promotionPhase(at("2026-11-03T00:00:00Z"), at("2026-11-03T23:59:59.999Z"), now)).toBe("now");
    expect(promotionPhase(at("2026-11-04T00:00:00Z"), at("2026-11-10T23:59:59.999Z"), now)).toBe("upcoming");
    expect(promotionPhase(at("2026-10-01T00:00:00Z"), at("2026-11-02T23:59:59.999Z"), now)).toBe("ended");
  });

  it("groups promotions and puts the latest ended first", () => {
    const p = (id: string, start: string, end: string) => ({ id, startDate: at(start), endDate: at(end) });
    const groups = groupPromotions(
      [
        p("old", "2026-09-01T00:00:00Z", "2026-09-30T23:59:59Z"),
        p("live", "2026-11-01T00:00:00Z", "2026-11-30T23:59:59Z"),
        p("recent", "2026-10-01T00:00:00Z", "2026-10-31T23:59:59Z"),
        p("next", "2026-12-01T00:00:00Z", "2026-12-24T23:59:59Z"),
      ],
      now
    );
    expect(groups.now.map((x) => x.id)).toEqual(["live"]);
    expect(groups.upcoming.map((x) => x.id)).toEqual(["next"]);
    expect(groups.ended.map((x) => x.id)).toEqual(["recent", "old"]);
  });
});

describe("import report", () => {
  it("says what was added, in the owner's words", () => {
    expect(importReport({ venuesCreated: 3, marketsCreated: 1, eventsCreated: 47, errors: [] })).toEqual({
      made: "Added 47 events, 1 market and 3 places.",
      removed: null,
      needsHours: null,
      errors: null,
    });
  });

  it("reports left out places, events without hours and unreadable rows", () => {
    const report = importReport({
      venuesCreated: 0,
      venuesRemoved: 1,
      marketsCreated: 0,
      eventsCreated: 2,
      eventsNeedingSchedule: [
        { row: 4, title: "Bridal Expo", slug: "bridal-expo" },
        { row: 9, title: "Ski Swap", slug: "ski-swap" },
      ],
      errors: ["row 12: invalid date"],
    });
    expect(report).toEqual({
      made: "Added 2 events.",
      removed: "1 new place was left out because nothing imported uses it.",
      needsHours: "2 events need their dates and hours set before they show on the site.",
      errors: "1 row could not be read.",
    });
  });

  it("says when nothing was added", () => {
    expect(importReport({ venuesCreated: 0, marketsCreated: 0, eventsCreated: 0, errors: [] }).made).toBe("Nothing was added.");
  });

  it("counts the rows skipped as duplicates already decided", () => {
    const row = { row: 3, title: "Rebel Junk Holiday Market", keptTitle: "11th Annual Rebel Junk Holiday Market" };
    expect(skippedDuplicatesSentence({ skippedDuplicates: [row, row, row] })).toBe("Skipped 3 you already decided as duplicates.");
    expect(skippedDuplicatesSentence({ skippedDuplicates: [row] })).toBe("Skipped 1 you already decided as a duplicate.");
    expect(skippedDuplicatesSentence({})).toBeNull();
  });
});

describe("graphics words", () => {
  it("has a word for every render state and names the record", () => {
    for (const status of RENDER_STATUS_ORDER) expect(RENDER_STATUS_WORDS[status].word).toMatch(/^[A-Z]/);
    expect(renderSubject({ vendor: { businessName: "Hearth Bakery" } })).toBe("Hearth Bakery");
    expect(renderSubject({ event: { title: "Emerge Holiday Market" }, market: { name: "Spokane Farmers' Market" } })).toBe(
      "Emerge Holiday Market"
    );
    expect(renderSubject({})).toBeNull();
    expect(scaleWord(2)).toBe("High, 2x");
    expect(scaleWord(4)).toBe("4x");
  });
});
