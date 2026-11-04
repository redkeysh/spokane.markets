import { describe, expect, it } from "vitest";
import { addressProblems, checkPlace, pinProblem, zipState } from "./place-check";

const place = (extra: Partial<Parameters<typeof checkPlace>[0]> = {}) => ({
  city: "Spokane",
  state: "WA",
  zip: "99201",
  lat: 47.6626,
  lng: -117.3511,
  ...extra,
});

describe("pinProblem", () => {
  it("flags the admin form's untouched default pin", () => {
    expect(pinProblem({ lat: 47.6588, lng: -117.426 })?.kind).toBe("default-pin");
  });

  it("flags a missing pin and 0, 0", () => {
    expect(pinProblem({ lat: null, lng: null })?.kind).toBe("no-pin");
    expect(pinProblem({ lat: 0, lng: 0 })?.kind).toBe("no-pin");
  });

  it("flags a pin outside the Spokane and North Idaho area", () => {
    expect(pinProblem({ lat: 40.7, lng: -74 })?.kind).toBe("outside-area");
  });

  it("passes a real pin in the area", () => {
    expect(pinProblem({ lat: 47.6626, lng: -117.3511 })).toBeNull();
  });
});

describe("addressProblems", () => {
  it("catches a town that disagrees with its ZIP", () => {
    expect(addressProblems(place({ zip: "99022" }))).toEqual([{ kind: "zip-town", message: "City Spokane, but ZIP 99022 is Medical Lake." }]);
  });

  it("accepts Spokane as the postal city of Spokane Valley ZIPs", () => {
    expect(addressProblems(place({ zip: "99216" }))).toEqual([]);
    expect(addressProblems(place({ city: "Spokane Valley", zip: "99216" }))).toEqual([]);
  });

  it("is tolerant of how the town is spelled", () => {
    expect(addressProblems(place({ city: "Post Falles", state: "ID", zip: "83854" }))).toEqual([]);
    expect(addressProblems(place({ city: "Coeur d' Alene", state: "Idaho", zip: "83814" }))).toEqual([]);
  });

  it("catches a state that disagrees with the ZIP or the town", () => {
    expect(addressProblems(place({ city: "Post Falls", state: "WA", zip: "83854" })).map((p) => p.kind)).toEqual(["zip-state"]);
    expect(addressProblems(place({ city: "Post Falls", state: "WA", zip: "" })).map((p) => p.kind)).toEqual(["town-state"]);
  });

  it("does not judge ZIPs and towns it does not know", () => {
    expect(addressProblems(place({ city: "Deer Park", zip: "99006" }))).toEqual([]);
  });
});

describe("checkPlace", () => {
  it("lists the pin first, then the address", () => {
    expect(checkPlace(place({ lat: 47.6588, lng: -117.426, zip: "99022" })).map((p) => p.kind)).toEqual(["default-pin", "zip-town"]);
  });

  it("knows the state of a ZIP", () => {
    expect(zipState("99201")).toBe("WA");
    expect(zipState("83814-1234")).toBe("ID");
    expect(zipState("9920")).toBeNull();
  });
});
