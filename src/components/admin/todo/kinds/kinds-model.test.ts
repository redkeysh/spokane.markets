import { describe, expect, it } from "vitest";
import { editorHref } from "../decision-model";
import { changeCount, editsPayload } from "../held-edits";
import type { Decision, TodoEvent } from "../types";
import { combinedChanges, combineRows, defaultChoices, resultLine } from "./combine-model";
import { factChips, proposeHours, removeSentence } from "./facts-model";
import { addressFixes, addressSentence, proposedSlug, seriesSummary } from "./series-model";

function todoEvent(id: string, overrides: Partial<TodoEvent> = {}): TodoEvent {
  return {
    id,
    title: "Kendall Yards Christmas Market",
    slug: `kendall-yards-night-market-${id}`,
    status: "PENDING",
    dates: ["2026-11-27"],
    firstDate: "2026-11-27",
    startLabel: "Fri 12 pm",
    when: ["Fri Nov 27, 12:00 to 4:00 pm"],
    whenShort: "Fri 12:00 to 4:00 pm",
    dateRange: "Fri Nov 27",
    startIso: "2026-11-27T20:00:00.000Z",
    endIso: "2026-11-28T00:00:00.000Z",
    scheduleDays: [{ date: "2026-11-27", startTime: "12:00", endTime: "16:00", allDay: false }],
    venue: { id: "kys", name: "Kendall Yards (Summit Parkway)", address: "1335 W Summit Pkwy", city: "Spokane", state: "WA", zip: "99201", neighborhood: null, archived: false },
    area: "Spokane",
    description: "Christmas market in a heated tent. Admission is free. Vendor applications are closed.",
    importerNote: false,
    imageUrl: null,
    pictureIsPage: false,
    links: [
      { kind: "website", href: "https://kendallnightmarket.org/winter-festival", label: "kendallnightmarket.org/winter-festival" },
      { kind: "facebook", href: "https://www.facebook.com/KendallYardsNightMarket/", label: "facebook.com/KendallYardsNightMarket" },
    ],
    tags: [
      { id: "t-craft", name: "Craft Fair" },
      { id: "t-holiday", name: "Holiday Market" },
    ],
    features: [
      { id: "f-outdoor", name: "Outdoor" },
      { id: "f-music", name: "Live Music" },
      { id: "f-kids", name: "Kid-Friendly" },
      { id: "f-free", name: "Free Admission" },
    ],
    marketName: "Kendall Yards Night Market",
    vendorApplicationState: null,
    feeModelVendor: null,
    origin: "Import of Nov 2 (47 events)",
    notifies: null,
    blocking: [],
    warnings: [],
    ...overrides,
  };
}

describe("series web addresses", () => {
  it("proposes the address the title gives, dropping a trailing year", () => {
    expect(proposedSlug("Kendall Yards Christmas Market", "2026-11-27")).toBe("kendall-yards-christmas-market-2026-11-27");
    expect(proposedSlug("Family Fall Festival 2027", "2027-10-16")).toBe("family-fall-festival-2027-10-16");
    expect(proposedSlug("Spokane Farmers' Market", "2026-11-07")).toBe("spokane-farmers-market-2026-11-07");
  });

  it("lists only the dates whose address names another event, and says whether changing them is safe", () => {
    const fixes = addressFixes([
      { id: "a", title: "Kendall Yards Christmas Market", slug: "kendall-yards-night-market-2026-11-27", status: "PENDING", date: "2026-11-27" },
      { id: "b", title: "Kendall Yards Christmas Market", slug: "kendall-yards-night-market-2026-11-28", status: "PENDING", date: "2026-11-28" },
      { id: "c", title: "A Very Merry Market", slug: "a-very-merry-market-2026-12-04", status: "PENDING", date: "2026-12-04" },
    ]);
    expect(fixes.map((f) => [f.eventId, f.to])).toEqual([
      ["a", "kendall-yards-christmas-market-2026-11-27"],
      ["b", "kendall-yards-christmas-market-2026-11-28"],
    ]);
    expect(addressSentence(fixes)).toBe(
      "Web addresses say kendall-yards-night-market-2026-11-27. Change them to kendall-yards-christmas-market-2026-11-27 and the other date. Safe: none is live yet."
    );
    expect(addressSentence([{ ...fixes[0], live: true }])).toBe(
      "Its web address says kendall-yards-night-market-2026-11-27. Change it to kendall-yards-christmas-market-2026-11-27. The old address keeps working for visitors who saved it."
    );
  });
});

