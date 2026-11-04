import { describe, expect, it } from "vitest";
import {
  clearErrors,
  sectionOf,
  statusSentence,
  autoSlug,
  backTarget,
  carryParams,
  changedFields,
  comingSaturday,
  dayProblems,
  daysFromEvent,
  daysFromSubmission,
  detailsFromRow,
  emptyDetails,
  filledDetailCount,
  fixCapitals,
  isShouting,
  isWebAddress,
  makeDay,
  normalizeLink,
  pickChanges,
  proposeDailyHours,
  railWeekKey,
  repeatedDates,
  savedAgo,
  timeChoices,
  unsavedLabel,
  weekendOf,
  weekendSentence,
  EMPTY_PLACE,
  type EditorValues,
} from "./model";

function values(overrides: Partial<EditorValues> = {}): EditorValues {
  return {
    title: "North Idaho's Cowboy Christmas",
    slug: "north-idahos-cowboy-christmas-2026-12-12",
    description: "",
    days: [makeDay("2026-12-12", "10:00", "16:00")],
    venueId: "v1",
    place: EMPTY_PLACE,
    marketId: "",
    imageUrl: "",
    showImageInList: true,
    imageFocalX: 50,
    imageFocalY: 50,
    tagIds: ["t1", "t2"],
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
    status: "PENDING",
    ...overrides,
  };
}

describe("changedFields", () => {
  it("is empty for the same values, even with new row keys and reordered tags", () => {
    const a = values();
    const b = values({ days: [makeDay("2026-12-12", "10:00", "16:00")], tagIds: ["t2", "t1"] });
    expect(changedFields(a, b, "event")).toEqual([]);
  });

  it("names each changed field, and each detail on its own", () => {
    const a = values();
    const b = values({ title: "Cowboy Christmas", details: { ...emptyDetails(), parkingSummary: "Free lot", petPolicy: "ALLOWED" } });
    expect(changedFields(a, b, "event")).toEqual(["title", "details.parkingSummary", "details.petPolicy"]);
  });

  it("ignores the times of an all-day row", () => {
    const a = values({ days: [makeDay("2026-12-12", "", "", true)] });
    const b = values({ days: [{ ...makeDay("2026-12-12", "10:00", "16:00"), allDay: true }] });
    expect(changedFields(a, b, "event")).toEqual([]);
  });

  it("leaves out fields a submission does not have", () => {
    const a = values();
    const b = values({ slug: "other", complianceNotes: "note", place: { ...EMPTY_PLACE, zip: "99201" } });
    expect(changedFields(a, b, "submission")).toEqual(["place"]);
  });
});

describe("pickChanges and unsavedLabel", () => {
  it("picks only the changed values and groups the details", () => {
    const v = values({ details: { ...emptyDetails(), parkingSummary: "Free lot" } });
    expect(pickChanges(v, ["title", "details.parkingSummary"])).toEqual({ title: v.title, details: { parkingSummary: "Free lot" } });
  });

  it("counts in words", () => {
    expect(unsavedLabel(1)).toBe("1 unsaved change");
    expect(unsavedLabel(2)).toBe("2 unsaved changes");
  });
});

describe("autoSlug", () => {
  it("joins the title and the first date", () => {
    expect(autoSlug("North Idaho's Cowboy Christmas", "2026-12-12")).toBe("north-idahos-cowboy-christmas-2026-12-12");
  });

  it("falls back to 'event' and keeps within 120 characters", () => {
    expect(autoSlug("!!!", "2026-12-12")).toBe("event-2026-12-12");
    const slug = autoSlug("word ".repeat(60), "2026-12-12");
    expect(slug.length).toBeLessThanOrEqual(120);
    expect(slug.endsWith("-2026-12-12")).toBe(true);
    expect(slug).not.toMatch(/--/);
  });
});

