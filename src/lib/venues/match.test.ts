import { describe, expect, it } from "vitest";
import {
  baseNamesMatch,
  baseVenueName,
  findDuplicateGroups,
  isPossibleDuplicate,
  isSameVenue,
  namesLookAlike,
  namesMatch,
  normalizeVenueName,
  streetCore,
  type VenueLike,
} from "./match";

const v = (name: string, address: string, extra: Partial<VenueLike> = {}): VenueLike & { id: string } => ({
  id: `${name}|${address}`,
  name,
  address,
  city: "Spokane",
  zip: "99207",
  ...extra,
});

describe("normalization", () => {
  it("normalizes punctuation, ampersands, and a leading article", () => {
    expect(normalizeVenueName("The Scale House Market")).toBe("scale house market");
    expect(normalizeVenueName("Spokane County Fair & Expo Center")).toBe(
      normalizeVenueName("Spokane County Fair and Expo Ctr.")
    );
  });

  it("reduces an address to its street number and name", () => {
    expect(streetCore("4327 North Ash Street")).toBe("4327 n ash");
    expect(streetCore("4327 N Ash")).toBe("4327 n ash");
    expect(streetCore("404 N Havana St Suit 1")).toBe(streetCore("404 North Havana Street"));
    expect(streetCore("1622 E Wellesley Ave")).toBe(streetCore("1622 E Wellesley"));
  });
});

describe("name rules", () => {
  it("namesMatch accepts only near-identical names", () => {
    expect(namesMatch("St. Luke Lutheran Church", "St Luke Lutheran Church")).toBe(true);
    expect(namesMatch("Riverfront Park", "Spokane Pavilion at Riverfront Park")).toBe(false);
    expect(namesMatch("Convention Center", "Spokane Convention Center")).toBe(false);
  });

  it("namesLookAlike also accepts one name inside another", () => {
    expect(namesLookAlike("Kendall Yards", "Kendall Yards (Summit Parkway)")).toBe(true);
    expect(namesLookAlike("Riverfront Park", "Spokane Art School")).toBe(false);
  });

  it("baseVenueName drops a trailing qualifier", () => {
    expect(baseVenueName("Kendall Yards (Summit Parkway)")).toBe("kendall yards");
    expect(baseVenueName("Spokane Community College, The Lair")).toBe("spokane community college");
    expect(baseVenueName("Gonzaga University - Hemmingson Center")).toBe("gonzaga university");
    expect(baseVenueName("Spokane Pavilion at Riverfront Park")).toBe("spokane pavilion at riverfront park");
    expect(baseVenueName("(TBD)")).toBe("tbd");
  });

  it("baseNamesMatch compares names without their qualifiers", () => {
    expect(baseNamesMatch("Kendall Yards", "Kendall Yards (Summit Parkway)")).toBe(true);
    expect(baseNamesMatch("Spokane Community College, The Lair", "Spokane Community College")).toBe(true);
    expect(baseNamesMatch("Riverfront Park", "Spokane Pavilion at Riverfront Park")).toBe(false);
    expect(baseNamesMatch("Kendall Yards", "Kendall Yards Night Market")).toBe(false);
  });
});

