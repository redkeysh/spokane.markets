import { describe, expect, it } from "vitest";
import { snapshotEvents, snapshotVenues } from "@/lib/admin/__fixtures__/snapshot";
import { findDuplicateGroups } from "@/lib/venues/match";
import { findTwins, pairKey, placeGroupIndex, type TwinRow } from "./twins";

/** The 12 same-event pairs across the two imports. */
const KNOWN_PAIRS = [
  ["Fall Holistic Festival 2026", "Fall Holistic Festival"],
  ["11th Annual Rebel Junk Holiday Market", "Rebel Junk Holiday Market"],
  ["Post Falls Holiday Craft Fair", "Holiday Craft Fair (Post Falls Parks & Recreation)"],
  ["Hillyard Senior Center Holiday Craft Bazaar", "Hillyard Senior Center Craft Bazaar"],
  ["Holiday Bazaar in Cheney", "Holiday Bazaar (Cheney United Methodist Church)"],
  ["The Fall First Look Bridal Show", "Fall First Look Bridal Show"],
  ["33 Artists Market", "33 Artists Market: Small Business Saturday"],
  ["Cheney Blackhawk Boosters Craft Fair", "Cheney Blackhawk Booster Club Craft Fair"],
  ["Spokane Valley Winter Market 2026", "Spokane Valley Winter Market"],
  ["The Bridal Festival", "Northwest's Premier Bridal Festival"],
  ["Spokane Golf & Travel Show with the Great Outdoors & Bike Expo", "Spokane Golf & Travel Show"],
  ["Spokane Home & Yard Show", "Custer's Spokane Home & Yard Show"],
];

const rows: TwinRow[] = snapshotEvents.map((e) => ({
  id: e.id,
  title: e.title,
  startDate: new Date(e.startDate),
  venueId: e.venue.id,
}));
const titleOf = new Map(snapshotEvents.map((e) => [e.id, e.title]));
const asTitles = (ids: string[]) => ids.map((id) => titleOf.get(id)).sort();

describe("findTwins on the snapshot", () => {
  const groups = placeGroupIndex(findDuplicateGroups(snapshotVenues.filter((v) => !v.deletedAt)));
  const result = findTwins(rows, groups);

  it("finds exactly the 12 known pairs", () => {
    expect(result.twins.map((p) => asTitles(p.ids))).toEqual(
      expect.arrayContaining(KNOWN_PAIRS.map((pair) => [...pair].sort()))
    );
    expect(result.twins).toHaveLength(12);
  });

  it("needs the duplicate place group for the Post Falls pair", () => {
    const without = findTwins(rows, new Map());
    expect(without.twins).toHaveLength(11);
    expect(without.twins.map((p) => asTitles(p.ids))).not.toContainEqual(
      ["Holiday Craft Fair (Post Falls Parks & Recreation)", "Post Falls Holiday Craft Fair"]
    );
  });

  it("calls same-day, same-place listings that share a word maybe twins", () => {
    expect(result.maybe.map((p) => asTitles(p.ids))).toEqual([
      ["Downtown Coeur d’Alene Street Fair", "Taste of Coeur D Alene 2026"],
      ["Autumn Indoor Market", "Cabin Fever Market (Kootenai County Farmers' Market)"],
    ]);
  });

  it("skips a pair marked as different events", () => {
    const rebel = result.twins.find((p) => asTitles(p.ids).includes("Rebel Junk Holiday Market"))!;
    const again = findTwins(rows, groups, [pairKey(rebel.ids[1], rebel.ids[0])]);
    expect(again.twins).toHaveLength(11);
  });
});

describe("findTwins start times", () => {
  const at = (id: string, iso: string): TwinRow => ({ id, title: "Holiday Craft Fair", startDate: new Date(iso), venueId: "v1" });

  it("offers matching titles hours apart on one day only as maybe twins", () => {
    const result = findTwins([at("a", "2026-11-07T17:00:00Z"), at("b", "2026-11-08T02:00:00Z")], new Map());
    expect(result.twins).toEqual([]);
    expect(result.maybe.map((p) => p.ids)).toEqual([["a", "b"]]);
  });

  it("pairs a start at 12:00 am with any time on the same day", () => {
    const result = findTwins([at("a", "2026-11-07T08:00:00Z"), at("b", "2026-11-08T02:00:00Z")], new Map());
    expect(result.twins.map((p) => p.ids)).toEqual([["a", "b"]]);
  });
});