describe("normalizeLink", () => {
  it("adds https to bare domains and upgrades http", () => {
    expect(normalizeLink("rebeljunk.com/tickets", "website")).toBe("https://rebeljunk.com/tickets");
    expect(normalizeLink("http://example.com", "website")).toBe("https://example.com");
    expect(normalizeLink("  ", "website")).toBe("");
  });

  it("turns handles into platform links", () => {
    expect(normalizeLink("@rebeljunk", "instagram")).toBe("https://instagram.com/rebeljunk");
    expect(normalizeLink("rebeljunk", "facebook")).toBe("https://facebook.com/rebeljunk");
    expect(normalizeLink("facebook.com/rebeljunk", "facebook")).toBe("https://facebook.com/rebeljunk");
  });

  it("isWebAddress accepts dotted hosts only", () => {
    expect(isWebAddress("https://example.com")).toBe(true);
    expect(isWebAddress("https://example")).toBe(false);
    expect(isWebAddress("")).toBe(true);
  });
});

describe("fixCapitals", () => {
  it("title-cases shouted places and keeps directions and states", () => {
    expect(fixCapitals("7217 W WESTBOW BLVD")).toBe("7217 W Westbow Blvd");
    expect(fixCapitals("SPOKANE")).toBe("Spokane");
    expect(fixCapitals("1ST AVE NE")).toBe("1st Ave NE");
    expect(isShouting("7217 W WESTBOW BLVD")).toBe(true);
    expect(isShouting("Spokane")).toBe(false);
    expect(isShouting("WA")).toBe(false);
  });
});

describe("details", () => {
  it("reads a row into form strings", () => {
    const details = detailsFromRow({
      indoorOutdoor: "INDOOR",
      expectedAttendance: 400,
      streetClosureImpact: false,
      vendorApplicationDeadline: new Date("2026-11-20T08:00:00.000Z"),
      parkingSummary: null,
    });
    expect(details.indoorOutdoor).toBe("INDOOR");
    expect(details.expectedAttendance).toBe("400");
    expect(details.streetClosureImpact).toBe("no");
    expect(details.vendorApplicationDeadline).toBe("2026-11-20");
    expect(details.parkingSummary).toBe("");
  });

  it("counts filled onboarding columns of 33", () => {
    expect(filledDetailCount({})).toBe(0);
    expect(
      filledDetailCount({ indoorOutdoor: "INDOOR", parkingSummary: " ", termsAttested: false, organizerPublicContact: true, paymentMethodsPublic: { cash: true }, productHighlights: {} })
    ).toBe(3);
  });
});

describe("daysFromEvent", () => {
  it("uses schedule days in date order", () => {
    const { days, stretch } = daysFromEvent({
      startDate: new Date("2026-12-12T18:00:00Z"),
      endDate: new Date("2026-12-14T00:00:00Z"),
      scheduleDays: [
        { date: new Date("2026-12-13T12:00:00Z"), startTime: "10:00", endTime: "16:00", allDay: false },
        { date: new Date("2026-12-12T12:00:00Z"), startTime: "00:00", endTime: "23:59", allDay: false },
      ],
    });
    expect(stretch).toBeNull();
    expect(days.map((d) => [d.date, d.allDay])).toEqual([
      ["2026-12-12", true],
      ["2026-12-13", false],
    ]);
  });

  it("makes one row for a single-day event without schedule days", () => {
    const { days } = daysFromEvent({ startDate: new Date("2026-11-07T19:00:00Z"), endDate: new Date("2026-11-08T00:00:00Z"), scheduleDays: [] });
    expect(days.map((d) => [d.date, d.startTime, d.endTime])).toEqual([["2026-11-07", "11:00", "16:00"]]);
  });

  it("returns a stretch for a multi-day event with no daily hours", () => {
    const { days, stretch } = daysFromEvent({ startDate: new Date("2026-12-12T18:00:00Z"), endDate: new Date("2026-12-14T00:00:00Z"), scheduleDays: [] });
    expect(days).toEqual([]);
    expect(stretch).toEqual({ startDate: "2026-12-12", startTime: "10:00", endDate: "2026-12-13", endTime: "16:00" });
  });
});

