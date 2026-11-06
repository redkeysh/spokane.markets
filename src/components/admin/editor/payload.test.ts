import { describe, expect, it } from "vitest";
import { DETAIL_FIELDS, type DetailField } from "./model";
import { FieldError, detailToColumn, editorPayloadSchema, issueField, refusalField, sharedPart, toEventWrite, toSubmissionDraft } from "./payload";

function parse(input: unknown) {
  const result = editorPayloadSchema.safeParse(input);
  if (!result.success) throw new Error(result.error.issues[0]?.message);
  return result.data;
}

const field = (key: string) => (DETAIL_FIELDS as readonly DetailField[]).find((f) => f.key === key)!;

describe("editorPayloadSchema", () => {
  it("normalizes links and refuses ones that are not web addresses", () => {
    expect(parse({ websiteUrl: "rebeljunk.com", instagramUrl: "@rebeljunk" })).toMatchObject({
      websiteUrl: "https://rebeljunk.com",
      instagramUrl: "https://instagram.com/rebeljunk",
    });
    expect(editorPayloadSchema.safeParse({ websiteUrl: "not a site" }).success).toBe(false);
  });

  it("needs times on days that are not all day, and a title when one is sent", () => {
    expect(editorPayloadSchema.safeParse({ days: [{ date: "2026-12-12", allDay: false, startTime: "10:00" }] }).success).toBe(false);
    expect(editorPayloadSchema.safeParse({ days: [{ date: "2026-12-12", allDay: true }] }).success).toBe(true);
    expect(editorPayloadSchema.safeParse({ title: "  " }).success).toBe(false);
    expect(editorPayloadSchema.safeParse({ days: [] }).success).toBe(false);
  });

  it("takes uploaded or linked pictures only", () => {
    expect(editorPayloadSchema.safeParse({ imageUrl: "/uploads/a.jpg" }).success).toBe(true);
    expect(editorPayloadSchema.safeParse({ imageUrl: "javascript:alert(1)" }).success).toBe(false);
  });
});

describe("toEventWrite", () => {
  it("splits fields, vendor settings and details from the status", () => {
    const write = toEventWrite(
      parse({
        title: "Cowboy Christmas",
        description: "  ",
        marketId: "",
        days: [
          { date: "2026-12-12", allDay: false, startTime: "10:00", endTime: "16:00", key: "c1" },
          { date: "2026-12-13", allDay: true },
        ],
        status: "CANCELLED",
        participationMode: "",
        vendorCapacity: "40",
        publicRosterEnabled: null,
        details: { petPolicy: "ALLOWED", expectedAttendance: "", streetClosureImpact: "yes" },
      })
    );
    expect(write.changes).toEqual({
      title: "Cowboy Christmas",
      description: null,
      marketId: null,
      scheduleDays: [
        { date: "2026-12-12", allDay: false, startTime: "10:00", endTime: "16:00" },
        { date: "2026-12-13", allDay: true },
      ],
      participationMode: null,
      vendorCapacity: 40,
      publicRosterEnabled: null,
      details: { petPolicy: "ALLOWED", expectedAttendance: null, streetClosureImpact: true },
    });
    expect(write.status).toBe("CANCELLED");
    expect(write.newPlace).toBeUndefined();
  });

  it("asks for a new place only when no place is chosen", () => {
    const place = { name: "Pavilion", address: "574 N Howard St", city: "Spokane", state: "WA", zip: "99201" };
    expect(toEventWrite(parse({ venueId: "", place })).newPlace).toEqual(place);
    expect(toEventWrite(parse({ venueId: "v1", place })).newPlace).toBeUndefined();
    expect(toEventWrite(parse({ venueId: "v1" })).changes.venueId).toBe("v1");
  });

  it("shares only the series fields", () => {
    const write = toEventWrite(parse({ title: "A", slug: "a-2026-12-12", description: "Same", tagIds: ["t1"], vendorCapacity: "5", details: { parkingSummary: "Lot" } }));
    expect(sharedPart(write)).toEqual({ description: "Same", tagIds: ["t1"], vendorCapacity: 5 });
  });
});

describe("detailToColumn", () => {
  it("checks each kind", () => {
    expect(detailToColumn(field("indoorOutdoor"), "OUTDOOR")).toBe("OUTDOOR");
    expect(() => detailToColumn(field("indoorOutdoor"), "SPACE")).toThrow();
    expect(() => detailToColumn(field("expectedAttendance"), "lots")).toThrow();
    expect(detailToColumn(field("vendorApplicationDeadline"), "2026-11-20")).toEqual(new Date("2026-11-21T07:59:59.999Z"));
    expect(detailToColumn(field("parkingSummary"), "  ")).toBeNull();
  });

  it("names the detail a bad value belongs to", () => {
    try {
      detailToColumn(field("expectedAttendance"), "lots");
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(FieldError);
      expect((err as FieldError).field).toBe("details.expectedAttendance");
    }
  });
});

describe("toSubmissionDraft", () => {
  it("keeps the place as text and drops what a submission has no column for", () => {
    const draft = toSubmissionDraft(
      parse({
        title: "Big Give",
        place: { name: "Shriners Event Center", address: "7217 W Westbow Blvd", city: "Spokane", state: "WA", zip: "99224" },
        days: [{ date: "2027-07-17", allDay: false, startTime: "11:00", endTime: "19:00" }],
        imageUrl: "",
        complianceNotes: "x",
        slug: "big-give",
      })
    );
    expect(draft).toEqual({
      eventTitle: "Big Give",
      venueName: "Shriners Event Center",
      venueAddress: "7217 W Westbow Blvd",
      venueCity: "Spokane",
      venueState: "WA",
      venueZip: "99224",
      scheduleDays: [{ date: "2027-07-17", allDay: false, startTime: "11:00", endTime: "19:00" }],
      imageUrl: null,
    });
  });
});

describe("error fields", () => {
  const issue = (input: unknown) => {
    const result = editorPayloadSchema.safeParse(input);
    if (result.success) throw new Error("expected a problem");
    return issueField(result.error);
  };

  it("names the field of the first validation issue", () => {
    expect(issue({ websiteUrl: "not a site" })).toBe("websiteUrl");
    expect(issue({ days: [] })).toBe("days");
    expect(issue({ place: { name: "x", address: "y", city: "z", state: "WA", zip: "12345678901" } })).toBe("place.zip");
    expect(issue({ vendorCapacity: "forty" })).toBe("vendorCapacity");
  });

  it("names the field of a refusal from the shared writes", () => {
    expect(refusalField("That venue does not exist or is archived.")).toBe("venueId");
    expect(refusalField("That market does not exist or is archived.")).toBe("marketId");
    expect(refusalField('"Emerge Holiday Market" already uses /events/emerge.')).toBe("slug");
    expect(refusalField("Another event already uses this web address.")).toBe("slug");
    expect(refusalField("Use lowercase letters, numbers and single hyphens, up to 120 characters.")).toBe("slug");
    expect(refusalField("Event not found or archived.")).toBeUndefined();
  });
});
