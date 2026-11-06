import { describe, expect, it } from "vitest";
import { snapshotEvents, SNAPSHOT_NOW } from "@/lib/admin/__fixtures__/snapshot";
import { pacificDate } from "@/lib/admin/format";
import { looksLikeTradeShow } from "./trade-shows";

/** The 17 waiting titles that read like trade shows, twins listed twice. */
const SPEC_TITLES = [
  "CardCon",
  "The Fall First Look Bridal Show",
  "Fall First Look Bridal Show",
  "Snow & ATV Show (Spokane Winter Knights)",
  "Coeur d'Alene Ski Swap",
  "The General Store Trading Card Show",
  "The Bridal Festival",
  "Northwest's Premier Bridal Festival",
  "Post Falls Bridal Tour & Special Event Fair",
  "Inland Northwest RV Show & Sale",
  "Spokane Boat Show",
  "Ag Expo 2027",
  "Spokane Golf & Travel Show with the Great Outdoors & Bike Expo",
  "Spokane Golf & Travel Show",
  "Spokane Home & Yard Show",
  "Custer's Spokane Home & Yard Show",
  "Spokane Expo 2027",
];

describe("looksLikeTradeShow", () => {
  it("flags the 17 waiting titles of the spec on the snapshot", () => {
    const today = pacificDate(SNAPSHOT_NOW);
    const waiting = snapshotEvents.filter(
      (e) => (e.status === "PENDING" || e.status === "DRAFT") && pacificDate(new Date(e.endDate)) >= today
    );
    const flagged = waiting.filter((e) => looksLikeTradeShow(e.title)).map((e) => e.title);
    expect(flagged).toHaveLength(17);
    expect([...flagged].sort()).toEqual([...SPEC_TITLES].sort());
  });

  it("also matches one past published listing, which never reaches a decision", () => {
    const others = snapshotEvents.filter((e) => looksLikeTradeShow(e.title) && !SPEC_TITLES.includes(e.title));
    expect(others.map((e) => [e.title, e.status])).toEqual([["Spokane Garden Expo", "PUBLISHED"]]);
  });

  it("matches whole words only", () => {
    expect(looksLikeTradeShow("Harvest Market")).toBe(false);
    expect(looksLikeTradeShow("Golfview Craft Fair")).toBe(false);
    expect(looksLikeTradeShow("Kendall Yards Christmas Market")).toBe(false);
    expect(looksLikeTradeShow("Fall Holistic Festival")).toBe(false);
    expect(looksLikeTradeShow("Spring RV and Camping Show")).toBe(true);
    expect(looksLikeTradeShow("Home and Yard Show")).toBe(true);
  });
});