describe("daysFromSubmission", () => {
  it("reads schedule days JSON", () => {
    const days = daysFromSubmission({
      scheduleDays: [{ date: "2027-07-17", startTime: "11:00", endTime: "19:00", allDay: false }],
      eventDate: "2027-07-17",
      eventTime: "11:00",
      endDate: null,
      endTime: null,
      allDay: false,
    });
    expect(days.map((d) => [d.date, d.startTime, d.endTime])).toEqual([["2027-07-17", "11:00", "19:00"]]);
  });

  it("spreads legacy multi-day fields over each date", () => {
    const days = daysFromSubmission({ scheduleDays: null, eventDate: "2027-07-17", eventTime: "11:00", endDate: "2027-07-18", endTime: "19:00", allDay: false });
    expect(days.map((d) => d.date)).toEqual(["2027-07-17", "2027-07-18"]);
  });
});

describe("schedule helpers", () => {
  it("flags rows that close before they open, or open at midnight", () => {
    expect(dayProblems(makeDay("2026-11-20", "10:00", "08:00"))).toEqual([{ kind: "error", message: "Closes before it opens." }]);
    expect(dayProblems(makeDay("2026-12-06", "00:00", "16:00"))).toEqual([{ kind: "check", message: "Opens at 12:00 am. Is this a midnight split?" }]);
    expect(dayProblems(makeDay("", "10:00", "16:00"))[0].kind).toBe("error");
    expect(dayProblems(makeDay("2026-12-06", "", "", true))).toEqual([]);
  });

  it("finds repeated dates", () => {
    expect([...repeatedDates([makeDay("2026-12-12", "10:00", "12:00"), makeDay("2026-12-12", "13:00", "16:00")])]).toEqual(["2026-12-12"]);
  });

  it("proposes daily hours from the stretch, or from stated hours", () => {
    const stretch = { startDate: "2026-12-12", startTime: "10:00", endDate: "2026-12-13", endTime: "16:00" };
    expect(proposeDailyHours(stretch).map((d) => [d.date, d.startTime, d.endTime])).toEqual([
      ["2026-12-12", "10:00", "16:00"],
      ["2026-12-13", "10:00", "16:00"],
    ]);
    const stated = [{ date: null, weekday: "Saturday", startTime: "09:00", endTime: "17:00" }];
    expect(proposeDailyHours(stretch, stated).map((d) => d.startTime)).toEqual(["09:00", "10:00"]);
  });

  it("offers times from 6:00 am round the clock, plus 11:59 pm", () => {
    const times = timeChoices();
    expect(times[0]).toBe("06:00");
    expect(times.at(-1)).toBe("23:59");
    expect(times).toContain("00:00");
    expect(new Set(times).size).toBe(times.length);
  });
});

describe("weekends", () => {
  it("files a schedule under the Saturday of its first upcoming date", () => {
    const days = [makeDay("2026-10-31", "10:00", "12:00"), makeDay("2026-12-11", "10:00", "12:00")];
    expect(weekendOf(days, null, "2026-11-03")).toBe("2026-12-12");
    expect(weekendOf([], { startDate: "2026-12-12", startTime: "10:00", endDate: "2026-12-13", endTime: "16:00" }, "2026-11-03")).toBe("2026-12-12");
    expect(weekendOf([], null, "2026-11-03")).toBeNull();
  });

  it("maps a Saturday onto the rail, Later after the last week", () => {
    const keys = ["2026-11-07", "2026-11-14", "later"];
    expect(railWeekKey("2026-11-14", keys)).toBe("2026-11-14");
    expect(railWeekKey("2027-01-09", keys)).toBe("later");
    expect(railWeekKey("2026-10-31", keys)).toBeNull();
  });

  it("says which weekend, and finds the coming Saturday", () => {
    expect(weekendSentence("2026-12-12", new Date("2026-11-03T18:00:00Z"))).toBe("Falls on the weekend of Dec 12.");
    expect(weekendSentence("2027-01-09", new Date("2026-11-03T18:00:00Z"))).toBe("Falls on the weekend of Jan 9, 2027.");
    expect(comingSaturday("2026-11-03")).toBe("2026-11-07");
    expect(comingSaturday("2026-11-07")).toBe("2026-11-07");
  });
});

