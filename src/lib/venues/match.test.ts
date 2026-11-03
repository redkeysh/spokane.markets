import { describe, expect, it } from "vitest";
import {
  baseVenueName,
  DEFAULT_PIN,
  findDuplicateGroups,
  isPossibleDuplicate,
  isSameVenue,
  namesLookAlike,
  namesMatch,
  normalizeVenueName,
  qualifiedNameMatches,
  realCoords,
  streetCore,
  streetUnit,
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

  it("reads the unit after a suite or unit marker", () => {
    expect(streetUnit("404 N Havana St Suit 1")).toBe("1");
    expect(streetUnit("835 N Post St Suite 120")).toBe(streetUnit("835 N Post St Ste 120"));
    expect(streetUnit("404 N Havana St")).toBe("");
  });

  it("treats the admin form's untouched default pin as no location", () => {
    expect(realCoords(DEFAULT_PIN)).toBeNull();
    expect(realCoords({ lat: null, lng: -117.4 })).toBeNull();
    expect(realCoords({ lat: 47.6626, lng: -117.3511 })).toEqual({ lat: 47.6626, lng: -117.3511 });
  });
});

describe("name rules", () => {
  it("namesMatch accepts only near-identical names", () => {
    expect(namesMatch("St. Luke Lutheran Church", "St Luke Lutheran Church")).toBe(true);
    expect(namesMatch("Riverfront Park", "Spokane Pavilion at Riverfront Park")).toBe(false);
    expect(namesMatch("Convention Center", "Spokane Convention Center")).toBe(false);
  });

  it("namesMatch keeps names with different numbers apart", () => {
    expect(namesMatch("Spokane Valley Mall Food Court Suite 100", "Spokane Valley Mall Food Court Suite 200")).toBe(false);
    expect(namesMatch("Page 42 Bookstore", "The Page 42 Bookstore")).toBe(true);
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

  it("qualifiedNameMatches lets a qualified name match its plain base, one way only", () => {
    expect(qualifiedNameMatches("Kendall Yards (Summit Parkway)", "Kendall Yards")).toBe(true);
    expect(qualifiedNameMatches("Spokane Community College, The Lair", "Spokane Community College")).toBe(true);
    expect(qualifiedNameMatches("Kendall Yards", "Kendall Yards (Summit Parkway)")).toBe(false);
    expect(qualifiedNameMatches("River Park Square (Nordstrom)", "River Park Square (AMC Theatres)")).toBe(false);
    expect(qualifiedNameMatches("Spokane County Fair & Expo Center (East)", "Spokane County Fair & Expo Center West")).toBe(false);
    expect(qualifiedNameMatches("Riverfront Park", "Spokane Pavilion at Riverfront Park")).toBe(false);
    expect(qualifiedNameMatches("Kendall Yards", "Kendall Yards")).toBe(false);
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

  it("matches a qualified input to the plain existing venue at the same address", () => {
    expect(
      isSameVenue(
        v("Kendall Yards (Summit Parkway)", "1335 W Summit Pkwy", { zip: "99201" }),
        v("Kendall Yards", "1335 W Summit Pkwy", { zip: "99201" })
      )
    ).toBe(true);
    expect(
      isSameVenue(
        v("Spokane Community College, The Lair", "1810 N Greene St", { zip: "99217" }),
        v("Spokane Community College", "1810 North Greene Street", { zip: "99217" })
      )
    ).toBe(true);
  });

  it("does not let a plain input match a qualified existing venue", () => {
    expect(
      isSameVenue(v("NorthTown Mall", "4750 N Division St"), v("NorthTown Mall (Regal Cinemas)", "4750 N Division St"))
    ).toBe(false);
  });

  it("keeps different sub-venues at one address apart", () => {
    const pairs: [VenueLike, VenueLike][] = [
      [v("River Park Square (Nordstrom)", "808 W Main Ave"), v("River Park Square (AMC Theatres)", "808 W Main Ave")],
      [v("Spokane Community College (Building 7)", "1810 N Greene St"), v("Spokane Community College (The Lair)", "1810 N Greene St")],
      [v("Wonder Building, Suite 120", "835 N Post St Ste 120"), v("Wonder Building, Suite 210", "835 N Post St Ste 210")],
    ];
    for (const [a, b] of pairs) {
      expect(isSameVenue(a, b)).toBe(false);
      expect(isSameVenue(b, a)).toBe(false);
    }
  });

  it("keeps suites at one street address apart, but allows one side to omit the suite", () => {
    expect(isSameVenue(v("Spokane Art Supply", "1303 N Monroe St Ste 1"), v("Spokane Art Supply", "1303 N Monroe St Ste 2"))).toBe(false);
    expect(isSameVenue(v("Spokane Art Supply", "1303 N Monroe St Suite 1"), v("Spokane Art Supply", "1303 N Monroe St"))).toBe(true);
  });

  it("does not match a qualified name at a different address, even at the same spot", () => {
    const spot = { lat: 47.6683, lng: -117.4316 };
    expect(
      isSameVenue(v("Kendall Yards (Olmsted Brothers Green)", "1101 W Summit Pkwy"), v("Kendall Yards", "1335 W Summit Pkwy"))
    ).toBe(false);
    expect(
      isSameVenue(v("Kendall Yards (Olmsted Brothers Green)", "1101 W Summit Pkwy", spot), v("Kendall Yards", "1335 W Summit Pkwy", spot))
    ).toBe(false);
  });

  describe("the admin form's default pin", () => {
    const pin = { lat: DEFAULT_PIN.lat, lng: DEFAULT_PIN.lng };

    it("does not join same-named venues in different cities", () => {
      expect(
        isSameVenue(
          v("City Hall", "710 E Mullan Ave", { city: "Coeur d'Alene", zip: "83814", ...pin }),
          v("City Hall", "10210 E Sprague Ave", { city: "Spokane Valley", zip: "99206", ...pin })
        )
      ).toBe(false);
      expect(
        isSameVenue(
          v("City Hall", "100 Main St", { city: "Coeur d'Alene", zip: "83814", ...pin }),
          v("City Hall", "100 Main St", { city: "Spokane Valley", zip: "99206", ...pin })
        )
      ).toBe(false);
    });

    it("does not count as the same spot", () => {
      expect(
        isSameVenue(
          v("Spokane Farmers Market", "20 W 5th Ave", { zip: "99201", ...pin }),
          v("Spokane Valley Farmers Market", "2426 N Discovery Pl", { zip: "99201", ...pin })
        )
      ).toBe(false);
      expect(
        isPossibleDuplicate(
          v("Yoke's Fresh Market (Mead)", "14202 N Market St", { city: "Mead", zip: "99021", ...pin }),
          v("Yoke's Fresh Market (Spokane Valley)", "14715 E Sprague Ave", { city: "Spokane Valley", zip: "99216", ...pin })
        )
      ).toBe(false);
    });
  });

  it("never joins different cities by spot alone", () => {
    const spot = { lat: 47.6626, lng: -117.3511 };
    expect(
      isSameVenue(
        v("Spokane County Fair & Expo Center", "404 N Havana St", { city: "Spokane Valley", zip: "99216", ...spot }),
        v("Spokane County Fair & Expo Center", "400 N Havana St", { city: "Spokane", zip: "99202", ...spot })
      )
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

  it("still shows sub-venues at one address to an admin", () => {
    expect(
      isPossibleDuplicate(v("River Park Square (Nordstrom)", "808 W Main Ave"), v("River Park Square (AMC Theatres)", "808 W Main Ave"))
    ).toBe(true);
  });

  it("suggests a plain and a qualified name at one address in either order", () => {
    const plain = v("NorthTown Mall", "4750 N Division St");
    const qualified = v("NorthTown Mall (Regal Cinemas)", "4750 N Division St");
    expect(isPossibleDuplicate(plain, qualified)).toBe(true);
    expect(isPossibleDuplicate(qualified, plain)).toBe(true);
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
