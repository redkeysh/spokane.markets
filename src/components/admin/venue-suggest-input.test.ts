import { describe, expect, it } from "vitest";
import { matchVenues, type VenueOption } from "./venue-suggest-input";

const venue = (id: string, name: string, address: string): VenueOption => ({
  id,
  name,
  address,
  city: "Spokane",
  state: "WA",
  zip: "99224",
});

const VENUES = [
  venue("1", "Spokane County Fair & Expo Center", "404 N Havana St"),
  venue("2", "Shriners Event Center", "7217 W Westbow Blvd"),
  venue("3", "The Shrine Hall", "100 Main St"),
];

describe("matchVenues", () => {
  it("ignores queries shorter than two characters", () => {
    expect(matchVenues(VENUES, "s")).toEqual([]);
  });

  it("matches by name case-insensitively, name-prefix matches first", () => {
    expect(matchVenues(VENUES, "SHRINERS").map((v) => v.id)).toEqual(["2"]);
    expect(matchVenues(VENUES, "shri").map((v) => v.id)).toEqual(["2", "3"]);
  });

  it("matches by street address", () => {
    expect(matchVenues(VENUES, "westbow").map((v) => v.id)).toEqual(["2"]);
  });
});