describe("backTarget", () => {
  it("returns to To do with the decision", () => {
    expect(backTarget({ from: "todo", decision: "single:e1", mode: "event" })).toEqual({ href: "/admin?d=single%3Ae1", label: "Back to To do" });
  });

  it("returns to the filtered Events list", () => {
    expect(backTarget({ from: "events", rest: { q: "bridal", week: "2026-11-21" }, mode: "event" })).toEqual({
      href: "/admin/events?q=bridal&week=2026-11-21",
      label: "Back to Events",
    });
    expect(backTarget({ from: "events", back: "/admin/events?show=live", mode: "event" }).href).toBe("/admin/events?show=live");
  });

  it("names the record page it returns to", () => {
    expect(backTarget({ from: "markets", back: "/admin/markets/m1", mode: "event" })).toEqual({ href: "/admin/markets/m1", label: "Back to the market" });
    expect(backTarget({ from: "venues", back: "/admin/venues/v1", mode: "event" })).toEqual({ href: "/admin/venues/v1", label: "Back to the place" });
    expect(backTarget({ from: "vendors", back: "/admin/vendors/v1?page=2", mode: "event" })).toEqual({
      href: "/admin/vendors/v1?page=2",
      label: "Back to the vendor",
    });
  });

  it("names the list when it returns to one", () => {
    expect(backTarget({ from: "markets", mode: "event" })).toEqual({ href: "/admin/markets", label: "Back to Markets" });
    expect(backTarget({ from: "venues", back: "/admin/venues?view=duplicates", mode: "event" })).toEqual({
      href: "/admin/venues?view=duplicates",
      label: "Back to Venues",
    });
    expect(backTarget({ from: "vendors", back: "/admin/vendors/new", mode: "event" }).label).toBe("Back to Vendors");
    expect(backTarget({ from: "inbox", mode: "submission" })).toEqual({ href: "/admin/inbox?type=submissions", label: "Back to From the public" });
  });

  it("ignores a back address outside the admin", () => {
    expect(backTarget({ back: "https://evil.example", mode: "event" }).href).toBe("/admin/events");
    expect(backTarget({ back: "//evil.example", mode: "event" }).href).toBe("/admin/events");
    expect(backTarget({ mode: "submission" })).toEqual({ href: "/admin?lane=public", label: "Back to To do" });
  });

  it("carries where the owner came from", () => {
    expect(carryParams({ from: "todo", decision: "ready:2026-11-07" })).toBe("?from=todo&d=ready%3A2026-11-07");
    expect(carryParams({})).toBe("");
  });
});

describe("savedAgo", () => {
  it("speaks in minutes and hours, then gives up", () => {
    const now = Date.parse("2026-11-03T18:00:00Z");
    expect(savedAgo(now - 10_000, now)).toBe("Saved just now");
    expect(savedAgo(now - 2 * 60_000, now)).toBe("Saved 2 min ago");
    expect(savedAgo(now - 3 * 3_600_000, now)).toBe("Saved 3 hr ago");
    expect(savedAgo(now - 30 * 3_600_000, now)).toBeNull();
  });
});

describe("statusSentence", () => {
  it("says the saved status, or what saving does with a held one", () => {
    expect(statusSentence("PENDING", "PENDING")).toBe("Pending: waiting for your review");
    expect(statusSentence("PUBLISHED", "DRAFT")).toBe("When you save: moves to draft and comes off the site");
    expect(statusSentence("PENDING", "CANCELLED")).toBe("When you save: marked cancelled and stays off the site");
  });
});

describe("field errors", () => {
  it("finds the section of a field and of its parts", () => {
    expect(sectionOf("slug")).toBe("listing");
    expect(sectionOf("place.zip")).toBe("where");
    expect(sectionOf("details.petPolicy")).toBe("more-details");
    expect(sectionOf("vendorCapacity")).toBe("vendors");
  });

  it("drops the errors of the fields an edit touches, parts included", () => {
    const errors = { slug: "Taken.", "place.zip": "No ZIP.", "details.petPolicy": "Bad.", title: "Give it a title." };
    expect(clearErrors(errors, ["place", "details"])).toEqual({ slug: "Taken.", title: "Give it a title." });
    expect(clearErrors(errors, ["description"])).toBe(errors);
  });
});
