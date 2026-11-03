import { describe, expect, it } from "vitest";
import { coreTitle, titleOverlap, titleWords } from "./normalize-title";

describe("coreTitle", () => {
  it.each([
    ["11th Annual Rebel Junk Holiday Market", "rebel junk holiday market"],
    ["Fall Holistic Festival 2026", "fall holistic festival"],
    ["The Fall First Look Bridal Show", "fall first look bridal show"],
    ["Holiday Bazaar (Trinity Lutheran Church)", "holiday bazaar"],
    ["It’s Not Your Grandma‘s Craft Fair", "its not your grandmas craft fair"],
    ["Northwest's Premier Bridal Festival", "northwests premier bridal festival"],
    ["Spokane Home & Yard Show", "spokane home and yard show"],
    ["  Emerson-Garfield Farmers Market ", "emerson garfield farmers market"],
    ["33 Artists Market: Small Business Saturday", "33 artists market small business saturday"],
  ])("%s -> %s", (title, core) => {
    expect(coreTitle(title)).toBe(core);
  });

  it("keeps a parenthesis that is not at the end", () => {
    expect(coreTitle("Market (North) Days")).toBe("market north days");
  });
});

describe("titleOverlap", () => {
  it("measures shared words against the shorter title, ignoring stop words", () => {
    expect(titleOverlap("Holiday Bazaar in Cheney", "Holiday Bazaar (Cheney United Methodist Church)")).toBe(1);
    expect(titleOverlap("Cheney Blackhawk Boosters Craft Fair", "Cheney Blackhawk Booster Club Craft Fair")).toBe(0.8);
    expect(titleOverlap("Cabin Fever Market (Kootenai County Farmers' Market)", "Autumn Indoor Market")).toBeCloseTo(1 / 3);
    expect(titleOverlap("North Idaho's Cowboy Christmas", "Winter Market (Kootenai County Farmers' Market)")).toBe(0);
    expect(titleWords("Taste of Coeur D Alene 2026")).toEqual(new Set(["taste", "coeur", "d", "alene"]));
  });
});