describe("what a series shares", () => {
  it("says what is the same on every date, and that none has a picture", () => {
    const events = ["1", "2", "3", "4", "5", "6"].map((id) => todoEvent(id));
    expect(seriesSummary(events)).toEqual({
      same: "Same on all 6: description, tags Craft Fair and Holiday Market, features Outdoor, Live Music, Kid-Friendly, Free Admission, website and Facebook. No picture on any.",
      differs: null,
      withPicture: 0,
    });
  });

  it("says what differs", () => {
    const summary = seriesSummary([todoEvent("1"), todoEvent("2", { description: "Other words.", imageUrl: "/uploads/a.webp" })]);
    expect(summary.differs).toBe("Not the same on every date: description and picture.");
    expect(summary.withPicture).toBe(1);
    expect(summary.same).toMatch(/^Same on both: tags/);
  });
});

describe("pick field by field", () => {
  const one = todoEvent("one", {
    title: "11th Annual Rebel Junk Holiday Market",
    whenShort: "Fri 6:00 pm to Sat 4:00 pm",
    startIso: "2026-11-07T02:00:00.000Z",
    scheduleDays: [
      { date: "2026-11-06", startTime: "18:00", endTime: "21:00", allDay: false },
      { date: "2026-11-07", startTime: "10:00", endTime: "16:00", allDay: false },
    ],
    description: "Friday admission $10 plus fee and includes Saturday; Saturday $5 plus fee; children 12 and under free.",
    tags: [
      { id: "holiday", name: "Holiday Market" },
      { id: "flea", name: "Flea Market" },
    ],
    features: [
      { id: "indoor", name: "Indoor" },
      { id: "beer", name: "Beer/Wine/Cider" },
      { id: "music", name: "Live Music" },
    ],
    links: [{ kind: "website", href: "https://rebeljunk.com/tickets", label: "rebeljunk.com/tickets" }],
  });
  const two = todoEvent("two", {
    title: "Rebel Junk Holiday Market",
    whenShort: "Fri 5:30 pm to Sat 4:00 pm",
    startIso: "2026-11-07T01:30:00.000Z",
    scheduleDays: [
      { date: "2026-11-06", startTime: "17:30", endTime: "21:00", allDay: false },
      { date: "2026-11-07", startTime: "10:00", endTime: "16:00", allDay: false },
    ],
    description: "Ticket prices had not been announced at the time of this run; children 12 and under are free.",
    importerNote: true,
    tags: [
      { id: "craft", name: "Craft Fair" },
      { id: "holiday", name: "Holiday Market" },
      { id: "flea", name: "Flea Market" },
    ],
    features: [
      { id: "ada", name: "ADA Accessible" },
      { id: "parking", name: "Free Parking" },
    ],
    links: [
      { kind: "website", href: "https://rebeljunk.com/markets/holiday-market", label: "rebeljunk.com/markets/holiday-market" },
      { kind: "facebook", href: "https://facebook.com/rebeljunk", label: "facebook.com/rebeljunk" },
    ],
  });
  const events = [one, two];

  it("offers radios only for the fields that differ, with Both for tags and features", () => {
    const rows = combineRows(events, 0);
    expect(rows.map((r) => r.field)).toEqual(["title", "when", "about", "tags", "has", "links"]);
    expect(rows.find((r) => r.field === "tags")!.options.map((o) => o.label)).toEqual(["1", "2", "Both"]);
    expect(rows.find((r) => r.field === "when")!.note).toBe("Times differ. The earlier start is chosen.");
  });

  it("defaults to the useful description, the earlier start, both sets of tags and features and the copy with more links", () => {
    expect(defaultChoices(events, 0)).toEqual({ title: 0, when: 1, where: 0, about: 0, tags: "all", has: "all", links: 1, picture: 0 });
  });

  it("writes the choices to the kept copy and reads them back as the Result line", () => {
    const choices = defaultChoices(events, 0);
    const changes = combinedChanges(events, 0, choices);
    expect(changes).toEqual({
      scheduleDays: [
        { date: "2026-11-06", allDay: false, startTime: "17:30", endTime: "21:00" },
        { date: "2026-11-07", allDay: false, startTime: "10:00", endTime: "16:00" },
      ],
      tagIds: ["holiday", "flea", "craft"],
      featureIds: ["indoor", "beer", "music", "ada", "parking"],
      websiteUrl: "https://rebeljunk.com/markets/holiday-market",
      facebookUrl: "https://facebook.com/rebeljunk",
    });
    expect(resultLine(events, 0, choices)).toBe('Result: "11th Annual Rebel Junk Holiday Market", Fri 5:30 pm to Sat 4:00 pm, 3 tags, 5 features.');
    expect(combinedChanges(events, 0, { ...choices, when: 0, tags: 0, has: 0, links: 0 })).toEqual({});
  });

  it("does not take hours from a copy stored as one stretch", () => {
    const stretch = { ...two, scheduleDays: [] };
    const when = combineRows([one, stretch], 0).find((r) => r.field === "when")!;
    expect(when.options[1].disabled).toBe("No daily hours to take");
    expect(defaultChoices([one, stretch], 0).when).toBe(0);
  });

  it("always lets the kept copy keep its own hours", () => {
    const stretch = { ...one, scheduleDays: [] };
    const when = combineRows([stretch, two], 0).find((r) => r.field === "when")!;
    expect(when.options.map((o) => o.disabled)).toEqual([undefined, undefined]);
    expect(combineRows([two, stretch], 0).find((r) => r.field === "when")!.options[1].disabled).toBe("No daily hours to take");
    expect(combinedChanges([stretch, two], 0, { ...defaultChoices([stretch, two], 0), when: 0 }).scheduleDays).toBeUndefined();
  });
});

