import { describe, expect, it } from "vitest";
import { pairKey } from "@/lib/events/twins";
import { fixturePlace, fixturePlaces } from "./__fixtures__/places";
import {
  addressFormCost,
  addressMismatches,
  archivedInUse,
  defaultChoices,
  duplicateGroups,
  keepRecordChoices,
  mergePlan,
  mergeResultLine,
  pairKeys,
  planDuplicateGroup,
  spellingRows,
  unusedPlaces,
  type PlaceRecord,
} from "./place-review";

const places = fixturePlaces();
const groups = duplicateGroups(places);
const groupOf = (name: string) => groups.find((g) => g.records.some((r) => r.name === name))!;

describe("duplicate groups on the 2026-11-03 snapshot", () => {
  it("finds the 14 known groups plus the two the finder used to miss, as 15 groups of 34 records", () => {
    expect(groups).toHaveLength(15);
    expect(groups.reduce((n, g) => n + g.records.length, 0)).toBe(34);
    expect(groupOf("Spokane County Fair & Expo Center").records).toHaveLength(3);
    expect(groupOf("John R. Rogers High School").records.map((r) => r.name).sort()).toEqual(["John R. Rogers High School", "Rogers High School"]);
  });

  it("orders groups by the next event at them, so this weekend's come first", () => {
    const dates = groups.map((g) => g.next?.date ?? "9999");
    expect([...dates].sort()).toEqual(dates);
    expect(groups[0].next?.date).toBe("2026-11-07");
  });

  it("marks exactly the five safe groups: one street address, the extra record holds nothing", () => {
    expect(
      groups
        .filter((g) => g.safe)
        .map((g) => g.records[0].name)
        .sort()
    ).toEqual(["Millwood Community Presbyterian Church", "Mistequa Casino Hotel", "Post Falls City Hall", "Riverfront Park", "Spokane Convention Center"]);
  });

  it("marks groups whose street numbers differ, which are never safe", () => {
    const gregorios = groupOf("St. Gregorios Malankara Orthodox Syrian Church");
    expect(gregorios.addressesDiffer).toBe(true);
    expect(gregorios.safe).toBe(false);
    expect(groupOf("St. Luke Lutheran Church").addressesDiffer).toBe(true);
  });

  it("defaults to the record with the most listings for the name and the short address form", () => {
    const scc = groupOf("Spokane Community College");
    expect(scc.records[0].name).toBe("Spokane Community College, The Lair");
    expect(scc.records.find((r) => r.id === scc.defaults.address)!.address).toBe("1810 N Greene St");
    const expo = groupOf("Spokane County Fair & Expo Center");
    expect(expo.records.find((r) => r.id === expo.defaults.town)!.city).toBe("Spokane Valley");
  });

  it("keeps a neighborhood any record has", () => {
    const kendall = groupOf("Kendall Yards");
    expect(kendall.defaults.neighborhood).toBe("kendall-yards");
  });

  it("leaves out pairs the owner said are different", () => {
    const scc = groupOf("Spokane Community College");
    const different = new Set(pairKeys(scc.records.map((r) => r.id)));
    expect(duplicateGroups(places, { different })).toHaveLength(14);
  });
});

