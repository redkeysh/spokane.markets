import { describe, expect, it } from "vitest";
import { applyFixes, properCaseAddress, spellingFixes, tidyCity, tidyState } from "./tidy";

const place = (extra: Partial<Parameters<typeof spellingFixes>[0]> = {}) => ({
  name: "Shriners Event Center",
  address: "7217 W Westbow Blvd",
  city: "Spokane",
  state: "WA",
  zip: "99224",
  ...extra,
});

describe("spelling fixes", () => {
  it("fixes a shouted address and town", () => {
    expect(spellingFixes(place({ address: "7217 W WESTBOW BLVD", city: "SPOKANE" }))).toEqual([
      { field: "address", before: "7217 W WESTBOW BLVD", after: "7217 W Westbow Blvd" },
      { field: "city", before: "SPOKANE", after: "Spokane" },
    ]);
  });

  it("spells known towns the one right way", () => {
    expect(tidyCity("Post Falles")).toBe("Post Falls");
    expect(tidyCity("Coeur d' Alene")).toBe("Coeur d'Alene");
    expect(tidyCity("Couer D'Alene")).toBe("Coeur d'Alene");
    expect(tidyCity("DEER PARK")).toBe("Deer Park");
    expect(tidyCity("Deer Park")).toBe("Deer Park");
  });

  it("turns state names into their codes", () => {
    expect(tidyState("Wa")).toBe("WA");
    expect(tidyState("Idaho")).toBe("ID");
    expect(tidyState("washington")).toBe("WA");
    expect(tidyState("Oregon")).toBe("Oregon");
  });

  it("keeps directions upper case and ordinals lower case", () => {
    expect(properCaseAddress("1810 N GREENE ST")).toBe("1810 N Greene St");
    expect(properCaseAddress("12 E 2ND AVE")).toBe("12 E 2nd Ave");
    expect(properCaseAddress("4001 N O'MALLEY RD")).toBe("4001 N O'Malley Rd");
  });

  it("fixes the Suit typo and extra spaces, never a mixed-case address", () => {
    expect(spellingFixes(place({ address: "404 N Havana St Suit 1" }))).toEqual([
      { field: "address", before: "404 N Havana St Suit 1", after: "404 N Havana St Suite 1" },
    ]);
    expect(spellingFixes(place({ address: "S Perry St  between E 9th Ave & E 12th Ave" }))[0].after).toBe("S Perry St between E 9th Ave & E 12th Ave");
    expect(spellingFixes(place())).toEqual([]);
  });

  it("leaves a shouted name alone, since it may be a brand", () => {
    expect(spellingFixes(place({ name: "AMC THEATRES" }))).toEqual([]);
  });

  it("applies only the chosen fields", () => {
    expect(applyFixes(place({ address: "7217 W WESTBOW BLVD", city: "SPOKANE", state: "Wa" }), ["city", "state"])).toEqual({ city: "Spokane", state: "WA" });
  });
});