describe("found in the text, in a decision pane", () => {
  const features = [
    { id: "f-free", name: "Free Admission" },
    { id: "f-indoor", name: "Indoor" },
  ];
  const cowboy = todoEvent("cowboy", {
    title: "North Idaho's Cowboy Christmas",
    dates: ["2026-12-12", "2026-12-13"],
    startIso: "2026-12-12T18:00:00.000Z",
    endIso: "2026-12-14T00:00:00.000Z",
    scheduleDays: [],
    description:
      "Western-themed holiday gift market at the Kootenai County Fairgrounds, with free Santa photos in Building 2. Admission not published. Vendor applications open.",
    features: [{ id: "f-indoor", name: "Indoor" }],
  });

  it("offers the spec's chips for North Idaho's Cowboy Christmas", () => {
    const chips = factChips(cowboy, { description: null, featureIds: null, details: {}, days: null }, features);
    expect(chips.map((c) => c.label)).toEqual(["Vendor applications: open", 'Remove "Admission not published."']);
  });

  it("presses a vendor chip once its value is held, and drops a removed sentence", () => {
    const description = removeSentence(cowboy.description!, "Admission not published.");
    expect(description).toBe(
      "Western-themed holiday gift market at the Kootenai County Fairgrounds, with free Santa photos in Building 2. Vendor applications open."
    );
    const chips = factChips(cowboy, { description, featureIds: null, details: { vendorApplicationState: "OPEN" }, days: null }, features);
    expect(chips).toEqual([{ key: "vendor-applications-0", label: "Vendor applications: open", kind: "details", details: { vendorApplicationState: "OPEN" }, pressed: true }]);
  });

  it("offers Free Admission only when the event lacks it", () => {
    const free = todoEvent("free", { description: "Free admission.", features: [] });
    expect(factChips(free, { description: null, featureIds: null, details: {}, days: null }, features)[0]).toMatchObject({ kind: "feature", featureId: "f-free" });
    expect(factChips(free, { description: null, featureIds: ["f-free"], details: {}, days: null }, features)).toEqual([]);
  });

  it("leaves out vendor chips whose value the event already has, and counts each vendor setting it changes", () => {
    const booths = todoEvent("booths", {
      description: "Vendor applications open; booths are $50 per day.",
      features: [],
      vendorApplicationState: "OPEN",
      feeModelVendor: null,
    });
    const empty = { description: null, featureIds: null, details: {}, days: null };
    expect(factChips(booths, empty, features).map((c) => c.label)).toEqual(["Booth fee: $50 per day"]);
    expect(factChips({ ...booths, vendorApplicationState: null, feeModelVendor: "$50 per day" }, empty, features).map((c) => c.label)).toEqual([
      "Vendor applications: open",
    ]);

    const fresh = { ...booths, vendorApplicationState: null };
    const both = { details: { vendorApplicationState: "OPEN" as const, feeModelVendor: "$50 per day" } };
    expect(changeCount(fresh, both)).toBe(2);
    expect(editsPayload(fresh, both)).toEqual({ details: { vendorApplicationState: "OPEN", feeModelVendor: "$50 per day" } });
    expect(changeCount(booths, both)).toBe(1);
    expect(editsPayload(booths, both)).toEqual({ details: { feeModelVendor: "$50 per day" } });
    expect(changeCount({ ...booths, feeModelVendor: "$50 per day" }, both)).toBe(0);
  });

  it("splits a stretch into the hours the description states, Black Friday included", () => {
    const merry = todoEvent("merry", {
      dates: ["2026-11-27", "2026-11-28", "2026-11-29"],
      startIso: "2026-11-27T17:00:00.000Z",
      endIso: "2026-11-30T02:00:00.000Z",
      scheduleDays: [],
      description:
        "Holiday market, open Friday and Saturday 10am-7pm and Sunday 10am-6pm on four weekends from Black Friday through Dec 20. Black Friday opens at 9am.",
    });
    expect(proposeHours(merry)).toEqual({
      stated: true,
      days: [
        { date: "2026-11-27", allDay: false, startTime: "09:00", endTime: "19:00" },
        { date: "2026-11-28", allDay: false, startTime: "10:00", endTime: "19:00" },
        { date: "2026-11-29", allDay: false, startTime: "10:00", endTime: "18:00" },
      ],
    });
    const chips = factChips(merry, { description: null, featureIds: null, details: {}, days: null }, features);
    expect(chips.find((c) => c.kind === "hours")).toMatchObject({ label: "Use the hours it states" });
  });

  it("keeps the daily hours the description does not mention", () => {
    const weekend = todoEvent("weekend", {
      dates: ["2026-12-12", "2026-12-13"],
      scheduleDays: [
        { date: "2026-12-12", startTime: "09:00", endTime: "17:00", allDay: false },
        { date: "2026-12-13", startTime: "11:00", endTime: "15:00", allDay: false },
      ],
      description: "Holiday market, open Saturday 10am-4pm.",
    });
    expect(proposeHours(weekend)).toEqual({
      stated: true,
      days: [
        { date: "2026-12-12", allDay: false, startTime: "10:00", endTime: "16:00" },
        { date: "2026-12-13", allDay: false, startTime: "11:00", endTime: "15:00" },
      ],
    });
  });

  it("falls back to the stretch's own hours when the description states none", () => {
    expect(proposeHours(cowboy)).toEqual({
      stated: false,
      days: [
        { date: "2026-12-12", allDay: false, startTime: "10:00", endTime: "16:00" },
        { date: "2026-12-13", allDay: false, startTime: "10:00", endTime: "16:00" },
      ],
    });
  });
});

describe("opening a series in the editor", () => {
  it("opens the first date with every date chosen, and a single date without it", () => {
    const decision: Decision = {
      key: "series:market:m1",
      kind: "series",
      lane: "week:2026-11-28",
      title: "Kendall Yards Christmas Market, 6 dates",
      rows: [
        { type: "event", id: "e1" },
        { type: "event", id: "e2" },
      ],
      settles: ["e1", "e2"],
      primary: { label: "Publish 6 dates", action: "publish" },
    };
    expect(editorHref(decision)).toBe("/admin/events/e1?from=todo&d=series%3Amarket%3Am1&apply=all");
    expect(editorHref(decision, "e2")).toBe("/admin/events/e2?from=todo&d=series%3Amarket%3Am1");
  });
});
