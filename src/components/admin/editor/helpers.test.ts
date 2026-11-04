import { describe, expect, it, vi } from "vitest";
import { keepPickerKeys } from "./controls";
import { suggestionsFor } from "./found-in-text";
import { valuesFromJson } from "./json-paste-dialog";
import { blockingProblem, emptyDetails, makeDay, EMPTY_PLACE, type EditorValues } from "./model";
import { placeMatches } from "./place-picker";
import type { PlaceOption } from "./place-checks";
import { filledNow } from "./sections/more-details";
import { vendorSummary } from "./sections/vendors";
import { readinessItems } from "./side/readiness";
import { describeDays } from "./split-daily-hours";
import type { EditorOptions } from "./types";

function values(overrides: Partial<EditorValues> = {}): EditorValues {
  return {
    title: "Holiday Bazaar",
    slug: "",
    description: "",
    days: [makeDay("2026-11-07", "09:00", "15:00")],
    venueId: "v1",
    place: EMPTY_PLACE,
    marketId: "",
    imageUrl: "",
    showImageInList: true,
    imageFocalX: 50,
    imageFocalY: 50,
    tagIds: [],
    featureIds: [],
    websiteUrl: "",
    facebookUrl: "",
    instagramUrl: "",
    participationMode: "",
    vendorCapacity: "",
    publicIntentListEnabled: null,
    publicIntentNamesEnabled: null,
    publicRosterEnabled: null,
    details: emptyDetails(),
    complianceNotes: "",
    status: "DRAFT",
    ...overrides,
  };
}

function place(overrides: Partial<PlaceOption> = {}): PlaceOption {
  return { id: "v1", name: "Trinity Lutheran Church", address: "812 N 5th St", city: "Coeur d'Alene", state: "ID", zip: "83814", lat: 47.68, lng: -116.78, neighborhood: null, eventCount: 2, ...overrides };
}

const options: EditorOptions = {
  places: [place(), place({ id: "v2", name: "Kendall Yards", address: "1335 W Summit Pkwy", city: "Spokane", state: "WA", zip: "99201", eventCount: 9 }), place({ id: "v3", name: "Old Hall", archived: true })],
  markets: [{ id: "m1", name: "Kendall Yards Night Market", venueId: "v2" }],
  tags: [
    { id: "t1", name: "Craft Fair", slug: "craft-fair" },
    { id: "t2", name: "Holiday Market", slug: "holiday-market" },
  ],
  features: [
    { id: "f1", name: "Free Admission", slug: "free-admission", icon: null },
    { id: "f2", name: "Indoor", slug: "indoor", icon: null },
  ],
  alsoListedAs: {},
};

describe("blockingProblem", () => {
  const ctx = { mode: "event", hasStretch: false, placeIds: new Set(["v1", "v2"]) };

  it("passes a complete event", () => {
    expect(blockingProblem(values(), ctx)).toBeNull();
  });

  it("names the first problem, its section and its field", () => {
    expect(blockingProblem(values({ title: " " }), ctx)).toEqual({ text: "Give it a title.", section: "listing", field: "title" });
    expect(blockingProblem(values({ days: [makeDay("2026-11-07", "15:00", "09:00")] }), ctx)).toEqual({
      text: "Check the dates under When: Closes before it opens.",
      section: "when",
      field: "days",
    });
    expect(blockingProblem(values({ venueId: "" }), ctx)).toMatchObject({ section: "where", field: "venueId" });
    expect(blockingProblem(values({ websiteUrl: "no site" }), ctx)).toEqual({
      text: "Website must be a web address, such as example.com.",
      section: "links",
      field: "websiteUrl",
    });
  });

  it("points at the missing part of a new place", () => {
    const partial = { name: "Pavilion", address: "574 N Howard St", city: "Spokane", state: "WA", zip: "" };
    expect(blockingProblem(values({ venueId: "", place: partial }), ctx)?.field).toBe("place.zip");
    expect(blockingProblem(values({ place: { ...EMPTY_PLACE, name: "Pavilion" } }), { ...ctx, mode: "submission" })?.field).toBe("place.address");
  });

  it("checks only the fields being sent when told which changed", () => {
    const broken = values({ days: [makeDay("2026-11-20", "10:00", "08:00")], title: "Custer's Christmas" });
    expect(blockingProblem(broken, { ...ctx, changed: new Set(["description"]) })).toBeNull();
    expect(blockingProblem(broken, { ...ctx, changed: new Set(["days"]) })?.section).toBe("when");
    expect(blockingProblem(broken, ctx)?.section).toBe("when");
  });

  it("lets a one-stretch event save without rows, and a new place with every part", () => {
    expect(blockingProblem(values({ days: [] }), { ...ctx, hasStretch: true })).toBeNull();
    const newPlace = { name: "Pavilion", address: "574 N Howard St", city: "Spokane", state: "WA", zip: "99201" };
    expect(blockingProblem(values({ venueId: "", place: newPlace }), ctx)).toBeNull();
  });
});

