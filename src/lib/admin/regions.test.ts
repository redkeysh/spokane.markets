import { describe, expect, it } from "vitest";
import { snapshotVenues } from "./__fixtures__/snapshot";
import { areaOf, compareTowns, findTown, stateOf, townName, townOrder } from "./regions";

describe("regions", () => {
  it("tolerates the spellings found in venue records", () => {
    expect(townName("SPOKANE")).toBe("Spokane");
    expect(townName("Post Falles")).toBe("Post Falls");
    expect(townName("Coeur d' Alene")).toBe("Coeur d'Alene");
    expect(townName("Coeur d’Alene")).toBe("Coeur d'Alene");
    expect(findTown("Nowhere")).toBeNull();
  });

  it("maps towns to areas and states", () => {
    expect(areaOf("Millwood")).toBe("Spokane Valley");
    expect(areaOf("Mead")).toBe("Spokane");
    expect(areaOf("Cheney")).toBe("Farther out");
    expect(areaOf("Hayden")).toBe("North Idaho");
    expect(areaOf("Bonners Ferry", "Idaho")).toBe("North Idaho");
    expect(areaOf("Deer Park", "WA")).toBe("Farther out");
    expect(stateOf("Rathdrum")).toBe("ID");
    expect(stateOf("Deer Park", "Wa")).toBe("WA");
  });

  it("orders towns along I-90, Washington before Idaho, unknown towns last", () => {
    const towns = ["Coeur d'Alene", "Spokane Valley", "Nowhere", "Cheney", "Post Falls", "Spokane", "Liberty Lake"];
    expect([...towns].sort(compareTowns)).toEqual(["Cheney", "Spokane", "Spokane Valley", "Liberty Lake", "Post Falls", "Coeur d'Alene", "Nowhere"]);
    expect(townOrder("Blanchard")).toBeGreaterThan(townOrder("Sprague"));
  });

  it("knows every town in the snapshot's places", () => {
    expect(snapshotVenues.filter((v) => !findTown(v.city)).map((v) => v.city)).toEqual([]);
  });
});
