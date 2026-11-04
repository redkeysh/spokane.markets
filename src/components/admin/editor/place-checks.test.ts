import { describe, expect, it } from "vitest";
import { otherTownInName, placeChecks, type PlaceOption } from "./place-checks";

function place(overrides: Partial<PlaceOption> = {}): PlaceOption {
  return {
    id: "p1",
    name: "Kootenai County Fairgrounds",
    address: "4056 N Government Way",
    city: "Coeur d'Alene",
    state: "ID",
    zip: "83815",
    lat: 47.7,
    lng: -116.79,
    neighborhood: null,
    eventCount: 13,
    ...overrides,
  };
}

describe("otherTownInName", () => {
  it("names a town the place is not in", () => {
    expect(otherTownInName("Coeur d'Alene Park", "Spokane")).toBe("Coeur d'Alene");
  });

  it("stays quiet when the name matches the town, or one contains the other", () => {
    expect(otherTownInName("Spokane Convention Center", "Spokane")).toBeNull();
    expect(otherTownInName("Spokane County Fair & Expo Center", "Spokane Valley")).toBeNull();
    expect(otherTownInName("Spokane Valley Mall", "SPOKANE VALLEY")).toBeNull();
    expect(otherTownInName("Trailhead Event Center", "Post Falls")).toBeNull();
  });
});

describe("placeChecks", () => {
  it("is empty for a complete place with a real pin", () => {
    expect(placeChecks(place())).toEqual([]);
  });

  it("puts errors first: archived, then a missing address part", () => {
    const checks = placeChecks(place({ archived: true, zip: "" }));
    expect(checks.map((c) => c.kind)).toEqual(["error", "error"]);
    expect(checks[0].message).toBe("Kootenai County Fairgrounds is archived. Pick another place, or restore it first.");
    expect(checks[1].message).toBe("Can't publish yet: the place has no ZIP.");
  });

  it("notices the default downtown pin and a second listing of the place", () => {
    const checks = placeChecks(place({ lat: 47.6588, lng: -117.426 }), ["Trailhead Event Center"]);
    expect(checks.map((c) => c.message)).toEqual([
      "This place is still on the default downtown pin.",
      "This place is also listed as Trailhead Event Center.",
    ]);
    expect(checks[0].action).toEqual({ label: "Find on map", href: "/admin/venues/p1" });
    expect(checks[1].action?.href).toBe("/admin/venues?view=duplicates");
  });

  it("explains a place named for another town", () => {
    const checks = placeChecks(place({ name: "Coeur d'Alene Park", city: "Spokane", state: "WA", zip: "99204", lat: 47.64, lng: -117.42 }));
    expect(checks[0].message).toBe("Coeur d'Alene Park is in Spokane, not Coeur d'Alene.");
  });

  it("says when the town, ZIP or state disagree, the way Venues does", () => {
    const checks = placeChecks(place({ name: "Fairgrounds", city: "Spokane", state: "WA", zip: "99022", lat: 47.57, lng: -117.68 }));
    expect(checks.map((c) => c.message)).toEqual(["City Spokane, but ZIP 99022 is Medical Lake."]);
    expect(checks[0].action).toEqual({ label: "Fix the place", href: "/admin/venues/p1" });
  });

  it("notices a place with no pin, or a pin outside the area", () => {
    expect(placeChecks(place({ lat: null, lng: null })).map((c) => c.message)).toEqual(["This place has no spot on the map yet."]);
    expect(placeChecks(place({ lat: 40, lng: -100 })).map((c) => c.message)).toEqual(["This place's pin is outside the Spokane and North Idaho area."]);
  });
});