describe("mergePlan", () => {
  const scc = groupOf("Spokane Community College");

  it("runs the defaults as a merge into the record with the most listings", () => {
    const plan = mergePlan(scc.records, defaultChoices(scc));
    expect(plan.keepId).toBe(scc.records[0].id);
    expect(plan.mergeIds).toHaveLength(2);
    expect(plan.overrides).toEqual({});
  });

  it("keeps the record that already holds the chosen name and address, since no two places may share both", () => {
    const plain = scc.records.find((r) => r.name === "Spokane Community College" && r.address === "1810 N Greene St")!;
    const plan = mergePlan(scc.records, { ...defaultChoices(scc), name: plain.id, address: plain.id });
    expect(plan.keepId).toBe(plain.id);
    expect(plan.mergeIds).not.toContain(plain.id);
  });

  it("merges into the record chosen to keep, with its name, address and pin", () => {
    const withPins: PlaceRecord[] = scc.records.map((r, i) => ({ ...r, lat: 47.67 + i / 1000, lng: -117.36 }));
    for (const second of [withPins[1], withPins[2]]) {
      const plan = mergePlan(withPins, keepRecordChoices(defaultChoices(scc), second.id));
      expect(plan.keepId).toBe(second.id);
      expect(plan.mergeIds).toEqual(withPins.filter((r) => r.id !== second.id).map((r) => r.id));
      expect(plan.overrides.name).toBeUndefined();
      expect(plan.overrides.address).toBeUndefined();
      expect(plan.overrides.lat).toBeUndefined();
    }
  });

  it("keeps the chosen record when another record has the same name and address", () => {
    const one = fixturePlace("Riverfront Park");
    const two: PlaceRecord = { ...one, id: "twin-of-riverfront", zip: "99202" };
    const plan = mergePlan([one, two], keepRecordChoices({ keepId: one.id, name: one.id, address: one.id, town: one.id, neighborhood: one.neighborhood }, two.id));
    expect(plan.keepId).toBe(two.id);
    expect(plan.mergeIds).toEqual([one.id]);
  });

  it("carries the chosen address's pin and the chosen town", () => {
    const withPins: PlaceRecord[] = scc.records.map((r, i) => ({ ...r, lat: 47.67 + i / 1000, lng: -117.36 }));
    const long = withPins.find((r) => r.address === "1810 North Greene Street")!;
    const plan = mergePlan(withPins, { ...defaultChoices(scc), address: long.id });
    expect(plan.overrides).toMatchObject({ address: "1810 North Greene Street", lat: long.lat, lng: long.lng });
  });

  it("sets a neighborhood picked for the merged place", () => {
    expect(mergePlan(scc.records, { ...defaultChoices(scc), neighborhood: "north-spokane" }).overrides).toEqual({ neighborhood: "north-spokane" });
  });

  it("states the result before merging", () => {
    expect(mergeResultLine(scc.records, defaultChoices(scc))).toEqual({
      line: "Spokane Community College, The Lair, 1810 N Greene St, Spokane WA 99217",
      events: 3,
      markets: 0,
    });
  });
});

describe("the other place lists on the snapshot", () => {
  it("finds the 10 places nothing uses, 8 of them the empty half of a duplicate group", () => {
    const unused = unusedPlaces(places, groups);
    expect(unused).toHaveLength(10);
    expect(unused.filter((u) => u.duplicateOf)).toHaveLength(8);
    expect(unused.map((u) => u.place.name)).toEqual(expect.arrayContaining(["Mirabeau Point Park", "Trackside Studio Ceramic Art Gallery"]));
  });

  it("finds archived places an upcoming event or an active market uses", () => {
    expect(archivedInUse(places).map((p) => p.name)).toEqual(["University High School"]);
  });

  it("lists the safe spelling fixes of active places", () => {
    const rows = spellingRows(places);
    expect(rows.map((r) => r.place.name).sort()).toEqual([
      "Mead High School",
      "North Idaho College",
      "Q'emiln Park",
      "Shadle Park High School",
      "Shriners Event Center",
      "Spokane County Fair and Expo Center",
      "Uprise Brewing Co.",
    ]);
  });

  it("lists town and ZIP mismatches for a person to judge", () => {
    expect(addressMismatches(places).map((r) => [r.place.name, r.problems[0].message])).toEqual([
      ["Medical Lake Market", "City Spokane, but ZIP 99022 is Medical Lake."],
    ]);
  });

  it("prefers short postal forms and penalizes shouting", () => {
    expect(addressFormCost("1810 N Greene St")).toBeLessThan(addressFormCost("1810 North Greene Street"));
    expect(addressFormCost("7217 W Westbow Blvd")).toBeLessThan(addressFormCost("7217 W WESTBOW BLVD"));
    expect(addressFormCost("1622 E Wellesley Ave")).toBeLessThan(addressFormCost("1622 E Wellesley"));
    const rogers = groupOf("Rogers High School");
    expect(rogers.records.find((r) => r.id === rogers.defaults.address)!.address).toBe("1622 E Wellesley Ave");
  });

  it("plans a single group directly", () => {
    const plan = planDuplicateGroup([fixturePlace("Riverfront Park"), fixturePlace("Spokane Pavilion at Riverfront Park")]);
    expect(plan.key).toBe(`place-duplicates:${[fixturePlace("Riverfront Park").id, fixturePlace("Spokane Pavilion at Riverfront Park").id].sort().join("|")}`);
    expect(plan.safe).toBe(true);
    expect(pairKeys([plan.records[0].id, plan.records[1].id])).toEqual([pairKey(plan.records[0].id, plan.records[1].id)]);
  });
});