describe("readinessItems", () => {
  it("lists what is missing, each pointing at its section", () => {
    const items = readinessItems(values(), options, { mode: "event", stretch: null });
    expect(items.map((i) => [i.label, i.state, i.section ?? null])).toEqual([
      ["Date and place", "Done", null],
      ["Daily hours", "Done", null],
      ["Picture", "Missing", "picture"],
      ["Tags", "Missing", "tags-and-features"],
      ["Features", "Missing", "tags-and-features"],
      ["Market", "None", null],
    ]);
  });

  it("knows a stretch with no daily hours, a web page for a picture and a place with no ZIP", () => {
    const items = readinessItems(
      values({ days: [], imageUrl: "https://www.facebook.com/events/1", tagIds: ["t1"], venueId: "v9", place: { ...EMPTY_PLACE, name: "X", address: "1 Main" } }),
      options,
      { mode: "event", stretch: { startDate: "2026-12-12", startTime: "10:00", endDate: "2026-12-13", endTime: "16:00" } }
    );
    const byLabel = Object.fromEntries(items.map((i) => [i.label, i.state]));
    expect(byLabel).toMatchObject({ "Date and place": "No city", "Daily hours": "Missing", Picture: "A web page", Tags: "1" });
  });
});

describe("valuesFromJson", () => {
  it("fills known keys and maps slugs to ids", () => {
    const { values: next, filled } = valuesFromJson(
      JSON.stringify({
        title: "Holiday Bazaar",
        tagSlugs: ["craft-fair", "nope"],
        featureIds: ["f2", "missing"],
        scheduleDays: [{ date: "2026-11-07", allDay: false, startTime: "09:00", endTime: "15:00" }],
        venueName: "Pavilion",
        venueAddress: "574 N Howard St",
        venueCity: "Spokane",
        venueState: "WA",
        venueZip: "99201",
        status: "PUBLISHED",
        vendorCapacity: 40,
        unknownKey: true,
      }),
      values(),
      options
    );
    expect(next.title).toBe("Holiday Bazaar");
    expect(next.tagIds).toEqual(["t1"]);
    expect(next.featureIds).toEqual(["f2"]);
    expect(next.days.map((d) => [d.date, d.startTime, d.endTime])).toEqual([["2026-11-07", "09:00", "15:00"]]);
    expect(next.venueId).toBe("");
    expect(next.place.name).toBe("Pavilion");
    expect(next.status).toBe("DRAFT");
    expect(next.vendorCapacity).toBe("40");
    expect(filled).toBeGreaterThan(5);
  });

  it("reads startDate and endDate when there are no schedule days, and refuses non-objects", () => {
    const { values: next } = valuesFromJson('{"startDate":"2026-11-07T09:00:00","endDate":"2026-11-07T15:00:00"}', values(), options);
    expect(next.days.map((d) => [d.date, d.startTime, d.endTime])).toEqual([["2026-11-07", "09:00", "15:00"]]);
    expect(() => valuesFromJson("[1]", values(), options)).toThrow("Paste one JSON object");
    expect(() => valuesFromJson("{", values(), options)).toThrow(SyntaxError);
  });
});