describe("isSameVenue (automatic reuse)", () => {
  it("matches the same place typed differently", () => {
    expect(isSameVenue(v("Shadle Park High School", "4327 N Ash"), v("Shadle Park High School", "4327 North Ash Street"))).toBe(true);
    expect(
      isSameVenue(v("Shriners Event Center", "7217 W WESTBOW BLVD"), v("shriners event center", "7217 West Westbow Boulevard"))
    ).toBe(true);
  });

  it("does not fold a different venue at the same address into another", () => {
    expect(isSameVenue(v("Riverfront Park", "507 N Howard St"), v("Spokane Pavilion at Riverfront Park", "507 N Howard St"))).toBe(false);
  });

  it("does not match the same name in a different ZIP", () => {
    expect(isSameVenue(v("City Hall", "100 Main St"), v("City Hall", "100 Main St", { zip: "83854", city: "Post Falls" }))).toBe(false);
  });

  it("matches a mistyped address when the coordinates are the same spot", () => {
    const a = v("St. Gregorios Church", "1725 E Bridgeport Ave", { lat: 47.6838, lng: -117.3842 });
    const b = v("St Gregorios Church", "1735 E Bridgeport Ave", { lat: 47.68385, lng: -117.38425 });
    expect(isSameVenue(a, b)).toBe(true);
  });

  it("matches a name with a trailing qualifier at the same address", () => {
    expect(
      isSameVenue(
        v("Kendall Yards", "1335 W Summit Pkwy", { zip: "99201" }),
        v("Kendall Yards (Summit Parkway)", "1335 W Summit Pkwy", { zip: "99201" })
      )
    ).toBe(true);
    expect(
      isSameVenue(
        v("Spokane Community College", "1810 North Greene Street", { zip: "99217" }),
        v("Spokane Community College, The Lair", "1810 N Greene St", { zip: "99217" })
      )
    ).toBe(true);
  });

  it("does not match a qualified name at a different address", () => {
    expect(
      isSameVenue(v("Kendall Yards", "1335 W Summit Pkwy"), v("Kendall Yards (Olmsted Brothers Green)", "1101 W Summit Pkwy"))
    ).toBe(false);
  });

  it("keeps unrelated venues that share an address apart", () => {
    expect(
      isSameVenue(
        v("Spokane Convention Center", "334 W Spokane Falls Blvd", { zip: "99201" }),
        v("First Interstate Center for the Arts", "334 W Spokane Falls Blvd", { zip: "99201" })
      )
    ).toBe(false);
  });

  describe("same address typed with a different city and ZIP", () => {
    const keeper = v("Spokane County Fair & Expo Center", "404 N Havana St", {
      city: "Spokane Valley",
      zip: "99216",
      lat: 47.6626,
      lng: -117.3511,
    });
    const variant = (extra: Partial<VenueLike>) =>
      v("Spokane County Fair and Expo Center", "404 North Havana Street", { city: "Spokane", zip: "99202", ...extra });

    it("matches when both are geocoded nearby", () => {
      expect(isSameVenue(keeper, variant({ lat: 47.6641, lng: -117.3532 }))).toBe(true);
    });

    it("does not match without coordinates, since the city and ZIP both differ", () => {
      expect(isSameVenue(keeper, variant({}))).toBe(false);
    });

    it("does not match when the coordinates are far apart", () => {
      expect(isSameVenue(keeper, variant({ lat: 47.7, lng: -117.45 }))).toBe(false);
    });
  });
});

describe("isPossibleDuplicate (admin suggestions)", () => {
  it("suggests the same address under different names", () => {
    expect(isPossibleDuplicate(v("Riverfront Park", "507 N Howard St"), v("Spokane Pavilion at Riverfront Park", "507 N Howard St"))).toBe(true);
  });

  it("suggests the same name with a mistyped street number", () => {
    expect(isPossibleDuplicate(v("St. Luke Lutheran Church", "9706 N Division St"), v("St. Luke Lutheran Church", "9704 N Division St"))).toBe(true);
  });

  it("does not suggest unrelated venues", () => {
    expect(isPossibleDuplicate(v("Spokane Art School", "503 E 2nd Ave"), v("Spokane Art Supply", "1303 N Monroe St"))).toBe(false);
  });

  it("suggests the same address and name in another city and ZIP of the same postal area", () => {
    expect(
      isPossibleDuplicate(
        v("Spokane County Fair & Expo Center", "404 N Havana St", { city: "Spokane Valley", zip: "99216" }),
        v("Spokane County Fair and Expo Center", "404 N Havana St Suit 1", { city: "Spokane", zip: "99201" })
      )
    ).toBe(true);
  });

  it("does not suggest the same address and name across postal areas", () => {
    expect(isPossibleDuplicate(v("City Hall", "100 Main St"), v("City Hall", "100 Main St", { zip: "83854", city: "Post Falls" }))).toBe(false);
  });
});

describe("findDuplicateGroups", () => {
  it("groups duplicates transitively and leaves singletons out", () => {
    const venues = [
      v("Spokane Community College", "1810 North Greene Street"),
      v("Spokane Community College", "1810 N Greene St"),
      v("Spokane Community College, The Lair", "1810 N Greene St"),
      v("Spokane Art School", "503 E 2nd Ave"),
    ];
    const groups = findDuplicateGroups(venues);
    expect(groups).toHaveLength(1);
    expect(groups[0]).toHaveLength(3);
  });
});
