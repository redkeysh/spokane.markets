import { describe, expect, it } from "vitest";
import {
  eventLocalDates,
  hasImporterNote,
  lastLocalDay,
  missingVenueParts,
  pictureIsWebPage,
  readiness,
  scheduleProblems,
  slugDisagreesWithTitle,
  type ReadinessContext,
  type ReadinessEvent,
} from "./readiness";

const venue = {
  id: "v1",
  name: "Kootenai County Fairgrounds",
  address: "4056 N Government Way",
  city: "Coeur d'Alene",
  state: "ID",
  zip: "83815",
  neighborhood: "cda",
  deletedAt: null,
};

const event = (overrides: Partial<ReadinessEvent> = {}): ReadinessEvent => ({
  status: "PENDING",
  title: "North Idaho's Cowboy Christmas",
  slug: "north-idahos-cowboy-christmas-2026-12-12",
  startDate: new Date("2026-12-12T18:00:00Z"),
  endDate: new Date("2026-12-14T00:00:00Z"),
  scheduleDays: [],
  imageUrl: "/uploads/event/a.webp",
  description: "Western-themed holiday gift market.",
  tagCount: 2,
  featureCount: 2,
  venue,
  ...overrides,
});

const context: ReadinessContext = { today: "2026-11-03" };
const flags = (e: ReadinessEvent, ctx: ReadinessContext = context) => {
  const r = readiness(e, ctx);
  return { ready: r.ready, blocking: r.blocking.map((i) => i.flag), warnings: r.warnings.map((i) => i.flag) };
};

describe("readiness", () => {
  it("blocks a multi-day event with no daily hours", () => {
    const r = readiness(event(), context);
    expect(r.ready).toBe(false);
    expect(r.blocking).toEqual([{ flag: "multi-day-no-hours", message: "Runs 2 days with no daily hours." }]);
  });

  it("passes the same event with daily hours", () => {
    const days = [
      { date: "2026-12-12", startTime: "10:00", endTime: "16:00", allDay: false },
      { date: "2026-12-13", startTime: "10:00", endTime: "16:00", allDay: false },
    ];
    expect(flags(event({ scheduleDays: days }))).toEqual({ ready: true, blocking: [], warnings: [] });
  });

  it("passes a one-day event without schedule days", () => {
    expect(flags(event({ startDate: new Date("2026-11-07T19:00:00Z"), endDate: new Date("2026-11-08T02:00:00Z") })).ready).toBe(true);
  });

  it("treats an end at 12:00 am as the end of the day before", () => {
    expect(lastLocalDay(new Date("2026-11-07T02:00:00Z"), new Date("2026-11-07T08:00:00Z"))).toBe("2026-11-06");
    expect(flags(event({ startDate: new Date("2026-11-07T02:00:00Z"), endDate: new Date("2026-11-07T08:00:00Z") })).ready).toBe(true);
  });

  it("blocks hours that close before they open and a day that opens at midnight", () => {
    const backwards = event({
      scheduleDays: [
        { date: "2026-11-20", startTime: "10:00", endTime: "08:00", allDay: false },
        { date: "2026-11-21", startTime: "10:00", endTime: "16:00", allDay: false },
      ],
    });
    expect(scheduleProblems(backwards)).toEqual([
      {
        flag: "closes-before-opens",
        message: "Fri Nov 20 closes at 8:00 am, before it opens at 10:00 am.",
        dates: ["2026-11-20"],
      },
    ]);
    const split = event({
      scheduleDays: [
        { date: "2026-12-05", startTime: "09:00", endTime: "23:59", allDay: false },
        { date: "2026-12-06", startTime: "00:00", endTime: "17:00", allDay: false },
      ],
    });
    expect(flags(split).blocking).toEqual(["opens-at-midnight"]);
    const allDay = event({ scheduleDays: [{ date: "2026-12-06", startTime: "00:00", endTime: "23:59", allDay: false }] });
    expect(flags(allDay).blocking).toEqual([]);
  });

  it("blocks an ended event, a non-waiting one, an archived place and a place without a ZIP", () => {
    expect(flags(event({ status: "PUBLISHED", scheduleDays: [{ date: "2026-12-12", startTime: "10:00", endTime: "16:00", allDay: false }] })).blocking).toEqual([
      "not-waiting",
    ]);
    expect(flags(event({ endDate: new Date("2026-11-02T20:00:00Z"), startDate: new Date("2026-11-02T18:00:00Z") })).blocking).toEqual(["ended"]);
    const r = readiness(
      event({ startDate: new Date("2026-11-07T19:00:00Z"), endDate: new Date("2026-11-08T02:00:00Z"), venue: { ...venue, zip: " ", deletedAt: new Date() } }),
      context
    );
    expect(r.blocking.map((i) => i.message)).toEqual(["Its place, Kootenai County Fairgrounds, is archived.", "Can't publish yet: no ZIP."]);
  });

  it("lists warnings that never block", () => {
    const r = flags(
      event({
        startDate: new Date("2026-11-07T19:00:00Z"),
        endDate: new Date("2026-11-08T02:00:00Z"),
        title: "Family Fall Festival 2027",
        slug: "rathdrum-craft-and-farmers-market-2027-10-16",
        imageUrl: null,
        tagCount: 0,
        featureCount: 0,
        description: "Ticket prices had not been announced at the time of this run.",
        venue: { ...venue, neighborhood: null },
      }),
      { today: "2026-11-03", duplicateVenueIds: new Set(["v1"]) }
    );
    expect(r).toEqual({
      ready: true,
      blocking: [],
      warnings: ["no-picture", "no-tags", "no-features", "importer-note", "slug-mismatch", "place-listed-twice", "no-neighborhood"],
    });
  });
});

describe("helpers", () => {
  it("lists the Pacific dates of an event, from a date on", () => {
    const e = { startDate: new Date("2026-11-06T02:00:00Z"), endDate: new Date("2026-11-08T00:00:00Z"), scheduleDays: [] };
    expect(eventLocalDates(e)).toEqual(["2026-11-05", "2026-11-06", "2026-11-07"]);
    expect(eventLocalDates(e, { from: "2026-11-06" })).toEqual(["2026-11-06", "2026-11-07"]);
  });

  it("spots importer notes, web-page pictures and slug disagreements", () => {
    expect(hasImporterNote("Free admission. Admission not published.")).toBe(true);
    expect(hasImporterNote("Free admission.")).toBe(false);
    expect(pictureIsWebPage("https://www.facebook.com/events/123")).toBe(true);
    expect(pictureIsWebPage("https://static.wixstatic.com/media/a.jpg")).toBe(false);
    expect(pictureIsWebPage("/uploads/event/a.webp")).toBe(false);
    expect(slugDisagreesWithTitle("Spokane Farmers' Market", "spokane-farmers-market-2026-11-07")).toBe(false);
    expect(slugDisagreesWithTitle("Fall Holistic Festival 2026", "fall-holistic-festival-2026-2026-11-07")).toBe(false);
    expect(slugDisagreesWithTitle("Kendall Yards Christmas Market", "kendall-yards-night-market-2026-11-27")).toBe(true);
    expect(missingVenueParts({ name: "Hall", address: "", city: "Spokane", state: "WA", zip: "" })).toEqual(["street", "ZIP"]);
  });
});