describe("suggestionsFor", () => {
  it("turns facts into chips that only change held values when applied", () => {
    const chips = suggestionsFor(
      [
        { kind: "free-admission", text: "Free admission" },
        { kind: "importer-note", sentence: "Admission not published." },
        { kind: "vendor-applications", state: "open", text: "Vendor applications open" },
        { kind: "admission-price", text: "$5" },
      ],
      { mode: "event", features: options.features }
    );
    expect(chips.map((c) => c.label)).toEqual([
      "Free admission: add Free Admission",
      'Remove "Admission not published."',
      "Vendor applications: open",
      "Admission: $5",
    ]);
    const v = values({ description: "Gift market. Admission not published. Vendor applications open." });
    expect(chips[0].apply!(v)).toEqual({ featureIds: ["f1"] });
    expect(chips[0].apply!(values({ featureIds: ["f1"] }))).toBeNull();
    expect(chips[1].apply!(v)).toEqual({ description: "Gift market. Vendor applications open." });
    expect(chips[2].apply!(v)?.details?.vendorApplicationState).toBe("OPEN");
    expect(chips[3].note).toBe(true);
  });

  it("leaves out vendor chips for a submission", () => {
    const chips = suggestionsFor([{ kind: "vendor-applications", state: "closed", text: "closed" }], { mode: "submission", features: [] });
    expect(chips).toEqual([]);
  });
});

describe("small summaries", () => {
  it("counts filled details after held edits", () => {
    const saved = emptyDetails();
    const now = { ...emptyDetails(), parkingSummary: "Free lot", petPolicy: "ALLOWED" };
    expect(filledNow(3, saved, now)).toBe(5);
    expect(filledNow(5, now, saved)).toBe(3);
  });

  it("summarizes the vendor settings", () => {
    const base = values();
    expect(vendorSummary(base, true)).toBe("Same as the market");
    expect(vendorSummary(base, false)).toBe("Site default: mark as attending");
    expect(vendorSummary({ ...base, participationMode: "REQUEST_TO_JOIN", vendorCapacity: "40" }, true)).toBe("Request to join, 40 spots");
  });

  it("describes proposed daily hours", () => {
    expect(describeDays([makeDay("2026-12-12", "10:00", "16:00"), makeDay("2026-12-13", "10:00", "16:00")])).toBe(
      "Sat 10:00 am to 4:00 pm and Sun 10:00 am to 4:00 pm"
    );
  });
});

describe("placeMatches", () => {
  it("shows the busiest active places for a short query, and name matches first", () => {
    expect(placeMatches(options.places, "").map((p) => p.id)).toEqual(["v2", "v1"]);
    expect(placeMatches(options.places, "kend").map((p) => p.id)).toEqual(["v2"]);
    expect(placeMatches(options.places, "coeur").map((p) => p.id)).toEqual(["v1"]);
    expect(placeMatches(options.places, "old hall")).toEqual([]);
  });
});

describe("keepPickerKeys", () => {
  class FakeSelect {}
  class FakeInput {
    constructor(readonly type: string) {}
  }
  vi.stubGlobal("HTMLSelectElement", FakeSelect);
  vi.stubGlobal("HTMLInputElement", FakeInput);

  function press(target: object, init: { altKey?: boolean; key?: string } = {}) {
    const stop = vi.fn();
    const event = { altKey: true, key: "ArrowDown", target, nativeEvent: { stopImmediatePropagation: stop }, ...init };
    keepPickerKeys(event as unknown as Parameters<typeof keepPickerKeys>[0]);
    return stop;
  }

  it("keeps Alt+Down and Alt+Up for selects and date fields", () => {
    expect(press(new FakeSelect())).toHaveBeenCalled();
    expect(press(new FakeInput("date"), { key: "ArrowUp" })).toHaveBeenCalled();
  });

  it("lets other keys and other fields through to the shortcuts", () => {
    expect(press(new FakeInput("text"))).not.toHaveBeenCalled();
    expect(press(new FakeSelect(), { altKey: false })).not.toHaveBeenCalled();
    expect(press(new FakeSelect(), { key: "ArrowLeft" })).not.toHaveBeenCalled();
  });
});
